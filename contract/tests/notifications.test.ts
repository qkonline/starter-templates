// The in-app notifications (the bell) and push. Notifications are made by what the contract
// says makes them: an invite to an account's address (teams on) and a push test (push on). A
// real browser can't be faked here, so push subscribes with a made-up https endpoint whose host
// never resolves (`.invalid`, RFC 2606): delivery fails, and the backend must still answer.

import { describe, expect, test } from 'vitest';
import { call, confirm, expectError, expectReply, features, signUp } from './lib';

const list = (token: string, cursor?: string) =>
  call('get', `/me/notifications${cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`}`, { token });
const read = (token: string, json: unknown) => call('post', '/me/notifications/read', { token, json });

/** A browser's subscription, with real keys, to an endpoint nobody answers. */
async function subscription() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const p256dh = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  return { endpoint: `https://push.invalid/send/${crypto.randomUUID()}`, expirationTime: null, keys: { p256dh, auth } };
}

describe('the list', () => {
  test('a new account has none', async () => {
    const { token } = await signUp();
    const r = await list(token);
    expectReply(r, 'get', '/me/notifications', 200);
    expect(r.body).toEqual({ notifications: [], unread: 0, next: null });
  });

  test('marking: all, ids that are not there, and bodies that are not allowed', async () => {
    const { token } = await signUp();
    const all = await read(token, { all: true });
    expectReply(all, 'post', '/me/notifications/read', 200);
    expect(all.body.unread).toBe(0);
    expectReply(await read(token, { ids: ['not-one-of-mine'] }), 'post', '/me/notifications/read', 200);
    for (const json of [{}, { ids: [] }, { all: false }, { ids: ['a b'] }, { ids: Array.from({ length: 101 }, (_, i) => `n${i}`) }, { ids: ['a'], all: true }])
      expectError(await read(token, json), 'post', '/me/notifications/read', 400, 'invalid_input');
  });

  test('a cursor that was never given', async () => {
    const { token } = await signUp();
    expectError(await list(token, '!!not a cursor!!'), 'get', '/me/notifications', 400, 'invalid_input');
  });

  test('signed out', async () => {
    expectError(await call('get', '/me/notifications'), 'get', '/me/notifications', 401, 'signed_out');
    expectError(await call('post', '/me/notifications/read', { json: { all: true } }), 'post', '/me/notifications/read', 401, 'signed_out');
  });
});

// 51 notifications need 51 invites: two teams with an admin each (an account sends at most 50
// invites a day), each inviting, then withdrawing, again and again.
describe.skipIf(!features.teams)('fifty to a page', () => {
  test(
    'newest first, `next` for the rest; read by id or all; ids of others are ignored',
    async () => {
      const admins = [await signUp(), await signUp()];
      for (const a of admins) await confirm(a);
      const person = await signUp();
      const stranger = await signUp();
      for (let t = 0; t < 2; t++) {
        const admin = admins[t]!;
        const team = (await call('post', '/teams', { token: admin.token, json: { name: `Paging ${t}` } })).body.team;
        for (let i = 0; i < (t ? 25 : 26); i++) {
          const r = await call('post', `/teams/${team.id}/invites`, { token: admin.token, json: { email: person.email, role: 'member' } });
          expectReply(r, 'post', '/teams/{teamId}/invites', 200);
          expectReply(await call('delete', `/teams/${team.id}/invites/${r.body.invite.id}`, { token: admin.token }), 'delete', '/teams/{teamId}/invites/{inviteId}', 204);
        }
      }

      const first = await list(person.token);
      expectReply(first, 'get', '/me/notifications', 200);
      expect(first.body.notifications).toHaveLength(50);
      expect(first.body.unread).toBe(51);
      expect(first.body.next).toEqual(expect.any(String));
      const times = first.body.notifications.map((n: { createdAt: string }) => n.createdAt);
      expect([...times].sort().reverse()).toEqual(times);

      const second = await list(person.token, first.body.next);
      expectReply(second, 'get', '/me/notifications', 200);
      expect(second.body.notifications).toHaveLength(1);
      expect(second.body.next).toBeNull();
      const ids = [...first.body.notifications, ...second.body.notifications].map((n: { id: string }) => n.id);
      expect(new Set(ids).size).toBe(51);
      expect(second.body.notifications[0].createdAt <= times.at(-1)).toBe(true);

      // Someone else can't mark them.
      expectReply(await read(stranger.token, { ids: ids.slice(0, 10) }), 'post', '/me/notifications/read', 200);
      expect((await list(person.token)).body.unread).toBe(51);

      const some = await read(person.token, { ids: ids.slice(0, 3) });
      expectReply(some, 'post', '/me/notifications/read', 200);
      expect(some.body.unread).toBe(48);
      const after = (await list(person.token)).body.notifications as { id: string; readAt: string | null }[];
      expect(after.filter((n) => n.readAt !== null).map((n) => n.id).sort()).toEqual(ids.slice(0, 3).sort());

      const all = await read(person.token, { all: true });
      expect(all.body.unread).toBe(0);
      expect((await list(person.token)).body.unread).toBe(0);
    },
    60_000,
  );
});

