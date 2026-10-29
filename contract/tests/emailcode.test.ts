// Signing in by emailed code: optional per app, since every code is an email from the quota.

import { describe, expect, test } from 'vitest';
import { call, captcha, codeFrom, expectError, expectReply, freshEmail, methods, signIn, signUp } from './lib';

const send = (email: string, withCaptcha = true) =>
  call('post', '/auth/code/send', { json: { email, ...(withCaptcha ? captcha() : {}) } });
const verify = (email: string, code: string) => call('post', '/auth/code/verify', { json: { email, code } });

test.skipIf(methods.emailCode)('switched off, it is not there', async () => {
  expectError(await send(freshEmail()), 'post', '/auth/code/send', 404, 'not_found');
});

describe.skipIf(!methods.emailCode)('email codes', () => {
  test('a new address makes an account, already confirmed and without a password', async () => {
    const email = freshEmail();
    const r = await verify(email, await codeFrom(email, () => send(email)));
    expectReply(r, 'post', '/auth/code/verify', 200);
    expect(r.body.isNew).toBe(true);
    expect(r.body.user).toMatchObject({ email, emailVerified: true, hasPassword: false });
  });

  test('the address is trimmed and lower-cased; the code may have spaces', async () => {
    const email = freshEmail();
    const typed = `  ${email.toUpperCase()} `;
    const code = await codeFrom(email, () => send(typed));
    const r = await verify(typed, `${code.slice(0, 3)} ${code.slice(3)}`);
    expectReply(r, 'post', '/auth/code/verify', 200);
    expect(r.body.user.email).toBe(email);
  });

  test('not an address', async () => {
    for (const email of ['', 'nobody', 'a@b', 'a b@c.test']) expectError(await send(email), 'post', '/auth/code/send', 400, 'invalid_input');
  });

  test('a second code within a minute is refused', async () => {
    const email = freshEmail();
    expectReply(await send(email), 'post', '/auth/code/send', 204);
    expectError(await send(email), 'post', '/auth/code/send', 429, 'rate_limited');
  });

  test('a wrong code, a code for another address, a code used twice', async () => {
    const a = freshEmail();
    const code = await codeFrom(a, () => send(a));
    expectError(await verify(a, code === '000000' ? '111111' : '000000'), 'post', '/auth/code/verify', 400, 'invalid_code');
    expectError(await verify(freshEmail(), code), 'post', '/auth/code/verify', 400, 'invalid_code');
    expectError(await verify(a, '12'), 'post', '/auth/code/verify', 400, 'invalid_code');
    expectReply(await verify(a, code), 'post', '/auth/code/verify', 200);
    expectError(await verify(a, code), 'post', '/auth/code/verify', 400, 'invalid_code');
  });

  test('many wrong tries at once still get five; the same code at once signs in once', async () => {
    const a = freshEmail();
    const codeA = await codeFrom(a, () => send(a));
    await Promise.all(Array.from({ length: 10 }, () => verify(a, codeA === '000000' ? '111111' : '000000')));
    expectError(await verify(a, codeA), 'post', '/auth/code/verify', 400, 'invalid_code');

    const b = freshEmail();
    const codeB = await codeFrom(b, () => send(b));
    const replies = await Promise.all(Array.from({ length: 5 }, () => verify(b, codeB)));
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
  });

  test('on an unconfirmed password account, the code wins: password cleared, its sessions ended', async () => {
    const squatter = await signUp();
    const r = await verify(squatter.email, await codeFrom(squatter.email, () => send(squatter.email)));
    expectReply(r, 'post', '/auth/code/verify', 200);
    expect(r.body.user).toMatchObject({ id: squatter.user.id, emailVerified: true, hasPassword: false });
    expectError(await call('get', '/me', { token: squatter.token }), 'get', '/me', 401, 'signed_out');
    const again = await call('post', '/auth/password/signin', { json: { email: squatter.email, passwordKey: squatter.key, ...captcha() } });
    expectError(again, 'post', '/auth/password/signin', 400, 'invalid_credentials');
  });

  test('on a confirmed password account, the password stays', async () => {
    const a = await signUp();
    const code = await codeFrom(a.email, () => call('post', '/me/email/confirm/send', { token: a.token }));
    expectReply(await call('post', '/me/email/confirm', { token: a.token, json: { code } }), 'post', '/me/email/confirm', 200);
    // The confirm code and the sign-in code are counted apart, so no wait between them.
    const r = await verify(a.email, await codeFrom(a.email, () => send(a.email)));
    expect(r.body.user.hasPassword).toBe(true);
    expectReply(await call('get', '/me', { token: a.token }), 'get', '/me', 200);
    await signIn(a.email);
  });

  test.skipIf(!methods.captcha)('without the CAPTCHA', async () => {
    expectError(await send(freshEmail(), false), 'post', '/auth/code/send', 400, 'captcha_failed');
  });
});
