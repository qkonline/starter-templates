// Adding passkeys: a confirmed email only (PRD R1.8), at most 20 (R1.6); signing in needs user
// verification.
import { describe, expect, it } from 'vitest';
import { fakeApp, fakeCtx } from '../../test/fake-d1';
import { startSession } from '../account';
import { passkeys } from './passkeys';

async function person(verified: boolean, keys = 0) {
  const { ctx } = fakeCtx();
  const now = Date.now();
  await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified, password: null, now });
  for (let i = 0; i < keys; i++)
    await ctx.db.addPasskey({ id: `k${i}`, user_id: 'ann', public_key: 'p', counter: 0, transports: null, device: 'Mac', created: now + i });
  const token = (await startSession(ctx, 'ann', 'Mac'))!;
  const app = fakeApp(ctx, passkeys);
  const start = async () => {
    const r = await app.request('/me/passkeys/start', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    return { status: r.status, body: (await r.json()) as { code?: string; options?: { authenticatorSelection?: { userVerification?: string } } } };
  };
  return { app, start };
}

describe('adding a passkey', () => {
  it('needs a confirmed email', async () => {
    const { start } = await person(false);
    expect(await start()).toMatchObject({ status: 403, body: { code: 'email_unverified' } });
  });

  it('asks for user verification', async () => {
    const { start } = await person(true);
    const r = await start();
    expect(r.status).toBe(200);
    expect(r.body.options?.authenticatorSelection?.userVerification).toBe('required');
  });

  it('stops at 20', async () => {
    expect((await (await person(true, 19)).start()).status).toBe(200);
    expect(await (await person(true, 20)).start()).toMatchObject({ status: 400, body: { code: 'invalid_input' } });
  });
});

it('signing in asks for user verification', async () => {
  const { app } = await person(true);
  const r = await app.request('/auth/passkey/start', { method: 'POST' });
  expect(((await r.json()) as { options: { userVerification: string } }).options.userVerification).toBe('required');
});
