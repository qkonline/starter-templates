// Every D1 query lives here, behind the `Db` interface. The rest of the Worker never writes SQL,
// so another backend (DynamoDB, Postgres) could implement `Db` and reuse everything else.
//
// Wherever many requests at once could race (rate limits, code tries, one-time codes and
// challenges), the read and the change are one statement, so they can't all read before any
// writes.
//
// The core is here; the optional parts each have a file beside it (notifications, teams, admin),
// joined into the one `Db` at the bottom.

import { adminD1, type AdminDb } from './admin';
import { notificationsD1, type NotificationsDb } from './notifications';
import { teamsD1, type TeamsDb } from './teams';

export type { AdminUserRow, AuditRow, MessageRow, ReportRow } from './admin';
import { MAX_REPORTS } from './admin';
export { MAX_REPORTS };
export type { NotificationRow, PushSubRow } from './notifications';
export type { Change, InviteRow, MemberRow, MembershipRow, ReceivedInviteRow, Role, SentInviteRow, TeamRow } from './teams';

/** Where a page of a list newest first starts: after the item made at `at` with this id. */
export interface Before {
  at: number;
  id: string;
}

export interface UserRow {
  id: string;
  email: string;
  email_verified: number;
  /** algorithm$params$salt$hash (src/password.ts), or null. */
  password: string | null;
  name: string | null;
  /** The current photo's id, or null. */
  photo: string | null;
  created: number;
  /** 1 while an admin has the account suspended. */
  suspended: number;
  /**
   * Goes up whenever who may sign in changes (the address taken back, a reset, a new password),
   * so a sign-in that checked the old password a moment before can't still make a session.
   */
  auth_epoch: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  device: string;
  created: number;
  used: number;
  /** 1 for a support session an admin opened. */
  support: number;
  /** When a support session ends; null for an ordinary one. */
  expires: number | null;
}

export interface PasskeyRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  device: string;
  created: number;
  used: number | null;
}

export interface CoreDb {
  // people
  userById(id: string): Promise<UserRow | null>;
  userByEmail(email: string): Promise<UserRow | null>;
  /** Makes the account; false if the address is already taken. */
  createUser(u: { id: string; email: string; verified: boolean; password: string | null; now: number }): Promise<boolean>;
  setName(id: string, name: string): Promise<void>;
  /** Stores a new hash of the same password (a rehash at sign-in). */
  setPassword(id: string, password: string | null): Promise<void>;
  /** A new password: every other session ends, in the same step. */
  changePassword(id: string, password: string, keepSessionId: string): Promise<void>;
  setVerified(id: string): Promise<void>;
  /**
   * Someone proved they own the address (an emailed code, a reset, Google): it's confirmed, and
   * the password is replaced by `password` (or cleared, with null) and every session ends, so
   * whoever made the account without owning the address is out (PRD R1.8). If it wasn't
   * confirmed until now, whatever else was set up on it goes too, in the same step: passkeys,
   * passkey challenges, push subscriptions, Google codes and emailed codes.
   */
  claimAccount(id: string, password: string | null): Promise<void>;
  /** Moves the account to a new address, confirmed; false if another account has it. */
  setEmail(id: string, email: string, password: string | null): Promise<boolean>;
  setPhoto(id: string, photo: string | null): Promise<void>;
  /**
   * The account and everything kept with it, its contact messages too; error reports it sent are
   * kept without it. With teams, it leaves each: a team it was alone in goes, and one left
   * without an admin is led by its longest-standing member.
   */
  deleteUser(id: string, extra?: D1PreparedStatement[]): Promise<void>;

  // cleanups: what a deletion still has to do outside D1 (deletion.ts)
  cleanupStatements(jobs: { kind: CleanupKind; target: string }[], now: number): D1PreparedStatement[];
  /** Waiting cleanups: for these targets, or the oldest `limit` (the sweep). */
  cleanups(opts: { targets?: string[]; limit?: number }): Promise<CleanupRow[]>;
  cleanupDone(id: number): Promise<void>;
  cleanupFailed(id: number): Promise<void>;

