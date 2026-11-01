// The admin area (PRD section 6) and what it reads: support codes, suspending, finding people,
// contact messages, error reports and the audit log.

import type { Before, UserRow } from '.';

export interface AdminUserRow extends UserRow {
  /** The latest use of any of their sessions. */
  last_active: number | null;
  teams: number;
}

export interface MessageRow {
  id: string;
  kind: 'contact' | 'feedback';
  name: string | null;
  email: string;
  user_id: string | null;
  message: string;
  page: string | null;
  status: 'open' | 'done';
  created: number;
}

export interface ReportRow {
  id: string;
  kind: 'client' | 'server' | 'csp';
  message: string;
  detail: string | null;
  url: string | null;
  release: string | null;
  count: number;
  first_seen: number;
  last_seen: number;
}

export interface AuditRow {
  id: string;
  action: 'support' | 'suspend' | 'unsuspend' | 'delete';
  admin_name: string | null;
  admin_email: string;
  target_name: string | null;
  target_email: string;
  detail: string | null;
  at: number;
}

export interface Stats {
  users: number;
  newUsers7d: number;
  suspended: number;
  teams: number;
  openMessages: number;
  errors24h: number;
}

/** Distinct reports kept; past it, the least recently seen go (in the daily sweep). */
export const MAX_REPORTS = 500;

const HOUR = 3600_000;

export interface AdminDb {
  saveSupportCode(c: { hash: string; userId: string; adminId: string; expires: number; now: number }): Promise<void>;
  /** The code's account, gone once read, or null if never given, used or run out. */
  takeSupportCode(hash: string, now: number): Promise<{ user_id: string; admin_id: string } | null>;
  /** Suspending ends every session in the same step. */
  setSuspended(userId: string, suspended: boolean): Promise<void>;

  /** Newest first; `q` matches the start of the email or of any word of the name. */
  adminUsers(q: string | null, before: Before | null, limit: number): Promise<AdminUserRow[]>;
  adminUser(id: string): Promise<AdminUserRow | null>;
  stats(now: number): Promise<Stats>;

  addMessage(m: MessageRow): Promise<void>;
  messages(status: 'open' | 'done', before: Before | null, limit: number): Promise<MessageRow[]>;
  /** The message as now, or null if there's none. */
  setMessageStatus(id: string, status: 'open' | 'done'): Promise<MessageRow | null>;
  /** What this account sent, newest first (its export). */
  messagesBy(userId: string): Promise<MessageRow[]>;

  /** Counts a report under its signature, stored the first time. The daily sweep keeps the MAX_REPORTS most recent. */
  recordReport(
    r: { id: string; signature: string; kind: ReportRow['kind']; message: string; detail: string | null; url: string | null; release: string | null; userId: string | null },
    now: number,
  ): Promise<void>;
  /** Most recently seen first. */
  reports(before: Before | null, limit: number): Promise<ReportRow[]>;
  clearReports(): Promise<void>;

  addAudit(a: { id: string; action: AuditRow['action']; admin: UserRow; target: UserRow; detail: string | null; now: number }): Promise<void>;
  audit(before: Before | null, limit: number): Promise<AuditRow[]>;
}

/** `q` as a LIKE pattern's text, its wildcards taken literally. */
const likeText = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

const ADMIN_USER = `SELECT u.*,
  (SELECT MAX(s.used) FROM core_sessions s WHERE s.user_id = u.id) AS last_active,
  (SELECT COUNT(*) FROM core_members m WHERE m.user_id = u.id) AS teams
  FROM core_users u`;

