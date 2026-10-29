// Teams, their members and invites (PRD section 5), as boardo keeps its boards. A team is never
// left without an admin: every change that could take away the last one checks for another in
// the same statement as the change, so two admins stepping down at once can't both get through.

export type Role = 'admin' | 'member';

/** A team as one of its members sees it. */
export interface TeamRow {
  id: string;
  name: string;
  created: number;
  role: Role;
  member_count: number;
}

export interface MemberRow {
  user_id: string;
  role: Role;
  joined: number;
  name: string | null;
  email: string;
  photo: string | null;
}

export interface InviteRow {
  id: string;
  team_id: string;
  email: string;
  role: Role;
  by_name: string | null;
  by_email: string;
  created: number;
  sent: number;
  expires: number;
}

export interface ReceivedInviteRow extends InviteRow {
  team_name: string;
}

export interface MembershipRow {
  id: string;
  name: string;
  role: Role;
  joined: number;
}

export interface SentInviteRow extends InviteRow {
  team_name: string;
}

export type Change = 'ok' | 'last_admin' | 'gone';

export interface TeamsDb {
  /** Oldest joined first. */
  teamsOf(userId: string): Promise<TeamRow[]>;
  /** The teams this person is in, with role and when they joined (their export). */
  memberships(userId: string): Promise<MembershipRow[]>;
  /** Pending invites sent by this address, newest first, with their team's name (their export). */
  invitesBy(email: string, now: number): Promise<SentInviteRow[]>;
  /** The team as this person sees it, or null if they aren't in it. */
  teamOf(teamId: string, userId: string): Promise<TeamRow | null>;
  createTeam(t: { id: string; name: string; userId: string; now: number }): Promise<void>;
  renameTeam(id: string, name: string): Promise<void>;
  /** The team with its members and invites. */
  deleteTeam(id: string): Promise<void>;
  /** Longest-standing first. */
  members(teamId: string): Promise<MemberRow[]>;
  member(teamId: string, userId: string): Promise<MemberRow | null>;
  /** 'last_admin' when it would leave the team without an admin; 'gone' when they aren't in it. */
  setRole(teamId: string, userId: string, role: Role): Promise<Change>;
  removeMember(teamId: string, userId: string): Promise<Change>;

  /** Pending, newest first. */
  invites(teamId: string, now: number): Promise<InviteRow[]>;
  /** Pending invites to this address, newest first, with their team's name. */
  invitesTo(email: string, now: number): Promise<ReceivedInviteRow[]>;
  /** Whether someone with this email is in the team, or invited (and not expired). */
  alreadyIn(teamId: string, email: string, now: number): Promise<'member' | 'invited' | null>;
  /** False when the address was invited at the same moment. */
  createInvite(i: InviteRow & { tokenHash: string }): Promise<boolean>;
  invite(id: string): Promise<InviteRow | null>;
  inviteByToken(tokenHash: string): Promise<InviteRow | null>;
  /**
   * Uses the invite: its person joins with its role (unless already in), and it's gone. Null if it
   * was already used, withdrawn or expired, however many try at once.
   */
  acceptInvite(id: string, userId: string, email: string, now: number): Promise<InviteRow | null>;
  /** Gone; false if it wasn't there (or isn't this team's / this address's). */
  deleteInvite(id: string, where: { teamId?: string; email?: string }): Promise<boolean>;
  /** A new token and 7 days; 'wait' within `gapMs` of the last send. */
  renewInvite(id: string, teamId: string, tokenHash: string, now: number, expires: number, gapMs: number): Promise<'ok' | 'wait' | 'gone'>;

  /** Statements that take someone out of every team as their account goes (Db.deleteUser). */
  leaveAllStatements(userId: string): Promise<D1PreparedStatement[]>;
}

/** Holds only while another admin stays: part of the statement that makes the change. */
const ANOTHER_ADMIN = "(role <> 'admin' OR (SELECT COUNT(*) FROM members WHERE team_id = ?1 AND role = 'admin') > 1)";

const TEAM = `SELECT t.id, t.name, t.created, m.role, (SELECT COUNT(*) FROM members c WHERE c.team_id = t.id) AS member_count
  FROM members m JOIN teams t ON t.id = m.team_id`;
