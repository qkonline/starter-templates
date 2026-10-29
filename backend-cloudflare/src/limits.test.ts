// Rate limits and codes with many requests at once: never more through than the limit.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { matchCode, sendCode, takeCode, useCode } from './codes';
import { HOUR, limit, MINUTE, networkLimit, uncount, underLimit } from './limits';
import { devOutbox } from './mail';

afterEach(() => vi.useRealTimers());

const settled = async (ps: Promise<unknown>[]) => (await Promise.allSettled(ps)).filter((r) => r.status === 'fulfilled').length;

describe('limits', () => {
  it('lets no more through than the limit, however many arrive at once', async () => {
    const { ctx } = fakeCtx();
    expect(await settled(Array.from({ length: 20 }, () => limit(ctx, 'k', 6, HOUR)))).toBe(6);
  });

  it('says how long to wait, and starts again with a new window', async () => {
    const { ctx } = fakeCtx();
    const now = Date.now();
    await limit(ctx, 'k', 1, MINUTE, undefined, now);
    await expect(limit(ctx, 'k', 1, MINUTE, undefined, now + 20_000)).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 40 });
    await expect(limit(ctx, 'k', 1, MINUTE, undefined, now + MINUTE)).resolves.toBeUndefined();
  });

  it('gives a use back for a try that went well', async () => {
    const { ctx } = fakeCtx();
    for (let i = 0; i < 10; i++) {
      await limit(ctx, 'k', 2, HOUR);
      await uncount(ctx, 'k');
    }
    await limit(ctx, 'k', 2, HOUR);
    await limit(ctx, 'k', 2, HOUR);
    await expect(limit(ctx, 'k', 2, HOUR)).rejects.toMatchObject({ status: 429 });
  });

  it('forgets counts a day old in the daily sweep, and keeps newer ones', async () => {
    const { ctx, db } = fakeCtx();
    const now = Date.now();
    await limit(ctx, 'old', 5, HOUR, undefined, now - 25 * HOUR);
    await limit(ctx, 'new', 5, HOUR, undefined, now);
    await ctx.db.sweep(now);
    expect(db.prepare('SELECT key FROM limits').all()).toEqual([{ key: 'new' }]);
  });

  it('writes nothing once at the limit, until the window ends', async () => {
    const { ctx, db } = fakeCtx();
    const now = Date.now();
    for (let i = 0; i < 3; i++) await limit(ctx, 'k', 3, HOUR, undefined, now);
    const row = () => db.prepare('SELECT count, start FROM limits WHERE key = ?').get('k');
    const before = row();
    for (let i = 0; i < 5; i++) await expect(limit(ctx, 'k', 3, HOUR, undefined, now + 1000)).rejects.toMatchObject({ status: 429 });
    expect(await underLimit(ctx, 'k', 3, HOUR)).toBe(false);
    expect(row()).toEqual(before);
    await limit(ctx, 'k', 3, HOUR, undefined, now + HOUR);
    expect(row()).toEqual({ count: 1, start: now + HOUR });
  });

  it('counts per network, except in local development', async () => {
    const live = fakeCtx({ RESEND_API_KEY: 're_x' }).ctx;
    await networkLimit(live, 'n', 1, HOUR);
    await expect(networkLimit(live, 'n', 1, HOUR)).rejects.toMatchObject({ status: 429 });
    const dev = fakeCtx({ DEV_MAIL: 'true' }).ctx;
    for (let i = 0; i < 5; i++) await networkLimit(dev, 'n', 1, HOUR);
  });
});