export function adminD1(DB: D1Database): AdminDb {
  const one = <T>(sql: string, ...args: unknown[]) => DB.prepare(sql).bind(...args).first<T>();
  const all = async <T>(sql: string, ...args: unknown[]) => (await DB.prepare(sql).bind(...args).all<T>()).results;
  const count = async (sql: string, ...args: unknown[]) => (await one<{ n: number | null }>(sql, ...args))?.n ?? 0;
  /** A page newest first by `col`, older than `before`. */
  const page = <T>(select: string, where: string, args: unknown[], col: string, idCol: string, before: Before | null, limit: number) => {
    const conds = [where, before ? `(${col} < ? OR (${col} = ? AND ${idCol} < ?))` : ''].filter(Boolean);
    const sql = `${select}${conds.length ? ` WHERE ${conds.join(' AND ')}` : ''} ORDER BY ${col} DESC, ${idCol} DESC LIMIT ?`;
    return all<T>(sql, ...args, ...(before ? [before.at, before.at, before.id] : []), limit);
  };

  return {
    async saveSupportCode(c) {
      await DB.batch([
        DB.prepare('DELETE FROM core_support_codes WHERE expires < ?').bind(c.now),
        DB.prepare('INSERT INTO core_support_codes (hash, user_id, admin_id, expires) VALUES (?, ?, ?, ?)').bind(c.hash, c.userId, c.adminId, c.expires),
      ]);
    },
    takeSupportCode: (hash, now) => one('DELETE FROM core_support_codes WHERE hash = ? AND expires >= ? RETURNING user_id, admin_id', hash, now),
    async setSuspended(userId, suspended) {
      if (!suspended) {
        await DB.prepare('UPDATE core_users SET suspended = 0 WHERE id = ?').bind(userId).run();
        return;
      }
      await DB.batch([
        DB.prepare('UPDATE core_users SET suspended = 1 WHERE id = ?').bind(userId),
        DB.prepare('DELETE FROM core_sessions WHERE user_id = ?').bind(userId),
        DB.prepare('DELETE FROM core_support_codes WHERE user_id = ?').bind(userId),
        DB.prepare('DELETE FROM core_oauth_codes WHERE user_id = ?').bind(userId),
      ]);
    },

    adminUsers(q, before, limit) {
      if (!q) return page<AdminUserRow>(ADMIN_USER, '', [], 'u.created', 'u.id', before, limit);
      const t = likeText(q);
      return page<AdminUserRow>(
        ADMIN_USER,
        "(u.email LIKE ? ESCAPE '\\' OR (' ' || COALESCE(u.name, '')) LIKE ? ESCAPE '\\')",
        [`${t}%`, `% ${t}%`],
        'u.created',
        'u.id',
        before,
        limit,
      );
    },
    adminUser: (id) => one(`${ADMIN_USER} WHERE u.id = ?`, id),
    async stats(now) {
      const [users, newUsers7d, suspended, teams, openMessages, errors24h] = await Promise.all([
        count('SELECT COUNT(*) AS n FROM core_users'),
        count('SELECT COUNT(*) AS n FROM core_users WHERE created >= ?', now - 7 * 24 * HOUR),
        count('SELECT COUNT(*) AS n FROM core_users WHERE suspended = 1'),
        count('SELECT COUNT(*) AS n FROM core_teams'),
        count("SELECT COUNT(*) AS n FROM core_messages WHERE status = 'open'"),
        count('SELECT SUM(count) AS n FROM core_report_hours WHERE hour > ?', Math.floor(now / HOUR) - 24),
      ]);
      return { users, newUsers7d, suspended, teams, openMessages, errors24h };
    },

    addMessage: async (m) =>
      void (await DB.prepare(
        'INSERT INTO core_messages (id, kind, name, email, user_id, message, page, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(m.id, m.kind, m.name, m.email, m.user_id, m.message, m.page, m.status, m.created)
        .run()),
    messages: (status, before, limit) => page<MessageRow>('SELECT * FROM core_messages', 'status = ?', [status], 'created', 'id', before, limit),
    setMessageStatus: (id, status) => one('UPDATE core_messages SET status = ? WHERE id = ? RETURNING *', status, id),
    messagesBy: (userId) => all<MessageRow>('SELECT * FROM core_messages WHERE user_id = ? ORDER BY created DESC, id DESC', userId),

    async recordReport(r, now) {
      await DB.batch([
        DB.prepare(
          `INSERT INTO core_reports (id, signature, kind, message, detail, url, release, user_id, count, first_seen, last_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT (signature) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen,
             release = COALESCE(excluded.release, release), user_id = COALESCE(excluded.user_id, user_id)`,
        ).bind(r.id, r.signature, r.kind, r.message, r.detail, r.url, r.release, r.userId, now, now),
        DB.prepare('INSERT INTO core_report_hours (hour, count) VALUES (?, 1) ON CONFLICT (hour) DO UPDATE SET count = count + 1').bind(
          Math.floor(now / HOUR),
        ),
      ]);
    },
    reports: (before, limit) => page<ReportRow>('SELECT * FROM core_reports', '', [], 'last_seen', 'id', before, limit),
    async clearReports() {
      await DB.batch([DB.prepare('DELETE FROM core_reports'), DB.prepare('DELETE FROM core_report_hours')]);
    },

    addAudit: async (a) =>
      void (await DB.prepare(
        `INSERT INTO core_audit (id, action, admin_id, admin_name, admin_email, target_id, target_name, target_email, detail, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(a.id, a.action, a.admin.id, a.admin.name, a.admin.email, a.target.id, a.target.name, a.target.email, a.detail, a.now)
        .run()),
    audit: (before, limit) => page<AuditRow>('SELECT * FROM core_audit', '', [], 'at', 'id', before, limit),
  };
}
