// The admin area (optional): the app's admins are the confirmed accounts whose emails it lists
// (ADMIN_EMAIL here, which the backend must list). Finding people, suspending, deleting, support
// sessions, and the audit log of all of it. Admins are never the target of any of these.

import { describe, expect, test } from 'vitest';
import {
  ADMIN_EMAIL,
  asAdmin,
  call,
  captcha,
  codeFrom,
  expectError,
  expectReply,
  features,
  freshEmail,
  keyFor,
  methods,
  type Method,
  PASSWORD,
  signIn,
  signUp,
} from './lib';

/** Every page of a list until `pick` finds an item, or null. */
async function findPaged<T>(token: string, path: string, key: string, pick: (item: T) => boolean, pages = 20): Promise<T | null> {
  let cursor: string | null = null;
  for (let i = 0; i < pages; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await call('get', cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path, { token });
    expect(r.status).toBe(200);
    const found = (r.body[key] as T[]).find(pick);
    if (found) return found;
    cursor = r.body.next;
    if (!cursor) return null;
  }
  return null;
}

type Entry = { action: string; target: { email: string; name: string | null }; admin: { email: string }; detail: string | null };
const audited = (token: string, action: string, email: string) =>
  findPaged<Entry>(token, '/admin/audit', 'entries', (e) => e.action === action && e.target.email === email);

test.skipIf(features.admin)('with the admin area off, nobody is an admin', async () => {
  const admin = await asAdmin();
  expect(admin.user.isAdmin).toBe(false);
});

// Signed in once for the file, when there's an admin area to sign in to.
const admin = features.admin ? await asAdmin() : (null as never);

