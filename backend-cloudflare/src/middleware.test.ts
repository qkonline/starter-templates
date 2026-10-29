// requireVerifiedEmail on an app's own route: only when the app requires confirmed email.
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { startSession } from './account';
import type { Env } from './env';
import { Refusal } from './errors';
import { requireUser, requireVerifiedEmail, type AppEnv } from './middleware';

async function appWith(vars: Partial<Env>, verified: boolean) {
  const { ctx } = fakeCtx(vars);
  await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified, password: null, now: Date.now() });
  const token = (await startSession(ctx, 'ann', 'Mac'))!;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('ctx', ctx);
    await next();
  });
  app.get('/notes', requireUser, requireVerifiedEmail, (c) => c.json({ notes: [] }));
  app.onError((e, c) => (e instanceof Refusal ? c.json({ code: e.code }, e.status) : c.json({ code: 'server_error' }, 500)));
  const get = (t?: string) => app.request('/notes', { headers: t ? { authorization: `Bearer ${t}` } : {} });
  return { get, token };
}

describe('requireVerifiedEmail', () => {
  it('holds back an unconfirmed person when the app requires it', async () => {
    const { get, token } = await appWith({ REQUIRE_VERIFIED_EMAIL: 'true' }, false);
    const r = await get(token);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ code: 'email_unverified' });
  });

  it('lets a confirmed person through', async () => {
    const { get, token } = await appWith({ REQUIRE_VERIFIED_EMAIL: 'true' }, true);
    expect((await get(token)).status).toBe(200);
  });

  it('lets everyone through when the app does not require it', async () => {
    const { get, token } = await appWith({}, false);
    expect((await get(token)).status).toBe(200);
  });

  it('is signed_out without a session', async () => {
    const { get } = await appWith({ REQUIRE_VERIFIED_EMAIL: 'true' }, true);
    expect((await get()).status).toBe(401);
    expect((await get('x'.repeat(43))).status).toBe(401);
  });
});
