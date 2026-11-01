// The admin area (PRD section 6), for the confirmed accounts the app lists in ADMIN_EMAILS:
// counts, finding people, suspending and deleting them (never another admin), support sessions
// (as high-yield-prep's impersonation: a one-time code traded for a scoped, hour-long session),
// contact messages, error reports, and the audit log of every support session, suspension and
// deletion.

import { Hono } from 'hono';
import { isAdmin, signedIn, userView } from '../account';
import { deviceName, isId, optionalText, paged, readBody, readCursor } from '../checks';
import { randomToken, sha256 } from '../crypto';
import type { AdminUserRow, AuditRow, MessageRow, ReportRow, UserRow } from '../db';
import type { Ctx } from '../env';
import { forbidden, invalid, notFound, wrongCode } from '../errors';
import { requireAdmin, requireFeature, perNetwork, type AppEnv } from '../middleware';
import { deleteAccount } from '../deletion';

const PAGE = 50;
const CODE_MS = 60_000;
const SUPPORT_MS = 3600_000;

const iso = (ms: number) => new Date(ms).toISOString();

const adminUserView = (ctx: Ctx, u: AdminUserRow) => ({
  ...userView(ctx, u),
  suspended: !!u.suspended,
  lastActiveAt: u.last_active == null ? null : iso(u.last_active),
  teams: ctx.cfg.teams ? u.teams : null,
});
export const messageView = (m: MessageRow) => ({
  id: m.id,
  kind: m.kind,
  name: m.name,
  email: m.email,
  userId: m.user_id,
  message: m.message,
  page: m.page,
  status: m.status,
  createdAt: iso(m.created),
});
const reportView = (r: ReportRow) => ({
  id: r.id,
  kind: r.kind,
  message: r.message,
  detail: r.detail,
  url: r.url,
  release: r.release,
  count: r.count,
  firstSeen: iso(r.first_seen),
  lastSeen: iso(r.last_seen),
});
const auditView = (a: AuditRow) => ({
  id: a.id,
  action: a.action,
  admin: { name: a.admin_name, email: a.admin_email },
  target: { name: a.target_name, email: a.target_email },
  detail: a.detail,
  at: iso(a.at),
});

/** The person acted on; never an admin, for the actions that change them. */
async function target(ctx: Ctx, id: string, opts: { notAdmin?: boolean } = {}): Promise<AdminUserRow> {
  const u = isId(id) ? await ctx.db.adminUser(id) : null;
  if (!u) throw notFound();
  if (opts.notAdmin && isAdmin(ctx, u)) throw forbidden("Admins can't do that to another admin.");
  return u;
}

const audit = (ctx: Ctx, action: AuditRow['action'], admin: UserRow, who: UserRow, detail: string | null = null) =>
  ctx.db.addAudit({ id: randomToken(12), action, admin, target: who, detail, now: Date.now() });

export const admin = new Hono<AppEnv>();

// Scoped to these paths: a sub-app's '*' would apply to every route once mounted.
for (const path of ['/admin', '/admin/*']) admin.use(path, requireAdmin);

admin.get('/admin/stats', async (c) => {
  const { ctx } = c.var;
  const s = await ctx.db.stats(Date.now());
  return c.json({ ...s, teams: ctx.cfg.teams ? s.teams : null });
});

admin.get('/admin/users', async (c) => {
  const { ctx } = c.var;
  const q = c.req.query('q')?.trim() ?? '';
  if (q.length > 100) throw invalid('Search for at most 100 characters.');
  const rows = await ctx.db.adminUsers(q || null, readCursor(c.req.query('cursor')), PAGE + 1);
  const { items, next } = paged(rows, PAGE, (u) => ({ at: u.created, id: u.id }));
  return c.json({ users: items.map((u) => adminUserView(ctx, u)), next });
});

admin.get('/admin/users/:userId', async (c) => {
  const { ctx } = c.var;
  return c.json({ user: adminUserView(ctx, await target(ctx, c.req.param('userId'))) });
});

admin.delete('/admin/users/:userId', async (c) => {
  const { ctx, user } = c.var;
  const who = await target(ctx, c.req.param('userId'), { notAdmin: true });
  await deleteAccount(ctx, who.id);
  await audit(ctx, 'delete', user, who);
  return c.body(null, 204);
});

