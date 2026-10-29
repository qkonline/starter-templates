import { describe, expect, test } from 'vitest';
import { call, captcha, codeFrom, expectError, expectReply, freshEmail, keyFor, methods, PASSWORD, signIn, signUp } from './lib';

test('health', async () => {
  expectReply(await call('get', '/health'), 'get', '/health', 200);
});

test('the sign-in settings', async () => {
  expectReply(await call('get', '/auth/methods'), 'get', '/auth/methods', 200);
});

describe('signing up', () => {
  test('makes an account, signed in, unconfirmed', async () => {
    const s = await signUp();
    expect(s.isNew).toBe(true);
    expect(s.user).toMatchObject({ email: s.email, emailVerified: false, hasPassword: true, name: null, photoUrl: null });
    const me = await call('get', '/me', { token: s.token });
    expectReply(me, 'get', '/me', 200);
    expect(me.body.user).toEqual(s.user);
  });

  test.skipIf(methods.requireVerifiedEmail)('sends no email when the app does not require confirming', async () => {
    const s = await signUp();
    const mail = (await call('get', '/dev/mail')).body.mail as { to: string }[];
    expect(mail.some((m) => m.to === s.email)).toBe(false);
  });

  test('the address is trimmed and lower-cased', async () => {
    const email = freshEmail();
    const r = await call('post', '/auth/password/signup', {
      json: { email: `  ${email.toUpperCase()} `, passwordKey: await keyFor(PASSWORD, email), ...captcha() },
    });
    expectReply(r, 'post', '/auth/password/signup', 200);
    expect(r.body.user.email).toBe(email);
  });

  test('an address that already has an account', async () => {
    const { email } = await signUp();
    const r = await call('post', '/auth/password/signup', { json: { email, passwordKey: await keyFor('another one entirely', email), ...captcha() } });
    expectError(r, 'post', '/auth/password/signup', 409, 'email_taken');
  });

  test('not an address, or not a key', async () => {
    const key = await keyFor(PASSWORD, 'a@b.test');
    for (const json of [
      { email: 'nobody', passwordKey: key },
      { email: freshEmail(), passwordKey: 'hunter2' },
      { email: freshEmail(), passwordKey: key + 'x' },
      { email: freshEmail() },
    ])
      expectError(await call('post', '/auth/password/signup', { json: { ...json, ...captcha() } }), 'post', '/auth/password/signup', 400, 'invalid_input');
  });

  test.skipIf(!methods.captcha)('without the CAPTCHA', async () => {
    const email = freshEmail();
    const r = await call('post', '/auth/password/signup', { json: { email, passwordKey: await keyFor(PASSWORD, email) } });
    expectError(r, 'post', '/auth/password/signup', 400, 'captcha_failed');
  });
});

