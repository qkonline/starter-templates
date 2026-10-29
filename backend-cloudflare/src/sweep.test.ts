// What the daily sweep clears, with the clock moved on: notifications after 90 days (PRD R4.1),
// invites after their 7 days (R5.2), the audit log and contact messages after a year (R6.4).
import { describe, expect, it } from 'vitest';
import { fakeCtx } from '../test/fake-d1';

const DAY = 24 * 3600_000;
const now = 1_800_000_000_000;

async function people() {
  const { ctx, db } = fakeCtx({ TEAMS: 'true' });
  for (const id of ['ann', 'bob']) await ctx.db.createUser({ id, email: `${id}@b.test`, verified: true, password: null, now });
  return { ctx, db };
}

describe('the daily sweep', () => {
  it('keeps notifications 90 days', async () => {
    const { ctx } = await people();
    await ctx.db.addNotifications([
      { id: 'old', userId: 'ann', title: 't', body: 'b', url: null, now },
      { id: 'new', userId: 'ann', title: 't', body: 'b', url: null, now: now + 2 * DAY },
    ]);
    await ctx.db.sweep(now + 90 * DAY - 1000);
    expect((await ctx.db.notifications('ann', 0, null, 10)).map((n) => n.id)).toEqual(['new', 'old']);
    await ctx.db.sweep(now + 91 * DAY);
    expect((await ctx.db.notifications('ann', 0, null, 10)).map((n) => n.id)).toEqual(['new']);
  });

  it('ends invites after their 7 days, which stop working before that', async () => {
    const { ctx } = await people();
    await ctx.db.createTeam({ id: 't', name: 'T', userId: 'ann', now });
    await ctx.db.createInvite({
      id: 'i', team_id: 't', email: 'bob@b.test', role: 'member', by_name: null, by_email: 'ann@b.test',
      created: now, sent: now, expires: now + 7 * DAY, tokenHash: 'h',
    });
    expect(await ctx.db.invites('t', now + 7 * DAY - 1)).toHaveLength(1);
    expect(await ctx.db.invites('t', now + 7 * DAY + 1)).toEqual([]);
    expect(await ctx.db.acceptInvite('i', 'bob', 'bob@b.test', now + 7 * DAY + 1)).toBeNull();
    await ctx.db.sweep(now + 7 * DAY - 1);
    expect(await ctx.db.invite('i')).not.toBeNull();
    await ctx.db.sweep(now + 7 * DAY + 1);
    expect(await ctx.db.invite('i')).toBeNull();
  });

  it('keeps the audit log and contact messages a year', async () => {
    const { ctx } = await people();
    const ann = (await ctx.db.userById('ann'))!;
    const bob = (await ctx.db.userById('bob'))!;
    await ctx.db.addAudit({ id: 'a1', action: 'suspend', admin: ann, target: bob, detail: null, now });
    await ctx.db.addAudit({ id: 'a2', action: 'unsuspend', admin: ann, target: bob, detail: null, now: now + 30 * DAY });
    const message = (id: string, created: number) =>
      ctx.db.addMessage({ id, kind: 'contact', name: null, email: 'x@b.test', user_id: null, message: 'Hi', page: null, status: 'open', created });
    await message('m1', now);
    await message('m2', now + 30 * DAY);
    await ctx.db.sweep(now + 365 * DAY + 1000);
    expect((await ctx.db.audit(null, 10)).map((a) => a.id)).toEqual(['a2']);
    expect((await ctx.db.messages('open', null, 10)).map((m) => m.id)).toEqual(['m2']);
  });
});
