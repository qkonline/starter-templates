// THE APP'S OWN FILE: what the app keeps of a person and of a team, so exporting an account
// (PRD R2.5) and deleting one, or a team, include it. The core reads this and never changes it.
//
// - `exportUser`: the person's own records, added to `/me/export` under `data`.
// - `deleteUserStatements` / `deleteTeamStatements`: D1 statements that delete the app's rows,
//   run in the same batch as the core's own deletion, so it's all or none.
// - `afterDeleteUser` / `afterDeleteTeam`: anything outside D1 (files in R2, a third party).
//   Run straight after, and again by the daily sweep until they succeed, so make them safe to
//   run twice. (The person's sync spaces and photos are the core's: already handled.)
//
// Example:
//
//   deleteUserStatements: (db, userId) => [db.prepare('DELETE FROM notes WHERE user_id = ?').bind(userId)],
//   exportUser: async (ctx, user) => ({
//     notes: (await ctx.env.DB.prepare('SELECT id, text, created FROM notes WHERE user_id = ?').bind(user.id).all()).results,
//   }),

import type { UserRow } from '../db';
import type { Ctx, Env } from '../env';

export interface AppAccount {
  exportUser(ctx: Ctx, user: UserRow): Promise<Record<string, unknown>>;
  deleteUserStatements(db: D1Database, userId: string): D1PreparedStatement[];
  deleteTeamStatements(db: D1Database, teamId: string): D1PreparedStatement[];
  afterDeleteUser(env: Env, userId: string): Promise<void>;
  afterDeleteTeam(env: Env, teamId: string): Promise<void>;
}

export const appAccount: AppAccount = {
  exportUser: async () => ({}),
  deleteUserStatements: () => [],
  deleteTeamStatements: () => [],
  afterDeleteUser: async () => {},
  afterDeleteTeam: async () => {},
};
