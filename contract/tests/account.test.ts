import { describe, expect, test } from 'vitest';
import { call, captcha, codeFrom, confirm, expectError, expectReply, features, freshEmail, keyFor, methods, PASSWORD, signIn, signUp } from './lib';

const sendChange = (token: string, email: string, withCaptcha = true) =>
  call('post', '/me/email/send', { token, json: { email, ...(withCaptcha ? captcha() : {}) } });

// The smallest PNG there is: one transparent pixel.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

describe('name', () => {
  test('set, tidied', async () => {
    const { token } = await signUp();
    const r = await call('patch', '/me', { token, json: { name: '  Ada   Lovelace ' } });
    expectReply(r, 'patch', '/me', 200);
    expect(r.body.user.name).toBe('Ada Lovelace');
    expect((await call('get', '/me', { token })).body.user.name).toBe('Ada Lovelace');
  });

  test('control characters and line breaks become spaces', async () => {
    const { token } = await signUp();
    const r = await call('patch', '/me', { token, json: { name: 'Ada\n\tLovelace\u0007' } });
    expectReply(r, 'patch', '/me', 200);
    expect(r.body.user.name).toBe('Ada Lovelace');
  });

  test('empty, too long, or not text', async () => {
    const { token } = await signUp();
    for (const name of ['', '   ', '\u0000\u0001', 'x'.repeat(61), ` x${' '.repeat(200)}`, 42, null])
      expectError(await call('patch', '/me', { token, json: { name } }), 'patch', '/me', 400, 'invalid_input');
    expectReply(await call('patch', '/me', { token, json: { name: 'x'.repeat(60) } }), 'patch', '/me', 200);
  });

  test('signed out', async () => {
    expectError(await call('patch', '/me', { json: { name: 'Ada' } }), 'patch', '/me', 401, 'signed_out');
  });
});

describe('changing email', () => {
  test('confirmed by a code to the new address; the password moves with it', async () => {
    const a = await signUp();
    const next = freshEmail();
    const code = await codeFrom(next, () => sendChange(a.token, next));
    const r = await call('post', '/me/email/verify', {
      token: a.token,
      json: { email: next, code, currentPasswordKey: a.key, passwordKey: await keyFor(PASSWORD, next) },
    });
    expectReply(r, 'post', '/me/email/verify', 200);
    expect(r.body.user).toEqual({ ...a.user, email: next, emailVerified: true });
    // The same password now signs in at the new address only.
    expect((await signIn(next)).user.id).toBe(a.user.id);
    const old = await call('post', '/auth/password/signin', { json: { email: a.email, passwordKey: a.key, ...captcha() } });
    expectError(old, 'post', '/auth/password/signin', 400, 'invalid_credentials');
    // The old address is free again.
    expect((await signUp(a.email)).isNew).toBe(true);
  });

  test('a password account must send both keys, and the right current one', async () => {
    const a = await signUp();
    const next = freshEmail();
    const code = await codeFrom(next, () => sendChange(a.token, next));
    const newKey = await keyFor(PASSWORD, next);
    const missing = await call('post', '/me/email/verify', { token: a.token, json: { email: next, code } });
    expectError(missing, 'post', '/me/email/verify', 400, 'invalid_input');
    const wrong = await call('post', '/me/email/verify', {
      token: a.token,
      json: { email: next, code, currentPasswordKey: await keyFor('not it at all', a.email), passwordKey: newKey },
    });
    expectError(wrong, 'post', '/me/email/verify', 400, 'invalid_credentials');
    const right = await call('post', '/me/email/verify', { token: a.token, json: { email: next, code, currentPasswordKey: a.key, passwordKey: newKey } });
    expectReply(right, 'post', '/me/email/verify', 200);
  });

  test('to its own address is refused; one another account has gets the same answer as any, and no mail', async () => {
    const a = await signUp();
    const b = await signUp();
    expectError(await sendChange(a.token, a.email), 'post', '/me/email/send', 400, 'invalid_input');
    expectReply(await sendChange(a.token, b.email), 'post', '/me/email/send', 204);
    const mail = (await call('get', '/dev/mail')).body.mail as { to: string; subject: string }[];
    // Only the confirmation code an app that requires confirming sends at sign-up, never a change code.
    expect(mail.filter((m) => m.to === b.email)).toHaveLength(methods.requireVerifiedEmail ? 1 : 0);
    // Nobody holds a code for it, so moving there fails like any wrong code.
    const r = await call('post', '/me/email/verify', {
      token: a.token,
      json: { email: b.email, code: '123456', currentPasswordKey: a.key, passwordKey: await keyFor(PASSWORD, b.email) },
    });
    expectError(r, 'post', '/me/email/verify', 400, 'invalid_code');
  });

  test('at most five an hour from one account', async () => {
    const a = await signUp();
    for (let i = 0; i < 5; i++) expectReply(await sendChange(a.token, freshEmail()), 'post', '/me/email/send', 204);
    expectError(await sendChange(a.token, freshEmail()), 'post', '/me/email/send', 429, 'rate_limited');
  });

  test.skipIf(!methods.captcha)('without the CAPTCHA', async () => {
    const a = await signUp();
    expectError(await sendChange(a.token, freshEmail(), false), 'post', '/me/email/send', 400, 'captcha_failed');
  });

  test("the code only works for the account that asked, and can't sign in or reset", async () => {
    const a = await signUp();
    const b = await signUp();
    const next = freshEmail();
    const code = await codeFrom(next, () => sendChange(a.token, next));
    const keys = { currentPasswordKey: b.key, passwordKey: await keyFor(PASSWORD, next) };
    expectError(await call('post', '/me/email/verify', { token: b.token, json: { email: next, code, ...keys } }), 'post', '/me/email/verify', 400, 'invalid_code');
    expectError(await call('post', '/auth/password/reset', { json: { email: next, code, passwordKey: keys.passwordKey } }), 'post', '/auth/password/reset', 400, 'invalid_code');
  });

  test('someone else takes the address before the code is entered', async () => {
    const a = await signUp();
    const next = freshEmail();
    const code = await codeFrom(next, () => sendChange(a.token, next));
    await signUp(next);
    const r = await call('post', '/me/email/verify', {
      token: a.token,
      json: { email: next, code, currentPasswordKey: a.key, passwordKey: await keyFor(PASSWORD, next) },
    });
    expectError(r, 'post', '/me/email/verify', 409, 'email_taken');
  });
});

