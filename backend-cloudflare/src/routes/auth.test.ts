// The confirmation code at sign-up: sent with CONFIRM_ON_SIGNUP or REQUIRE_VERIFIED_EMAIL,
// never otherwise, and /auth/methods says which.
import { describe, expect, it } from 'vitest';
import { fakeApp, fakeCtx } from '../../test/fake-d1';
import { devOutbox } from '../mail';
import { auth } from './auth';

async function signUp(vars: Record<string, string>) {
  const { ctx } = fakeCtx({ DEV_MAIL: 'true', ...vars });
  const app = fakeApp(ctx, auth);
  const email = `ann-${Math.random().toString(36).slice(2)}@b.test`;
  const r = await app.request('/auth/password/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, passwordKey: 'k'.repeat(43) }),
  });
  const methods = (await (await app.request('/auth/methods')).json()) as { confirmOnSignup: boolean; requireVerifiedEmail: boolean };
  return { status: r.status, mails: devOutbox.filter((m) => m.to === email).length, methods };
}

describe('the confirmation code at sign-up', () => {
  it('goes out with CONFIRM_ON_SIGNUP, without holding anyone back', async () => {
    expect(await signUp({ CONFIRM_ON_SIGNUP: 'true' })).toEqual({
      status: 200,
      mails: 1,
      methods: expect.objectContaining({ confirmOnSignup: true, requireVerifiedEmail: false }),
    });
  });

  it('goes out with REQUIRE_VERIFIED_EMAIL', async () => {
    expect(await signUp({ REQUIRE_VERIFIED_EMAIL: 'true' })).toMatchObject({ status: 200, mails: 1, methods: { confirmOnSignup: true } });
  });

  it('stays home with neither', async () => {
    expect(await signUp({})).toMatchObject({ status: 200, mails: 0, methods: { confirmOnSignup: false } });
  });
});