admin.post('/admin/users/:userId/suspend', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['reason']);
  const reason = optionalText(b.reason, 500);
  if (reason === undefined) throw invalid('Give a reason of at most 500 characters, or none.');
  const who = await target(ctx, c.req.param('userId'), { notAdmin: true });
  await ctx.db.setSuspended(who.id, true);
  await audit(ctx, 'suspend', user, who, reason);
  return c.json({ user: adminUserView(ctx, (await ctx.db.adminUser(who.id))!) });
});

admin.post('/admin/users/:userId/unsuspend', async (c) => {
  const { ctx, user } = c.var;
  const who = await target(ctx, c.req.param('userId'));
  await ctx.db.setSuspended(who.id, false);
  await audit(ctx, 'unsuspend', user, who);
  return c.json({ user: adminUserView(ctx, (await ctx.db.adminUser(who.id))!) });
});

admin.post('/admin/users/:userId/support', async (c) => {
  const { ctx, user } = c.var;
  const who = await target(ctx, c.req.param('userId'), { notAdmin: true });
  if (who.suspended) throw forbidden('Unsuspend them first.');
  // The code travels in an address, so it's good once, for a minute; the token never does.
  const code = randomToken(32);
  const now = Date.now();
  await ctx.db.saveSupportCode({ hash: await sha256(code), userId: who.id, adminId: user.id, expires: now + CODE_MS, now });
  await audit(ctx, 'support', user, who);
  return c.json({ code });
});

admin.get('/admin/messages', async (c) => {
  const { ctx } = c.var;
  const status = c.req.query('status') ?? 'open';
  if (status !== 'open' && status !== 'done') throw invalid('Show open or done messages.');
  const rows = await ctx.db.messages(status, readCursor(c.req.query('cursor')), PAGE + 1);
  const { items, next } = paged(rows, PAGE, (m) => ({ at: m.created, id: m.id }));
  return c.json({ messages: items.map(messageView), next });
});

admin.patch('/admin/messages/:messageId', async (c) => {
  const { ctx } = c.var;
  const b = await readBody(c.req.raw, ['status']);
  if (b.status !== 'open' && b.status !== 'done') throw invalid('Mark it open or done.');
  const id = c.req.param('messageId');
  const m = isId(id) ? await ctx.db.setMessageStatus(id, b.status) : null;
  if (!m) throw notFound();
  return c.json({ message: messageView(m) });
});

admin.get('/admin/errors', async (c) => {
  const { ctx } = c.var;
  const rows = await ctx.db.reports(readCursor(c.req.query('cursor')), PAGE + 1);
  const { items, next } = paged(rows, PAGE, (r) => ({ at: r.last_seen, id: r.id }));
  return c.json({ errors: items.map(reportView), next });
});

admin.delete('/admin/errors', async (c) => {
  await c.var.ctx.db.clearReports();
  return c.body(null, 204);
});

admin.get('/admin/audit', async (c) => {
  const { ctx } = c.var;
  const rows = await ctx.db.audit(readCursor(c.req.query('cursor')), PAGE + 1);
  const { items, next } = paged(rows, PAGE, (a) => ({ at: a.at, id: a.id }));
  return c.json({ entries: items.map(auditView), next });
});

/** Trading an admin's one-time code for the support session, in the tab the admin opened. */
admin.post('/auth/support/exchange', requireFeature((cfg) => cfg.admin), perNetwork, async (c) => {
  const { ctx } = c.var;
  const b = await readBody(c.req.raw, ['code']);
  if (typeof b.code !== 'string' || !b.code || b.code.length > 100) throw wrongCode();
  const now = Date.now();
  const row = await ctx.db.takeSupportCode(await sha256(b.code), now);
  const who = row ? await ctx.db.userById(row.user_id) : null;
  // Suspended or made an admin since: the code no longer opens anything.
  if (!row || !who || who.suspended || isAdmin(ctx, who)) throw wrongCode();
  return c.json(await signedIn(ctx, who, deviceName(c.req.header('user-agent')), false, { support: { expires: now + SUPPORT_MS } }));
});
