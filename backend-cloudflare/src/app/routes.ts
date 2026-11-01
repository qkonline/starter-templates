// THE APP'S OWN FILE: its paths, beside the core's (mounted after them in src/index.ts). The
// core never changes this file, so a later release of the template merges without touching it.
// Write each path in the contract first (`contract/app.yaml`), then here.
//
//   import { requireUser, requireVerifiedEmail } from '../middleware';
//
//   appRoutes.get('/notes', requireUser, requireVerifiedEmail, async (c) => {
//     const { ctx, user } = c.var; // ctx.db, ctx.env, ctx.cfg; user is the D1 row
//     const notes = await ctx.env.DB.prepare('SELECT id, text FROM notes WHERE user_id = ?').bind(user.id).all();
//     return c.json({ notes: notes.results });
//   });
//
// Its tables go in migrations numbered from 1000 (`migrations/1000_notes.sql`); 0001 to 0999
// are the core's. Keep the quota-protecting limits the core uses (`src/limits.ts`) on anything
// that writes without a sign-in or sends mail.

import { Hono } from 'hono';
import type { AppEnv } from '../middleware';

export const appRoutes = new Hono<AppEnv>();