describe('codes', () => {
  const lastCode = () => devOutbox.at(-1)!.text.match(/\b(\d{6})\b/)![1]!;

  it('works once, even sent many times at once', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const which = { purpose: 'signin' as const, subject: 'a@b.test' };
    await sendCode(ctx, which, 'a@b.test');
    const code = lastCode();
    expect(await settled(Array.from({ length: 5 }, async () => (await takeCode(ctx, which, code)) || Promise.reject()))).toBe(1);
  });

  it('gives five tries in all to wrong codes sent at once', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const which = { purpose: 'reset' as const, subject: 'a@b.test' };
    await sendCode(ctx, which, 'a@b.test');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    await Promise.all(Array.from({ length: 10 }, () => takeCode(ctx, which, wrong)));
    expect(await takeCode(ctx, which, code)).toBe(false);
  });

  it("can't stand in for another purpose or another account", async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    await sendCode(ctx, { purpose: 'change', subject: 'new@b.test', bind: 'ann' }, 'new@b.test');
    const code = lastCode();
    expect(await takeCode(ctx, { purpose: 'signin', subject: 'new@b.test' }, code)).toBe(false);
    expect(await takeCode(ctx, { purpose: 'change', subject: 'new@b.test', bind: 'bob' }, code)).toBe(false);
    expect(await takeCode(ctx, { purpose: 'change', subject: 'new@b.test', bind: 'ann' }, code)).toBe(true);
  });

  it('can be matched first and used after, once', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const which = { purpose: 'confirm' as const, subject: 'ann' };
    await sendCode(ctx, which, 'a@b.test');
    const code = lastCode();
    expect(await matchCode(ctx, which, code)).toBe(true);
    expect(await useCode(ctx, which, code)).toBe(true);
    expect(await useCode(ctx, which, code)).toBe(false);
  });

  it('runs out after 10 minutes', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const now = Date.now();
    const which = { purpose: 'signin' as const, subject: 'a@b.test' };
    await sendCode(ctx, which, 'a@b.test');
    const code = lastCode();
    vi.useFakeTimers({ now: now + 10 * MINUTE + 1000 });
    expect(await takeCode(ctx, which, code)).toBe(false);
  });

  it('works until then', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const now = Date.now();
    const which = { purpose: 'signin' as const, subject: 'a@b.test' };
    await sendCode(ctx, which, 'a@b.test');
    const code = lastCode();
    vi.useFakeTimers({ now: now + 9 * MINUTE });
    expect(await takeCode(ctx, which, code)).toBe(true);
  });

  it('at most six to one address an hour, a minute apart', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const now = Date.now();
    const which = { purpose: 'reset' as const, subject: 'a@b.test' };
    for (let i = 0; i < 6; i++) {
      vi.useFakeTimers({ now: now + i * (MINUTE + 1000) });
      await sendCode(ctx, which, 'a@b.test');
    }
    vi.useFakeTimers({ now: now + 7 * MINUTE });
    await expect(sendCode(ctx, which, 'a@b.test')).rejects.toMatchObject({ status: 429 });
    vi.useFakeTimers({ now: now + HOUR + MINUTE });
    await sendCode(ctx, which, 'a@b.test');
  });

  it('are stored keyed with CODE_PEPPER, and refused without it on a deployed API', async () => {
    const which = { purpose: 'signin' as const, subject: 'a@b.test' };
    const stored = async (vars: Record<string, string>, api?: string) => {
      const { ctx, db } = fakeCtx({ DEV_MAIL: 'true', ...vars }, { api });
      await sendCode(ctx, which, 'a@b.test');
      return { code: lastCode(), row: db.prepare('SELECT hash FROM codes').get() as { hash: string }, ctx };
    };
    const a = await stored({ CODE_PEPPER: 'one' });
    expect(await takeCode(a.ctx, which, a.code)).toBe(true);
    // The same code under another pepper is another hash: the database alone gives nothing away.
    const { ctx: other } = fakeCtx({ DEV_MAIL: 'true', CODE_PEPPER: 'two' });
    await other.db.putCode({ key: 'signin|a@b.test', hash: a.row.hash, sent: Date.now(), expires: Date.now() + MINUTE });
    expect(await takeCode(other, which, a.code)).toBe(false);
    const deployed = fakeCtx({ RESEND_API_KEY: 're_x' }, { api: 'https://api.example.com/api' }).ctx;
    await expect(sendCode(deployed, which, 'a@b.test', { deliver: false })).rejects.toThrow(/CODE_PEPPER/);
  });

  it("two accounts moving to one address each keep their own code", async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    const ann = { purpose: 'change' as const, subject: 'new@b.test', bind: 'ann' };
    const bob = { purpose: 'change' as const, subject: 'new@b.test', bind: 'bob' };
    await sendCode(ctx, ann, 'new@b.test');
    const annCode = lastCode();
    await sendCode(ctx, bob, 'new@b.test');
    expect(await takeCode(ctx, ann, annCode)).toBe(true);
  });

  it('waits a minute between codes to one address', async () => {
    const { ctx } = fakeCtx({ DEV_MAIL: 'true' });
    await sendCode(ctx, { purpose: 'signin', subject: 'a@b.test' }, 'a@b.test');
    await expect(sendCode(ctx, { purpose: 'signin', subject: 'a@b.test' }, 'a@b.test')).rejects.toMatchObject({ status: 429 });
    // Counted apart per purpose.
    await sendCode(ctx, { purpose: 'reset', subject: 'a@b.test' }, 'a@b.test');
  });
});