  // sessions
  /**
   * Makes the session. With `epoch`, only while the account's auth_epoch is still that (else
   * false): for a sign-in that checked a password read with the account.
   */
  createSession(s: {
    id: string;
    hash: string;
    userId: string;
    device: string;
    now: number;
    support?: { expires: number };
    epoch?: number;
  }): Promise<boolean>;
  sessionByHash(hash: string): Promise<SessionRow | null>;
  touchSession(id: string, now: number): Promise<void>;
  sessions(userId: string): Promise<SessionRow[]>;
  endSessionByHash(hash: string): Promise<void>;
  /** False when that session isn't one of this person's. */
  endSession(userId: string, id: string): Promise<boolean>;
  endOtherSessions(userId: string, keepId: string): Promise<void>;

  // emailed codes
  putCode(c: { key: string; hash: string; sent: number; expires: number }): Promise<void>;
  /** Spends a try on the code under `key`; its hash, or null once it's out of tries or time. */
  spendTry(key: string, maxTries: number, now: number): Promise<string | null>;
  /** Uses the code up; false if another request already did. */
  useCode(key: string, hash: string): Promise<boolean>;

  // rate limits
  /**
   * Counts one use of `key` in a window of `windowMs`: the count so far and when the window
   * started. Once the count has reached `max` in this window, nothing is written and the count
   * comes back as `max + 1`.
   */
  countUse(key: string, windowMs: number, now: number, max: number): Promise<{ count: number; start: number }>;
  /** Takes one use back, for a try that turned out fine. */
  uncountUse(key: string): Promise<void>;

  // passkeys
  passkeys(userId: string): Promise<PasskeyRow[]>;
  passkey(id: string): Promise<PasskeyRow | null>;
  /** False if a passkey with that id already exists. */
  addPasskey(p: Omit<PasskeyRow, 'used'>): Promise<boolean>;
  passkeyUsed(id: string, counter: number, now: number): Promise<void>;
  /** False when it isn't one of this person's. */
  removePasskey(userId: string, id: string): Promise<boolean>;
  saveChallenge(c: { id: string; challenge: string; userId: string; purpose: string; expires: number; now: number }): Promise<void>;
  /** The challenge, gone once read, so it can be answered only once. */
  /** Marks a signed challenge spent; false when it already was. */
  spendChallenge(c: { id: string; expires: number; now: number }): Promise<boolean>;
  takeChallenge(id: string): Promise<{ challenge: string; user_id: string; purpose: string; expires: number } | null>;

  // back from Google
  saveOAuthCode(c: { hash: string; userId: string; isNew: boolean; expires: number; now: number }): Promise<void>;
  /** The code's account, gone once read, or null if it was never given, was used or ran out. */
  takeOAuthCode(hash: string, now: number): Promise<{ user_id: string; is_new: number } | null>;

  /**
   * Clears out what has run out: codes, challenges, OAuth and support codes, support sessions,
   * sessions unused for a year, expired invites, limits older than a day, notifications older
   * than 90 days, contact messages and the audit log older than a year; and trims error reports
   * to the MAX_REPORTS most recently seen.
   */
  sweep(now: number): Promise<void>;
}

export type Db = CoreDb & NotificationsDb & TeamsDb & AdminDb;

const DAY = 24 * 3600_000;
/** A session unused this long is over (PRD R1.11; account.ts checks it on use too). */
const SESSION_IDLE = 365 * DAY;
const MESSAGES_KEPT = 365 * DAY;

export type CleanupKind = 'photos' | 'space' | 'app-user' | 'app-team';

export interface CleanupRow {
  id: number;
  kind: CleanupKind;
  target: string;
  created: number;
  tries: number;
}

/** The emailed codes kept for an account: its confirm code, and change codes it asked for (codes.ts keys). */
const ACCOUNT_CODES =
  "key = 'confirm|' || ?1 OR substr(key, 1, length('change|' || ?1 || '|')) = 'change|' || ?1 || '|' OR substr(key, 1, length('leave|' || ?1 || '|')) = 'leave|' || ?1 || '|'";

export function d1(DB: D1Database): Db {
  const teams = teamsD1(DB);
  return { ...core(DB, teams), ...notificationsD1(DB), ...teams, ...adminD1(DB) };
}