const MEMBER = `SELECT m.user_id, m.role, m.joined, u.name, u.email, u.photo FROM members m JOIN users u ON u.id = m.user_id`;
const INVITE = 'SELECT id, team_id, email, role, by_name, by_email, created, sent, expires FROM invites';

export function teamsD1(DB: D1Database): TeamsDb {
  const one = <T>(sql: string, ...args: unknown[]) => DB.prepare(sql).bind(...args).first<T>();
  const all = async <T>(sql: string, ...args: unknown[]) => (await DB.prepare(sql).bind(...args).all<T>()).results;
  const exists = async (sql: string, ...args: unknown[]) => !!(await one(sql, ...args));

  /** After a change was refused: because of the last-admin rule, or because they weren't in it. */
  const why = async (teamId: string, userId: string): Promise<Change> =>
    (await exists('SELECT 1 FROM members WHERE team_id = ? AND user_id = ?', teamId, userId)) ? 'last_admin' : 'gone';

  return {
    teamsOf: (userId) => all(`${TEAM} WHERE m.user_id = ? ORDER BY m.joined, t.id`, userId),
    teamOf: (teamId, userId) => one(`${TEAM} WHERE m.team_id = ? AND m.user_id = ?`, teamId, userId),
    memberships: (userId) =>
      all('SELECT t.id, t.name, m.role, m.joined FROM members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ? ORDER BY m.joined, t.id', userId),
    invitesBy: (email, now) =>
      all(
        `SELECT i.id, i.team_id, i.email, i.role, i.by_name, i.by_email, i.created, i.sent, i.expires, t.name AS team_name
         FROM invites i JOIN teams t ON t.id = i.team_id WHERE i.by_email = ? AND i.expires >= ? ORDER BY i.created DESC, i.id DESC`,
        email,
        now,
      ),
    async createTeam(t) {
      await DB.batch([
        DB.prepare('INSERT INTO teams (id, name, created) VALUES (?, ?, ?)').bind(t.id, t.name, t.now),
        DB.prepare("INSERT INTO members (team_id, user_id, role, joined) VALUES (?, ?, 'admin', ?)").bind(t.id, t.userId, t.now),
      ]);
    },
    renameTeam: async (id, name) => void (await DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(name, id).run()),
    async deleteTeam(id) {
      await DB.batch([
        DB.prepare('DELETE FROM members WHERE team_id = ?').bind(id),
        DB.prepare('DELETE FROM invites WHERE team_id = ?').bind(id),
        DB.prepare('DELETE FROM teams WHERE id = ?').bind(id),
      ]);
    },
    members: (teamId) => all(`${MEMBER} WHERE m.team_id = ? ORDER BY m.joined, m.user_id`, teamId),
    member: (teamId, userId) => one(`${MEMBER} WHERE m.team_id = ? AND m.user_id = ?`, teamId, userId),
    async setRole(teamId, userId, role) {
      const r = await DB.prepare(`UPDATE members SET role = ?3 WHERE team_id = ?1 AND user_id = ?2 AND (?3 = 'admin' OR ${ANOTHER_ADMIN})`)
        .bind(teamId, userId, role)
        .run();
      return r.meta.changes ? 'ok' : why(teamId, userId);
    },
    async removeMember(teamId, userId) {
      const r = await DB.prepare(`DELETE FROM members WHERE team_id = ?1 AND user_id = ?2 AND ${ANOTHER_ADMIN}`).bind(teamId, userId).run();
      return r.meta.changes ? 'ok' : why(teamId, userId);
    },

    invites: (teamId, now) => all(`${INVITE} WHERE team_id = ? AND expires >= ? ORDER BY created DESC, id DESC`, teamId, now),
    invitesTo: (email, now) =>
      all(
        `SELECT i.id, i.team_id, i.email, i.role, i.by_name, i.by_email, i.created, i.sent, i.expires, t.name AS team_name
         FROM invites i JOIN teams t ON t.id = i.team_id WHERE i.email = ? AND i.expires >= ? ORDER BY i.created DESC, i.id DESC`,
        email,
        now,
      ),
    async alreadyIn(teamId, email, now) {
      if (await exists('SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND u.email = ?', teamId, email)) return 'member';
      if (await exists('SELECT 1 FROM invites WHERE team_id = ? AND email = ? AND expires >= ?', teamId, email, now)) return 'invited';
      return null;
    },
    async createInvite(i) {
      try {
        await DB.batch([
          // An expired invite to the same address makes way for the new one.
          DB.prepare('DELETE FROM invites WHERE team_id = ? AND email = ? AND expires < ?').bind(i.team_id, i.email, i.created),
          DB.prepare(
            `INSERT INTO invites (id, team_id, email, role, token_hash, by_name, by_email, created, sent, expires)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(i.id, i.team_id, i.email, i.role, i.tokenHash, i.by_name, i.by_email, i.created, i.sent, i.expires),
        ]);
        return true;
      } catch (e) {
        if (/UNIQUE|constraint/i.test(String((e as Error)?.message ?? e))) return false;
        throw e;
      }
    },
    invite: (id) => one(`${INVITE} WHERE id = ?`, id),
    inviteByToken: (tokenHash) => one(`${INVITE} WHERE token_hash = ?`, tokenHash),
    async acceptInvite(id, userId, email, now) {
      // One transaction: the join happens only if the invite is still there to be used, and
      // using it is the delete, so two at once can't both join.
      const [, taken] = await DB.batch([
        DB.prepare(
          `INSERT INTO members (team_id, user_id, role, joined)
           SELECT i.team_id, ?2, i.role, ?4 FROM invites i JOIN teams t ON t.id = i.team_id
           WHERE i.id = ?1 AND i.email = ?3 AND i.expires >= ?4
           ON CONFLICT (team_id, user_id) DO NOTHING`,
        ).bind(id, userId, email, now),
        DB.prepare(
          `DELETE FROM invites WHERE id = ? AND email = ? AND expires >= ?
           RETURNING id, team_id, email, role, by_name, by_email, created, sent, expires`,
        ).bind(id, email, now),
      ]);
      return (taken?.results?.[0] as InviteRow | undefined) ?? null;
    },
    async deleteInvite(id, where) {
      const row = await one<{ team_id: string; email: string }>('SELECT team_id, email FROM invites WHERE id = ?', id);
      if (!row || (where.teamId && row.team_id !== where.teamId) || (where.email && row.email !== where.email)) return false;
      return exists('DELETE FROM invites WHERE id = ? RETURNING 1', id);
    },
    async renewInvite(id, teamId, tokenHash, now, expires, gapMs) {
      const done = await exists(
        'UPDATE invites SET token_hash = ?, sent = ?, expires = ? WHERE id = ? AND team_id = ? AND expires >= ? AND sent <= ? RETURNING 1',
        tokenHash,
        now,
        expires,
        id,
        teamId,
        now,
        now - gapMs,
      );
      if (done) return 'ok';
      return (await exists('SELECT 1 FROM invites WHERE id = ? AND team_id = ? AND expires >= ?', id, teamId, now)) ? 'wait' : 'gone';
    },

    async leaveAllStatements(userId) {
      const ids = (await all<{ team_id: string }>('SELECT team_id FROM members WHERE user_id = ?', userId)).map((r) => r.team_id);
      if (!ids.length) return [];
      const marks = ids.map(() => '?').join(',');
      return [
        DB.prepare('DELETE FROM members WHERE user_id = ?').bind(userId),
        // A team left without an admin: its longest-standing member leads it now.
        DB.prepare(
          `UPDATE members SET role = 'admin'
           WHERE team_id IN (${marks})
             AND NOT EXISTS (SELECT 1 FROM members a WHERE a.team_id = members.team_id AND a.role = 'admin')
             AND user_id = (SELECT b.user_id FROM members b WHERE b.team_id = members.team_id ORDER BY b.joined, b.user_id LIMIT 1)`,
        ).bind(...ids),
        // A team they were alone in goes, with its invites.
        DB.prepare(`DELETE FROM invites WHERE team_id IN (${marks}) AND NOT EXISTS (SELECT 1 FROM members m WHERE m.team_id = invites.team_id)`).bind(
          ...ids,
        ),
        DB.prepare(`DELETE FROM teams WHERE id IN (${marks}) AND NOT EXISTS (SELECT 1 FROM members m WHERE m.team_id = teams.id)`).bind(...ids),
      ];
    },
  };
}