describe.skipIf(!features.push)('push', () => {
  test('subscribe, send a test that reaches nobody: still sent, and in the list', async () => {
    const { token } = await signUp();
    const sub = await subscription();
    expectReply(await call('put', '/me/push', { token, json: { subscription: sub } }), 'put', '/me/push', 204);
    // The same endpoint again updates it rather than adding another.
    expectReply(await call('put', '/me/push', { token, json: { subscription: sub } }), 'put', '/me/push', 204);

    expectReply(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 204);
    const r = await list(token);
    expectReply(r, 'get', '/me/notifications', 200);
    expect(r.body.notifications).toHaveLength(1);
    expect(r.body.unread).toBe(1);
    expect(r.body.notifications[0].readAt).toBeNull();

    // Delivery failed, but nobody said the subscription is gone (a 404 or 410), so it's kept.
    expectReply(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 204);
    expect((await list(token)).body.notifications).toHaveLength(2);
  });

  test('no device subscribed, or unsubscribed', async () => {
    const { token } = await signUp();
    expectError(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 400, 'invalid_input');
    const sub = await subscription();
    await call('put', '/me/push', { token, json: { subscription: sub } });
    expectReply(await call('delete', '/me/push', { token, json: { endpoint: sub.endpoint } }), 'delete', '/me/push', 204);
    expectError(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 400, 'invalid_input');
    // Removing one that isn't saved is fine too.
    expectReply(await call('delete', '/me/push', { token, json: { endpoint: sub.endpoint } }), 'delete', '/me/push', 204);
  });

  test("another account's endpoint can't be removed by someone else", async () => {
    const a = await signUp();
    const b = await signUp();
    const sub = await subscription();
    await call('put', '/me/push', { token: a.token, json: { subscription: sub } });
    expectReply(await call('delete', '/me/push', { token: b.token, json: { endpoint: sub.endpoint } }), 'delete', '/me/push', 204);
    expectReply(await call('post', '/me/push/test', { token: a.token }), 'post', '/me/push/test', 204);
  });

  test('not https, or not a subscription', async () => {
    const { token } = await signUp();
    const sub = await subscription();
    for (const subscription of [
      { ...sub, endpoint: 'http://push.invalid/plain' },
      { ...sub, endpoint: 'not a url' },
      { endpoint: sub.endpoint },
      { ...sub, keys: { p256dh: sub.keys.p256dh } },
    ])
      expectError(await call('put', '/me/push', { token, json: { subscription } }), 'put', '/me/push', 400, 'invalid_input');
    expectError(await call('put', '/me/push', { token, json: {} }), 'put', '/me/push', 400, 'invalid_input');
  });

  test('at most five tests an hour', async () => {
    const { token } = await signUp();
    await call('put', '/me/push', { token, json: { subscription: await subscription() } });
    for (let i = 0; i < 5; i++) expectReply(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 204);
    expectError(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 429, 'rate_limited');
  });

  test('signed out', async () => {
    const sub = await subscription();
    expectError(await call('put', '/me/push', { json: { subscription: sub } }), 'put', '/me/push', 401, 'signed_out');
    expectError(await call('post', '/me/push/test'), 'post', '/me/push/test', 401, 'signed_out');
  });
});