describe('photo', () => {
  test('set, served, removed', async () => {
    const { token } = await signUp();
    const r = await call('put', '/me/photo', { token, bytes: PNG, type: 'image/png' });
    expectReply(r, 'put', '/me/photo', 200);
    const url = r.body.user.photoUrl;
    expect(url).toEqual(expect.any(String));
    const img = await fetch(url);
    expect(img.status).toBe(200);
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);

    const again = await call('put', '/me/photo', { token, bytes: PNG, type: 'image/png' });
    expect(again.body.user.photoUrl).not.toBe(url);
    // The earlier photo is gone.
    expect((await fetch(url)).status).toBe(404);

    const gone = await call('delete', '/me/photo', { token });
    expectReply(gone, 'delete', '/me/photo', 200);
    expect(gone.body.user.photoUrl).toBeNull();
  });

  test('not an image, or too large', async () => {
    const { token } = await signUp();
    expectError(await call('put', '/me/photo', { token, bytes: PNG, type: 'text/plain' }), 'put', '/me/photo', 415, 'unsupported_type');
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expectError(await call('put', '/me/photo', { token, bytes: big, type: 'image/png' }), 'put', '/me/photo', 413, 'too_large');
  });

  test('at most 20 an hour', async () => {
    const { token } = await signUp();
    for (let i = 0; i < 20; i++) expectReply(await call('put', '/me/photo', { token, bytes: PNG, type: 'image/png' }), 'put', '/me/photo', 200);
    expectError(await call('put', '/me/photo', { token, bytes: PNG, type: 'image/png' }), 'put', '/me/photo', 429, 'rate_limited');
  });

  test('signed out', async () => {
    expectError(await call('put', '/me/photo', { bytes: PNG, type: 'image/png' }), 'put', '/me/photo', 401, 'signed_out');
  });
});

test('export', async () => {
  const { token, user } = await signUp();
  const r = await call('get', '/me/export', { token });
  expectReply(r, 'get', '/me/export', 200);
  expect(r.body.user).toEqual(user);
  expect(r.body.sessions).toHaveLength(1);
  expect(r.body).toMatchObject({ teams: [], notifications: [], pushSubscriptions: [], messages: [], invitesSent: [], invitesReceived: [] });
});

test('export: teams, messages, invites both ways, notifications', async () => {
  const a = await signUp();
  await confirm(a);
  const text = `Exported ${crypto.randomUUID()}`;
  expectReply(await call('post', '/contact', { token: a.token, json: { kind: 'feedback', message: text, ...captcha() } }), 'post', '/contact', 204);
  if (features.teams) {
    const b = await signUp();
    await confirm(b);
    const mine = (await call('post', '/teams', { token: a.token, json: { name: 'Mine' } })).body.team;
    const theirs = (await call('post', '/teams', { token: b.token, json: { name: 'Theirs' } })).body.team;
    expectReply(await call('post', `/teams/${mine.id}/invites`, { token: a.token, json: { email: b.email, role: 'admin' } }), 'post', '/teams/{teamId}/invites', 200);
    expectReply(await call('post', `/teams/${theirs.id}/invites`, { token: b.token, json: { email: a.email, role: 'member' } }), 'post', '/teams/{teamId}/invites', 200);
  }
  const r = await call('get', '/me/export', { token: a.token });
  expectReply(r, 'get', '/me/export', 200);
  expect(r.body.messages).toEqual([expect.objectContaining({ message: text, kind: 'feedback', userId: a.user.id })]);
  if (features.teams) {
    expect(r.body.teams).toEqual([expect.objectContaining({ name: 'Mine', role: 'admin' })]);
    expect(r.body.invitesSent).toEqual([expect.objectContaining({ team: expect.objectContaining({ name: 'Mine' }), role: 'admin' })]);
    expect(r.body.invitesReceived).toEqual([expect.objectContaining({ team: expect.objectContaining({ name: 'Theirs' }), role: 'member' })]);
    expect(r.body.notifications).toHaveLength(1);
  }
});

test('deleting the account', async () => {
  const a = await signUp();
  expectReply(await call('put', '/me/photo', { token: a.token, bytes: PNG, type: 'image/png' }), 'put', '/me/photo', 200);
  const photo = (await call('get', '/me', { token: a.token })).body.user.photoUrl as string;
  expectReply(await call('delete', '/me', { token: a.token }), 'delete', '/me', 204);
  expect((await fetch(photo)).status).toBe(404);
  expectError(await call('get', '/me', { token: a.token }), 'get', '/me', 401, 'signed_out');
  const again = await signUp(a.email);
  expect(again.user.id).not.toBe(a.user.id);
});
