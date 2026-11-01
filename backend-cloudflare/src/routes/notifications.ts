// The bell (PRD R4.1) and push (R4.2): the person's notifications, newest first, 50 to a page,
// kept 90 days; and the browsers they turned push on in, with a test to see it work.

import { Hono } from 'hono';
import { isId, paged, readBody, readCursor } from '../checks';
import type { NotificationRow } from '../db';
import { invalid } from '../errors';
import { HOUR, limit } from '../limits';
import { requireFeature, requireUser, type AppEnv } from '../middleware';
import { notify } from '../notify';
import { isPushEndpoint, pushKeys } from '../push';

const PAGE = 50;
const KEEP_MS = 90 * 24 * HOUR;
const TESTS_PER_HOUR = 5;

const iso = (ms: number) => new Date(ms).toISOString();
export const notificationView = (n: NotificationRow) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  url: n.url,
  createdAt: iso(n.created),
  readAt: n.read_at == null ? null : iso(n.read_at),
});

export const notifications = new Hono<AppEnv>();

notifications.get('/me/notifications', requireUser, async (c) => {
  const { ctx, user } = c.var;
  const before = readCursor(c.req.query('cursor'));
  const since = Date.now() - KEEP_MS;
  const [rows, unread] = await Promise.all([ctx.db.notifications(user.id, since, before, PAGE + 1), ctx.db.unreadCount(user.id, since)]);
  const { items, next } = paged(rows, PAGE, (n) => ({ at: n.created, id: n.id }));
  return c.json({ notifications: items.map(notificationView), unread, next });
});

notifications.post('/me/notifications/read', requireUser, async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['ids', 'all']);
  const bad = () => invalid('Say which notifications to mark read, or all of them.');
  let which: string[] | 'all';
  if (b.all !== undefined) {
    if (b.all !== true || b.ids !== undefined) throw bad();
    which = 'all';
  } else {
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 100 || !b.ids.every(isId)) throw bad();
    which = b.ids;
  }
  const now = Date.now();
  await ctx.db.readNotifications(user.id, which, now);
  return c.json({ unread: await ctx.db.unreadCount(user.id, now - KEEP_MS) });
});

// Scoped to its own paths: a sub-app's '*' would apply to every route once mounted.
const push = new Hono<AppEnv>();
for (const path of ['/me/push', '/me/push/*']) push.use(path, requireFeature((cfg) => cfg.push), requireUser);

push.put('/me/push', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['subscription']);
  const s = b.subscription as Record<string, unknown> | undefined;
  const keys = s && typeof s === 'object' && !Array.isArray(s) ? pushKeys(s.keys) : null;
  if (!s || !isPushEndpoint(s.endpoint, ctx.cfg.pushExtraHosts) || !keys)
    throw invalid("This browser's push subscription couldn't be read. Turn push off and on again.");
  await ctx.db.savePushSub({ endpoint: s.endpoint, userId: user.id, sessionId: c.var.session.id, ...keys, now: Date.now() });
  return c.body(null, 204);
});

push.delete('/me/push', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['endpoint']);
  // Succeeds whatever was sent, so turning push off never gets stuck.
  if (typeof b.endpoint === 'string' && b.endpoint.length <= 2048) await ctx.db.removePushSub(user.id, b.endpoint);
  return c.body(null, 204);
});

push.post('/me/push/test', async (c) => {
  const { ctx, user } = c.var;
  if (!(await ctx.db.pushSubs(user.id)).length) throw invalid('Turn on push on this device first.');
  await limit(ctx, `pushtest:${user.id}`, TESTS_PER_HOUR, HOUR, 'That is enough tests for now. Try again in an hour.');
  // Delivery that fails still counts as sent: the test is in the list either way.
  await notify(ctx, [user.id], { title: 'Test notification', body: 'Push works on this device.', url: null }, { wait: true });
  return c.body(null, 204);
});

notifications.route('/', push);
