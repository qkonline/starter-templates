// Telling people something (PRD section 4): a notification in their list (the bell), always, and
// a push to every browser they turned push on in, when the app has push. Push never replaces the
// list. A browser whose push service says it's gone (404 or 410) is forgotten.

import { randomToken } from './crypto';
import type { Ctx } from './env';
import { isPushEndpoint, sendPush, type PushMessage } from './push';

/** Push to every browser of this person; how many it reached. */
export async function pushTo(ctx: Ctx, userId: string, message: PushMessage): Promise<number> {
  const vapid = ctx.cfg.push;
  if (!vapid) return 0;
  // Only to the push services allowed now (subscribing checks too; this covers older rows).
  const subs = (await ctx.db.pushSubs(userId)).filter((s) => isPushEndpoint(s.endpoint, ctx.cfg.pushExtraHosts));
  const results = await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(s, message, vapid);
      if (r === 'gone') await ctx.db.dropPushSub(s.endpoint);
      return r;
    }),
  );
  return results.filter((r) => r === 'ok').length;
}

/**
 * Add the notification to each person's list, then push it. The pushes finish after the reply
 * unless `wait` (the push test waits, so what it reports is what happened).
 */
export async function notify(ctx: Ctx, userIds: string[], message: PushMessage, opts: { wait?: boolean } = {}): Promise<void> {
  if (!userIds.length) return;
  const now = Date.now();
  await ctx.db.addNotifications(userIds.map((userId) => ({ id: randomToken(12), userId, ...message, now })));
  if (!ctx.cfg.push) return;
  const pushes = Promise.all(userIds.map((id) => pushTo(ctx, id, message))).catch((e) => console.error('Push', e));
  if (opts.wait || !ctx.waitUntil) await pushes;
  else ctx.waitUntil(pushes);
}