describe.skipIf(!features.admin)('admin area', () => {
  const as = (method: Method, path: string, json?: unknown) => call(method, path, { token: admin.token, json });

  test('the listed, confirmed account is an admin; nobody else is', async () => {
    expect(admin.user).toMatchObject({ email: ADMIN_EMAIL, emailVerified: true, isAdmin: true });
    expect((await call('get', '/me', { token: admin.token })).body.user.isAdmin).toBe(true);
    const someone = await signUp();
    expect(someone.user.isAdmin).toBe(false);
    for (const path of ['/admin/stats', '/admin/users', '/admin/messages', '/admin/errors', '/admin/audit'])
      expectError(await call('get', path, { token: someone.token }), 'get', path, 403, 'forbidden');
    expectError(await call('post', `/admin/users/${admin.user.id}/suspend`, { token: someone.token, json: {} }), 'post', '/admin/users/{userId}/suspend', 403, 'forbidden');
  });

  test('signed out', async () => {
    expectError(await call('get', '/admin/stats'), 'get', '/admin/stats', 401, 'signed_out');
    expectError(await call('get', '/admin/users'), 'get', '/admin/users', 401, 'signed_out');
  });

  test('the counts', async () => {
    const r = await as('get', '/admin/stats');
    expectReply(r, 'get', '/admin/stats', 200);
    expect(r.body.users).toBeGreaterThanOrEqual(1);
    expect(r.body.teams === null).toBe(!features.teams);
  });

  describe('finding people', () => {
    test('by the start of the email, or a word of the name; newest first', async () => {
      const word = `Zq${Math.random().toString(36).slice(2, 8)}`;
      const p = await signUp();
      await call('patch', '/me', { token: p.token, json: { name: `Ada ${word} Lovelace` } });
      const local = p.email.split('@')[0]!;

      const byEmail = await as('get', `/admin/users?q=${encodeURIComponent(local)}`);
      expectReply(byEmail, 'get', '/admin/users', 200);
      expect(byEmail.body.users.map((u: { id: string }) => u.id)).toEqual([p.user.id]);
      expect(byEmail.body.users[0]).toMatchObject({ email: p.email, isAdmin: false, suspended: false, name: `Ada ${word} Lovelace` });
      expect(byEmail.body.users[0].lastActiveAt).toEqual(expect.any(String));
      expect(byEmail.body.users[0].teams === null).toBe(!features.teams);

      const byName = await as('get', `/admin/users?q=${encodeURIComponent(word)}`);
      expect(byName.body.users.map((u: { id: string }) => u.id)).toEqual([p.user.id]);
      // Not from the middle of a word.
      expect((await as('get', `/admin/users?q=${encodeURIComponent(word.slice(2))}`)).body.users).toEqual([]);

      const one = await as('get', `/admin/users/${p.user.id}`);
      expectReply(one, 'get', '/admin/users/{userId}', 200);
      expect(one.body.user).toEqual(byEmail.body.users[0]);
      expectError(await as('get', '/admin/users/no-such-person'), 'get', '/admin/users/{userId}', 404, 'not_found');
    });

    test('page by page, with `next`', async () => {
      await Promise.all(Array.from({ length: 3 }, () => signUp()));
      const first = await as('get', '/admin/users');
      expectReply(first, 'get', '/admin/users', 200);
      const times = first.body.users.map((u: { createdAt: string }) => u.createdAt);
      expect([...times].sort().reverse()).toEqual(times);
      if (first.body.next) {
        const second = await as('get', `/admin/users?cursor=${encodeURIComponent(first.body.next)}`);
        expectReply(second, 'get', '/admin/users', 200);
        const ids = new Set(first.body.users.map((u: { id: string }) => u.id));
        expect(second.body.users.some((u: { id: string }) => ids.has(u.id))).toBe(false);
        expect(second.body.users[0].createdAt <= times.at(-1)).toBe(true);
      }
      expectError(await as('get', '/admin/users?cursor=%21%21nonsense'), 'get', '/admin/users', 400, 'invalid_input');
    });
  });

  test('admins are never suspended, deleted or supported', async () => {
    const me = admin.user.id;
    expectError(await as('post', `/admin/users/${me}/suspend`, {}), 'post', '/admin/users/{userId}/suspend', 403, 'forbidden');
    expectError(await as('delete', `/admin/users/${me}`), 'delete', '/admin/users/{userId}', 403, 'forbidden');
    expectError(await as('post', `/admin/users/${me}/support`), 'post', '/admin/users/{userId}/support', 403, 'forbidden');
    expect((await call('get', '/me', { token: admin.token })).status).toBe(200);
  });

  describe('suspending', () => {
    test('every session ends, every sign-in is refused, until unsuspended', async () => {
      const p = await signUp();
      const other = await signIn(p.email);
      const r = await as('post', `/admin/users/${p.user.id}/suspend`, { reason: 'Spam, says the test' });
      expectReply(r, 'post', '/admin/users/{userId}/suspend', 200);
      expect(r.body.user).toMatchObject({ id: p.user.id, suspended: true, lastActiveAt: null });

      for (const token of [p.token, other.token]) expectError(await call('get', '/me', { token }), 'get', '/me', 401, 'signed_out');

      const signin = await call('post', '/auth/password/signin', { json: { email: p.email, passwordKey: p.key, ...captcha() } });
      expectError(signin, 'post', '/auth/password/signin', 403, 'account_suspended');
      // A wrong password still says only that.
      const wrong = await call('post', '/auth/password/signin', {
        json: { email: p.email, passwordKey: await keyFor('not it at all', p.email), ...captcha() },
      });
      expectError(wrong, 'post', '/auth/password/signin', 400, 'invalid_credentials');

      const code = await codeFrom(p.email, () => call('post', '/auth/password/forgot', { json: { email: p.email, ...captcha() } }));
      const reset = await call('post', '/auth/password/reset', { json: { email: p.email, code, passwordKey: await keyFor('new one', p.email) } });
      expectError(reset, 'post', '/auth/password/reset', 403, 'account_suspended');

      if (methods.emailCode) {
        const signinCode = await codeFrom(p.email, () => call('post', '/auth/code/send', { json: { email: p.email, ...captcha() } }));
        const v = await call('post', '/auth/code/verify', { json: { email: p.email, code: signinCode } });
        expectError(v, 'post', '/auth/code/verify', 403, 'account_suspended');
      }

      const audit = await audited(admin.token, 'suspend', p.email);
      expect(audit).toMatchObject({ admin: { email: ADMIN_EMAIL }, detail: 'Spam, says the test' });

      const back = await as('post', `/admin/users/${p.user.id}/unsuspend`);
      expectReply(back, 'post', '/admin/users/{userId}/unsuspend', 200);
      expect(back.body.user.suspended).toBe(false);
      // The password was never changed by the refused reset.
      expect((await signIn(p.email, PASSWORD)).user.id).toBe(p.user.id);
      expect(await audited(admin.token, 'unsuspend', p.email)).not.toBeNull();
    });

    test('a reason that is too long; someone who is not there', async () => {
      const p = await signUp();
      expectError(await as('post', `/admin/users/${p.user.id}/suspend`, { reason: 'x'.repeat(501) }), 'post', '/admin/users/{userId}/suspend', 400, 'invalid_input');
      expectError(await as('post', '/admin/users/no-such-person/suspend', {}), 'post', '/admin/users/{userId}/suspend', 404, 'not_found');
      expectError(await as('post', '/admin/users/no-such-person/unsuspend'), 'post', '/admin/users/{userId}/unsuspend', 404, 'not_found');
    });
  });

  test('deleting someone, as they would themselves', async () => {
    const p = await signUp();
    await call('patch', '/me', { token: p.token, json: { name: 'Gone Soon' } });
    expectReply(await as('delete', `/admin/users/${p.user.id}`), 'delete', '/admin/users/{userId}', 204);
    expectError(await call('get', '/me', { token: p.token }), 'get', '/me', 401, 'signed_out');
    expectError(await as('get', `/admin/users/${p.user.id}`), 'get', '/admin/users/{userId}', 404, 'not_found');
    expectError(await as('delete', `/admin/users/${p.user.id}`), 'delete', '/admin/users/{userId}', 404, 'not_found');
    // The log keeps them as they were.
    expect(await audited(admin.token, 'delete', p.email)).toMatchObject({ target: { email: p.email, name: 'Gone Soon' } });
    expect((await signUp(p.email)).user.id).not.toBe(p.user.id);
  });

  describe('support sessions', () => {
    const open = async (userId: string) => {
      const r = await as('post', `/admin/users/${userId}/support`);
      expectReply(r, 'post', '/admin/users/{userId}/support', 200);
      const s = await call('post', '/auth/support/exchange', { json: { code: r.body.code } });
      expectReply(s, 'post', '/auth/support/exchange', 200);
      return { code: r.body.code as string, token: s.body.token as string, body: s.body };
    };

    test('the person as they are, marked support, and on the audit log', async () => {
      const p = await signUp();
      await call('patch', '/me', { token: p.token, json: { name: 'Helped' } });
      const s = await open(p.user.id);
      expect(s.body.isNew).toBe(false);
      expect(s.body.user).toMatchObject({ id: p.user.id, email: p.email, name: 'Helped', isAdmin: false });
      expectReply(await call('get', '/me', { token: s.token }), 'get', '/me', 200);
      expectReply(await call('get', '/me/notifications', { token: s.token }), 'get', '/me/notifications', 200);
      if (features.teams) expectReply(await call('get', '/teams', { token: s.token }), 'get', '/teams', 200);

      // The person sees it among their devices, and can end it.
      const mine = await call('get', '/me/sessions', { token: p.token });
      const support = (mine.body.sessions as { id: string; support: boolean }[]).filter((x) => x.support);
      expect(support).toHaveLength(1);
      expect(mine.body.sessions.filter((x: { support: boolean }) => !x.support)).toHaveLength(1);
      expect(await audited(admin.token, 'support', p.email)).toMatchObject({ admin: { email: ADMIN_EMAIL } });

      expectReply(await call('delete', `/me/sessions/${support[0]!.id}`, { token: p.token }), 'delete', '/me/sessions/{id}', 204);
      expectError(await call('get', '/me', { token: s.token }), 'get', '/me', 401, 'signed_out');
    });

    test('refused on every account and security path, and on the admin area', async () => {
      const p = await signUp();
      const s = await open(p.user.id);
      const key = await keyFor(PASSWORD, p.email);
      const other = freshEmail();
      const refused: [Method, string, string, unknown?][] = [
        ['patch', '/me', '/me', { name: 'Changed by support' }],
        ['delete', '/me', '/me'],
        ['put', '/me/password', '/me/password', { currentPasswordKey: key, passwordKey: key }],
        ['post', '/me/email/confirm/send', '/me/email/confirm/send'],
        ['post', '/me/email/confirm', '/me/email/confirm', { code: '123456' }],
        ['post', '/me/email/send', '/me/email/send', { email: other }],
        ['post', '/me/email/verify', '/me/email/verify', { email: other, code: '123456', currentPasswordKey: key, passwordKey: key }],
        ['delete', '/me/photo', '/me/photo'],
        ['get', '/me/export', '/me/export'],
        ['get', '/me/sessions', '/me/sessions'],
        ['delete', '/me/sessions', '/me/sessions'],
        ['delete', '/me/sessions/some-session', '/me/sessions/{id}'],
        ['get', '/me/passkeys', '/me/passkeys'],
        ['post', '/me/passkeys/start', '/me/passkeys/start'],
        ['post', '/me/passkeys/finish', '/me/passkeys/finish', { challengeId: 'x', response: {} }],
        ['delete', '/me/passkeys/some-key', '/me/passkeys/{id}'],
        ['get', '/admin/stats', '/admin/stats'],
        ['get', '/admin/users', '/admin/users'],
        ['get', `/admin/users/${p.user.id}`, '/admin/users/{userId}'],
        ['get', '/admin/audit', '/admin/audit'],
      ];
      if (features.push)
        refused.push(
          ['put', '/me/push', '/me/push', { subscription: { endpoint: 'https://push.invalid/x', keys: { p256dh: 'x', auth: 'y' } } }],
          ['delete', '/me/push', '/me/push', { endpoint: 'https://push.invalid/x' }],
          ['post', '/me/push/test', '/me/push/test'],
        );
      for (const [method, path, specPath, json] of refused) expectError(await call(method, path, { token: s.token, json }), method, specPath, 403, 'forbidden');
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      expectError(await call('put', '/me/photo', { token: s.token, bytes: png, type: 'image/png' }), 'put', '/me/photo', 403, 'forbidden');

      // Nothing changed, and both sessions are still there.
      const me = await call('get', '/me', { token: p.token });
      expect(me.body.user).toEqual(p.user);
      expect((await call('get', '/me/sessions', { token: p.token })).body.sessions).toHaveLength(2);
      expectReply(await call('get', '/me', { token: s.token }), 'get', '/me', 200);
    });

    test('a code works once', async () => {
      const p = await signUp();
      const s = await open(p.user.id);
      expectError(await call('post', '/auth/support/exchange', { json: { code: s.code } }), 'post', '/auth/support/exchange', 400, 'invalid_code');
      expectError(await call('post', '/auth/support/exchange', { json: { code: 'x'.repeat(40) } }), 'post', '/auth/support/exchange', 400, 'invalid_code');
    });

    test('not for suspended people; suspending ends one already open', async () => {
      const p = await signUp();
      const s = await open(p.user.id);
      await as('post', `/admin/users/${p.user.id}/suspend`, {});
      expectError(await call('get', '/me', { token: s.token }), 'get', '/me', 401, 'signed_out');
      expectError(await as('post', `/admin/users/${p.user.id}/support`), 'post', '/admin/users/{userId}/support', 403, 'forbidden');
      expectError(await as('post', '/admin/users/no-such-person/support'), 'post', '/admin/users/{userId}/support', 404, 'not_found');
    });

    test("signing the person's other devices out ends it too", async () => {
      const p = await signUp();
      const s = await open(p.user.id);
      expectReply(await call('delete', '/me/sessions', { token: p.token }), 'delete', '/me/sessions', 204);
      expectError(await call('get', '/me', { token: s.token }), 'get', '/me', 401, 'signed_out');
    });
  });

  test('the audit log, page by page', async () => {
    const r = await as('get', '/admin/audit');
    expectReply(r, 'get', '/admin/audit', 200);
    const times = r.body.entries.map((e: { at: string }) => e.at);
    expect([...times].sort().reverse()).toEqual(times);
    expectError(await as('get', '/admin/audit?cursor=%21%21nonsense'), 'get', '/admin/audit', 400, 'invalid_input');
  });
});