function core(DB: D1Database, teams: TeamsDb): CoreDb {
  const one = <T>(sql: string, ...args: unknown[]) => DB.prepare(sql).bind(...args).first<T>();
  const run = (sql: string, ...args: unknown[]) => DB.prepare(sql).bind(...args).run();
  const unique = (e: unknown) => /UNIQUE|constraint/i.test(String((e as Error)?.message ?? e));

  return {
    userById: (id) => one('SELECT * FROM core_users WHERE id = ?', id),
    userByEmail: (email) => one('SELECT * FROM core_users WHERE email = ?', email),
    async createUser(u) {
      try {
        await run(
          'INSERT INTO core_users (id, email, email_verified, password, created) VALUES (?, ?, ?, ?, ?)',
          u.id,
          u.email,
          u.verified ? 1 : 0,
          u.password,
          u.now,
        );
        return true;
      } catch (e) {
        if (unique(e)) return false;
        throw e;
      }
    },
    setName: async (id, name) => void (await run('UPDATE core_users SET name = ? WHERE id = ?', name, id)),
    setPassword: async (id, password) => void (await run('UPDATE core_users SET password = ? WHERE id = ?', password, id)),
    async changePassword(id, password, keepSessionId) {
      await DB.batch([
        DB.prepare('UPDATE core_users SET password = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').bind(password, id),
        DB.prepare('DELETE FROM core_sessions WHERE user_id = ? AND id != ?').bind(id, keepSessionId),
      ]);
    },
    setVerified: async (id) => void (await run('UPDATE core_users SET email_verified = 1 WHERE id = ?', id)),
    async claimAccount(id, password) {
      // Each delete holds only while the account is still unconfirmed, so they come before the
      // update that confirms it; one batch, so nothing can be added in between.
      const unconfirmed = 'EXISTS (SELECT 1 FROM core_users WHERE id = ?1 AND email_verified = 0)';
      await DB.batch([
        ...['core_passkeys', 'core_challenges', 'core_push_subs', 'core_oauth_codes'].map((t) =>
          DB.prepare(`DELETE FROM ${t} WHERE user_id = ?1 AND ${unconfirmed}`).bind(id),
        ),
        DB.prepare(`DELETE FROM core_codes WHERE (${ACCOUNT_CODES}) AND ${unconfirmed}`).bind(id),
        DB.prepare('UPDATE core_users SET email_verified = 1, password = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').bind(password, id),
        DB.prepare('DELETE FROM core_sessions WHERE user_id = ?').bind(id),
      ]);
    },
    async setEmail(id, email, password) {
      try {
        // The password is re-salted with the new address, so it counts as a new one.
        await run('UPDATE core_users SET email = ?, email_verified = 1, password = ?, auth_epoch = auth_epoch + 1 WHERE id = ?', email, password, id);
        return true;
      } catch (e) {
        if (unique(e)) return false;
        throw e;
      }
    },
    setPhoto: async (id, photo) => void (await run('UPDATE core_users SET photo = ? WHERE id = ?', photo, id)),
    async deleteUser(id, extra = []) {
      await DB.batch([
        ...extra,
        ...(await teams.leaveAllStatements(id)),
        DB.prepare('DELETE FROM core_users WHERE id = ?').bind(id),
        DB.prepare('DELETE FROM core_sessions WHERE user_id = ?').bind(id),
        DB.prepare('DELETE FROM core_passkeys WHERE user_id = ?').bind(id),
        DB.prepare('DELETE FROM core_challenges WHERE user_id = ?').bind(id),
        DB.prepare('DELETE FROM core_oauth_codes WHERE user_id = ?').bind(id),
        DB.prepare(`DELETE FROM core_codes WHERE ${ACCOUNT_CODES}`).bind(id),
        DB.prepare('DELETE FROM core_notifications WHERE user_id = ?').bind(id),
        DB.prepare('DELETE FROM core_push_subs WHERE user_id = ?').bind(id),
        DB.prepare('DELETE FROM core_support_codes WHERE user_id = ?').bind(id),
        DB.prepare('DELETE FROM core_messages WHERE user_id = ?').bind(id),
        DB.prepare('UPDATE core_reports SET user_id = NULL WHERE user_id = ?').bind(id),
      ]);
    },

    async createSession(s) {
      const r = await run(
        `INSERT INTO core_sessions (id, hash, user_id, device, created, used, support, expires)
         SELECT ?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7
         WHERE ?8 IS NULL OR EXISTS (SELECT 1 FROM core_users WHERE id = ?3 AND auth_epoch = ?8)`,
        s.id,
        s.hash,
        s.userId,
        s.device,
        s.now,
        s.support ? 1 : 0,
        s.support?.expires ?? null,
        s.epoch ?? null,
      );
      return r.meta.changes > 0;
    },
    sessionByHash: (hash) => one('SELECT id, user_id, device, created, used, support, expires FROM core_sessions WHERE hash = ?', hash),
    touchSession: async (id, now) => void (await run('UPDATE core_sessions SET used = ? WHERE id = ?', now, id)),
    async sessions(userId) {
      const r = await DB.prepare(
        'SELECT id, user_id, device, created, used, support, expires FROM core_sessions WHERE user_id = ? ORDER BY used DESC, created DESC',
      )
        .bind(userId)
        .all<SessionRow>();
      return r.results;
    },
    endSessionByHash: async (hash) => void (await run('DELETE FROM core_sessions WHERE hash = ?', hash)),
    async endSession(userId, id) {
      return !!(await one('DELETE FROM core_sessions WHERE id = ? AND user_id = ? RETURNING 1', id, userId));
    },
    endOtherSessions: async (userId, keepId) => void (await run('DELETE FROM core_sessions WHERE user_id = ? AND id != ?', userId, keepId)),

    putCode: async (c) =>
      void (await run('INSERT OR REPLACE INTO core_codes (key, hash, tries, sent, expires) VALUES (?, ?, 0, ?, ?)', c.key, c.hash, c.sent, c.expires)),
    async spendTry(key, maxTries, now) {
      const row = await one<{ hash: string }>(
        'UPDATE core_codes SET tries = tries + 1 WHERE key = ? AND tries < ? AND expires >= ? RETURNING hash',
        key,
        maxTries,
        now,
      );
      return row?.hash ?? null;
    },
    async useCode(key, hash) {
      return !!(await one('DELETE FROM core_codes WHERE key = ? AND hash = ? RETURNING 1', key, hash));
    },

    async countUse(key, windowMs, now, max) {
      // At the limit within the window, the update's WHERE fails: no write, and no row back.
      const row = await one<{ count: number; start: number }>(
        `INSERT INTO core_limits (key, count, start) VALUES (?1, 1, ?2)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN ?2 - start >= ?3 THEN 1 ELSE count + 1 END,
           start = CASE WHEN ?2 - start >= ?3 THEN ?2 ELSE start END
         WHERE ?2 - core_limits.start >= ?3 OR core_limits.count < ?4
         RETURNING count, start`,
        key,
        now,
        windowMs,
        max,
      );
      if (row) return row;
      const held = await one<{ start: number }>('SELECT start FROM core_limits WHERE key = ?', key);
      return { count: max + 1, start: held?.start ?? now };
    },
    uncountUse: async (key) => void (await run('UPDATE core_limits SET count = count - 1 WHERE key = ? AND count > 0', key)),

    async passkeys(userId) {
      const r = await DB.prepare('SELECT * FROM core_passkeys WHERE user_id = ? ORDER BY created, id').bind(userId).all<PasskeyRow>();
      return r.results;
    },
    passkey: (id) => one('SELECT * FROM core_passkeys WHERE id = ?', id),
    async addPasskey(p) {
      try {
        await run(
          'INSERT INTO core_passkeys (id, user_id, public_key, counter, transports, device, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
          p.id,
          p.user_id,
          p.public_key,
          p.counter,
          p.transports,
          p.device,
          p.created,
        );
        return true;
      } catch (e) {
        if (unique(e)) return false;
        throw e;
      }
    },
    passkeyUsed: async (id, counter, now) => void (await run('UPDATE core_passkeys SET counter = ?, used = ? WHERE id = ?', counter, now, id)),
    async removePasskey(userId, id) {
      return !!(await one('DELETE FROM core_passkeys WHERE id = ? AND user_id = ? RETURNING 1', id, userId));
    },
    async saveChallenge(c) {
      await DB.batch([
        DB.prepare('DELETE FROM core_challenges WHERE expires < ?').bind(c.now),
        DB.prepare('INSERT INTO core_challenges (id, challenge, user_id, purpose, expires) VALUES (?, ?, ?, ?, ?)').bind(
          c.id,
          c.challenge,
          c.userId,
          c.purpose,
          c.expires,
        ),
      ]);
    },
    async spendChallenge(c) {
      const [, inserted] = await DB.batch([
        DB.prepare('DELETE FROM core_challenges WHERE expires < ?').bind(c.now),
        DB.prepare("INSERT INTO core_challenges (id, challenge, user_id, purpose, expires) VALUES (?, '', '', 'spent', ?) ON CONFLICT (id) DO NOTHING").bind(
          c.id,
          c.expires,
        ),
      ]);
      return (inserted?.meta.changes ?? 0) > 0;
    },
    takeChallenge: (id) => one('DELETE FROM core_challenges WHERE id = ? RETURNING challenge, user_id, purpose, expires', id),

    async saveOAuthCode(c) {
      await DB.batch([
        DB.prepare('DELETE FROM core_oauth_codes WHERE expires < ?').bind(c.now),
        DB.prepare('INSERT INTO core_oauth_codes (hash, user_id, is_new, expires) VALUES (?, ?, ?, ?)').bind(c.hash, c.userId, c.isNew ? 1 : 0, c.expires),
      ]);
    },
    takeOAuthCode: (hash, now) => one('DELETE FROM core_oauth_codes WHERE hash = ? AND expires >= ? RETURNING user_id, is_new', hash, now),

    cleanupStatements: (jobs, now) =>
      jobs.map((j) => DB.prepare('INSERT INTO core_cleanups (kind, target, created) VALUES (?, ?, ?)').bind(j.kind, j.target, now)),
    async cleanups({ targets, limit = 50 }) {
      if (targets && !targets.length) return [];
      const where = targets ? `WHERE target IN (${targets.map(() => '?').join(',')})` : '';
      const out = await DB.prepare(`SELECT * FROM core_cleanups ${where} ORDER BY id LIMIT ?`)
        .bind(...(targets ?? []), limit)
        .all<CleanupRow>();
      return out.results;
    },
    cleanupDone: async (id) => void (await run('DELETE FROM core_cleanups WHERE id = ?', id)),
    cleanupFailed: async (id) => void (await run('UPDATE core_cleanups SET tries = tries + 1 WHERE id = ?', id)),
    async sweep(now) {
      await DB.batch([
        DB.prepare('DELETE FROM core_codes WHERE expires < ?').bind(now),
        DB.prepare('DELETE FROM core_challenges WHERE expires < ?').bind(now),
        DB.prepare('DELETE FROM core_oauth_codes WHERE expires < ?').bind(now),
        // Every window is a day or less, so a count whose window began a day ago is spent.
        DB.prepare('DELETE FROM core_limits WHERE start < ?').bind(now - DAY),
        DB.prepare('DELETE FROM core_support_codes WHERE expires < ?').bind(now),
        DB.prepare('DELETE FROM core_sessions WHERE expires IS NOT NULL AND expires < ?').bind(now),
        DB.prepare('DELETE FROM core_sessions WHERE used < ?').bind(now - SESSION_IDLE),
        // Push subscriptions whose session has ended (signed out, ended from another device, expired).
        DB.prepare(
          'DELETE FROM core_push_subs WHERE session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM core_sessions s WHERE s.id = core_push_subs.session_id)',
        ),
        DB.prepare('DELETE FROM core_messages WHERE created < ?').bind(now - MESSAGES_KEPT),
        DB.prepare('DELETE FROM core_reports WHERE id IN (SELECT id FROM core_reports ORDER BY last_seen DESC, id DESC LIMIT -1 OFFSET ?)').bind(MAX_REPORTS),
        DB.prepare('DELETE FROM core_invites WHERE expires < ?').bind(now),
        DB.prepare('DELETE FROM core_notifications WHERE created < ?').bind(now - 90 * DAY),
        DB.prepare('DELETE FROM core_audit WHERE at < ?').bind(now - 365 * DAY),
        DB.prepare('DELETE FROM core_report_hours WHERE hour < ?').bind(Math.floor((now - 2 * DAY) / 3600_000)),
      ]);
    },
  };
}