describe('signing in', () => {
  test('the same account, on another device', async () => {
    const a = await signUp();
    const b = await signIn(a.email);
    expect(b.isNew).toBe(false);
    expect(b.user.id).toBe(a.user.id);
    expect(b.token).not.toBe(a.token);
  });

  test('a wrong password and an unknown address get the same answer', async () => {
    const { email } = await signUp();
    const wrong = await call('post', '/auth/password/signin', { json: { email, passwordKey: await keyFor('not it at all', email), ...captcha() } });
    expectError(wrong, 'post', '/auth/password/signin', 400, 'invalid_credentials');
    const stranger = freshEmail();
    const unknown = await call('post', '/auth/password/signin', { json: { email: stranger, passwordKey: await keyFor(PASSWORD, stranger), ...captcha() } });
    expectError(unknown, 'post', '/auth/password/signin', 400, 'invalid_credentials');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  test("the key is salted with the address, so another address's key fails", async () => {
    const { email } = await signUp();
    const r = await call('post', '/auth/password/signin', { json: { email, passwordKey: await keyFor(PASSWORD, 'someone@else.test'), ...captcha() } });
    expectError(r, 'post', '/auth/password/signin', 400, 'invalid_credentials');
  });

  test('ten wrong tries hold the address back, even with the right password', async () => {
    const { email } = await signUp();
    const wrong = await keyFor('not it at all', email);
    for (let i = 0; i < 10; i++) await call('post', '/auth/password/signin', { json: { email, passwordKey: wrong, ...captcha() } });
    const r = await call('post', '/auth/password/signin', { json: { email, passwordKey: await keyFor(PASSWORD, email), ...captcha() } });
    expectError(r, 'post', '/auth/password/signin', 429, 'rate_limited');
  });

  test.skipIf(!methods.captcha)('without the CAPTCHA', async () => {
    const { email, key } = await signUp();
    expectError(await call('post', '/auth/password/signin', { json: { email, passwordKey: key } }), 'post', '/auth/password/signin', 400, 'captcha_failed');
  });
});

describe('changing the password', () => {
  test('knowing the current one: other devices are signed out, this one stays', async () => {
    const a = await signUp();
    const b = await signIn(a.email);
    const next = await keyFor('a brand new password', a.email);
    expectReply(await call('put', '/me/password', { token: a.token, json: { currentPasswordKey: a.key, passwordKey: next } }), 'put', '/me/password', 204);
    expectError(await call('get', '/me', { token: b.token }), 'get', '/me', 401, 'signed_out');
    expectReply(await call('get', '/me', { token: a.token }), 'get', '/me', 200);
    await signIn(a.email, 'a brand new password');
    const old = await call('post', '/auth/password/signin', { json: { email: a.email, passwordKey: a.key, ...captcha() } });
    expectError(old, 'post', '/auth/password/signin', 400, 'invalid_credentials');
  });

  test('a wrong current password', async () => {
    const a = await signUp();
    const r = await call('put', '/me/password', {
      token: a.token,
      json: { currentPasswordKey: await keyFor('not it at all', a.email), passwordKey: await keyFor('whatever new', a.email) },
    });
    expectError(r, 'put', '/me/password', 400, 'invalid_credentials');
  });

  test('signed out', async () => {
    const key = await keyFor(PASSWORD, 'a@b.test');
    expectError(await call('put', '/me/password', { json: { currentPasswordKey: key, passwordKey: key } }), 'put', '/me/password', 401, 'signed_out');
  });

  // An account without a password: made by an email code (the only kind this client can make).
  test.skipIf(!methods.emailCode)('an account without one sets its first through forgot password, not here', async () => {
    const email = freshEmail();
    const code = await codeFrom(email, () => call('post', '/auth/code/send', { json: { email, ...captcha() } }));
    const s = await call('post', '/auth/code/verify', { json: { email, code } });
    expectReply(s, 'post', '/auth/code/verify', 200);
    expect(s.body.user.hasPassword).toBe(false);
    const key = await keyFor(PASSWORD, email);
    const r = await call('put', '/me/password', { token: s.body.token, json: { currentPasswordKey: key, passwordKey: key } });
    expectError(r, 'put', '/me/password', 400, 'invalid_input');
  });
});

describe('the token', () => {
  test('none, or one that never worked', async () => {
    expectError(await call('get', '/me'), 'get', '/me', 401, 'signed_out');
    expectError(await call('get', '/me', { token: 'x'.repeat(43) }), 'get', '/me', 401, 'signed_out');
    expectError(await call('get', '/me', { token: 'x'.repeat(5000) }), 'get', '/me', 401, 'signed_out');
  });

  test('signing out ends it, and signing out twice is fine', async () => {
    const { token } = await signUp();
    expectReply(await call('post', '/auth/signout', { token }), 'post', '/auth/signout', 204);
    expectError(await call('get', '/me', { token }), 'get', '/me', 401, 'signed_out');
    expectReply(await call('post', '/auth/signout', { token }), 'post', '/auth/signout', 204);
    expectReply(await call('post', '/auth/signout'), 'post', '/auth/signout', 204);
  });
});
