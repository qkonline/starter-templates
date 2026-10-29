// Forgetting the password, and confirming the address: the two places a password account still
// needs email.

import { describe, expect, test } from 'vitest';
import { call, captcha, codeFrom, expectError, expectReply, features, freshEmail, keyFor, methods, signIn, signUp } from './lib';

const forgot = (email: string) => call('post', '/auth/password/forgot', { json: { email, ...captcha() } });

describe('forgot password', () => {
  test('an address with no account gets the same answer, and no mail', async () => {
    const email = freshEmail();
    expectReply(await forgot(email), 'post', '/auth/password/forgot', 204);
    const mail = (await call('get', '/dev/mail')).body.mail as { to: string }[];
    expect(mail.some((m) => m.to === email)).toBe(false);
  });

  test('the code sets a new password, signs in, confirms the address and ends every other session', async () => {
    const a = await signUp();
    const b = await signIn(a.email);
    const code = await codeFrom(a.email, () => forgot(a.email));
    const r = await call('post', '/auth/password/reset', {
      json: { email: a.email, code, passwordKey: await keyFor('remembered now', a.email) },
    });
    expectReply(r, 'post', '/auth/password/reset', 200);
    expect(r.body.isNew).toBe(false);
    expect(r.body.user).toMatchObject({ id: a.user.id, emailVerified: true, hasPassword: true });
    for (const token of [a.token, b.token]) expectError(await call('get', '/me', { token }), 'get', '/me', 401, 'signed_out');
    expectReply(await call('get', '/me', { token: r.body.token }), 'get', '/me', 200);
    await signIn(a.email, 'remembered now');
  });

  test('someone who signed up with an address they do not own loses it to the owner', async () => {
    const squatter = await signUp();
    const code = await codeFrom(squatter.email, () => forgot(squatter.email));
    const owner = await call('post', '/auth/password/reset', {
      json: { email: squatter.email, code, passwordKey: await keyFor('the real owner', squatter.email) },
    });
    expectReply(owner, 'post', '/auth/password/reset', 200);
    expectError(await call('get', '/me', { token: squatter.token }), 'get', '/me', 401, 'signed_out');
    const again = await call('post', '/auth/password/signin', { json: { email: squatter.email, passwordKey: squatter.key, ...captcha() } });
    expectError(again, 'post', '/auth/password/signin', 400, 'invalid_credentials');
  });

  test('taking an address back ends everything the squatter set up', async () => {
    const squatter = await signUp();
    // Unconfirmed, it can't add a passkey that would outlast the take-back.
    expectError(await call('post', '/me/passkeys/start', { token: squatter.token }), 'post', '/me/passkeys/start', 403, 'email_unverified');
    const other = await signIn(squatter.email);
    let endpoint: string | null = null;
    if (features.push) {
      const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
      const p256dh = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
      const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
      endpoint = `https://push.invalid/send/${crypto.randomUUID()}`;
      const sub = await call('put', '/me/push', { token: squatter.token, json: { subscription: { endpoint, keys: { p256dh, auth } } } });
      expectReply(sub, 'put', '/me/push', 204);
    }

    const code = await codeFrom(squatter.email, () => forgot(squatter.email));
    const owner = await call('post', '/auth/password/reset', {
      json: { email: squatter.email, code, passwordKey: await keyFor('the real owner', squatter.email) },
    });
    expectReply(owner, 'post', '/auth/password/reset', 200);
    for (const token of [squatter.token, other.token]) expectError(await call('get', '/me', { token }), 'get', '/me', 401, 'signed_out');
    const t = owner.body.token as string;
    const sessions = await call('get', '/me/sessions', { token: t });
    expect(sessions.body.sessions).toHaveLength(1);
    expect((await call('get', '/me/passkeys', { token: t })).body.passkeys).toEqual([]);
    // The squatter's push subscription went with it: there's no device to test.
    if (endpoint) expectError(await call('post', '/me/push/test', { token: t }), 'post', '/me/push/test', 400, 'invalid_input');
    // And the owner, now confirmed, may add a passkey.
    expectReply(await call('post', '/me/passkeys/start', { token: t }), 'post', '/me/passkeys/start', 200);
  });

  test('a wrong code, a code used twice, five wrong tries', async () => {
    const a = await signUp();
    const key = await keyFor('remembered now', a.email);
    const code = await codeFrom(a.email, () => forgot(a.email));
    const wrong = code === '000000' ? '111111' : '000000';
    const reset = (c: string) => call('post', '/auth/password/reset', { json: { email: a.email, code: c, passwordKey: key } });
    expectError(await reset(wrong), 'post', '/auth/password/reset', 400, 'invalid_code');
    expectReply(await reset(code), 'post', '/auth/password/reset', 200);
    expectError(await reset(code), 'post', '/auth/password/reset', 400, 'invalid_code');

    const b = await signUp();
    const codeB = await codeFrom(b.email, () => forgot(b.email));
    const resetB = (c: string) => call('post', '/auth/password/reset', { json: { email: b.email, code: c, passwordKey: key } });
    await Promise.all(Array.from({ length: 10 }, () => resetB(codeB === '000000' ? '111111' : '000000')));
    expectError(await resetB(codeB), 'post', '/auth/password/reset', 400, 'invalid_code');
  });

  test('a second code within a minute is refused', async () => {
    const a = await signUp();
    expectReply(await forgot(a.email), 'post', '/auth/password/forgot', 204);
    expectError(await forgot(a.email), 'post', '/auth/password/forgot', 429, 'rate_limited');
  });

  test.skipIf(!methods.captcha)('without the CAPTCHA', async () => {
    expectError(await call('post', '/auth/password/forgot', { json: { email: freshEmail() } }), 'post', '/auth/password/forgot', 400, 'captcha_failed');
  });
});

describe('confirming the address', () => {
  test('by a code sent to it', async () => {
    const a = await signUp();
    const code = await codeFrom(a.email, () => call('post', '/me/email/confirm/send', { token: a.token }));
    expectError(await call('post', '/me/email/confirm', { token: a.token, json: { code: code === '000000' ? '111111' : '000000' } }), 'post', '/me/email/confirm', 400, 'invalid_code');
    const r = await call('post', '/me/email/confirm', { token: a.token, json: { code } });
    expectReply(r, 'post', '/me/email/confirm', 200);
    expect(r.body.user.emailVerified).toBe(true);
    expectError(await call('post', '/me/email/confirm/send', { token: a.token }), 'post', '/me/email/confirm/send', 400, 'invalid_input');
  });

  test("the code is this account's alone, and can't reset the password", async () => {
    const a = await signUp();
    const b = await signUp();
    const code = await codeFrom(a.email, () => call('post', '/me/email/confirm/send', { token: a.token }));
    expectError(await call('post', '/me/email/confirm', { token: b.token, json: { code } }), 'post', '/me/email/confirm', 400, 'invalid_code');
    const reset = await call('post', '/auth/password/reset', { json: { email: a.email, code, passwordKey: a.key } });
    expectError(reset, 'post', '/auth/password/reset', 400, 'invalid_code');
  });

  test('signed out', async () => {
    expectError(await call('post', '/me/email/confirm/send'), 'post', '/me/email/confirm/send', 401, 'signed_out');
  });
});
