// What can be checked without a browser: the challenges and every refusal. Making and using a
// real passkey needs a WebAuthn authenticator, which the frontend's browser tests provide.

import { expect, test } from 'vitest';
import { call, confirm, expectError, expectReply, signUp } from './lib';

/** A signed-up account with its email confirmed: only those may add passkeys. */
const confirmed = async () => {
  const p = await signUp();
  await confirm(p);
  return p;
};

const junk = { id: 'bm90LWEta2V5', rawId: 'bm90LWEta2V5', type: 'public-key', response: {}, clientExtensionResults: {} };

test('a new account has none', async () => {
  const { token } = await signUp();
  const r = await call('get', '/me/passkeys', { token });
  expectReply(r, 'get', '/me/passkeys', 200);
  expect(r.body.passkeys).toEqual([]);
});

test('adding needs a confirmed email', async () => {
  const { token } = await signUp();
  expectError(await call('post', '/me/passkeys/start', { token }), 'post', '/me/passkeys/start', 403, 'email_unverified');
});

test('adding: options, then a bad answer refused', async () => {
  const { token } = await confirmed();
  const start = await call('post', '/me/passkeys/start', { token });
  expectReply(start, 'post', '/me/passkeys/start', 200);
  expect(start.body.options).toMatchObject({ challenge: expect.any(String), rp: expect.any(Object), user: expect.any(Object) });
  const finish = await call('post', '/me/passkeys/finish', { token, json: { challengeId: start.body.challengeId, response: junk } });
  expectError(finish, 'post', '/me/passkeys/finish', 400, 'passkey_refused');
  // The challenge was spent on that try.
  const again = await call('post', '/me/passkeys/finish', { token, json: { challengeId: start.body.challengeId, response: junk } });
  expectError(again, 'post', '/me/passkeys/finish', 400, 'passkey_refused');
});

test("another account's challenge", async () => {
  const a = await confirmed();
  const b = await signUp();
  const start = await call('post', '/me/passkeys/start', { token: a.token });
  const r = await call('post', '/me/passkeys/finish', { token: b.token, json: { challengeId: start.body.challengeId, response: junk } });
  expectError(r, 'post', '/me/passkeys/finish', 400, 'passkey_refused');
});

test('signing in: options, then an unknown passkey refused', async () => {
  const start = await call('post', '/auth/passkey/start');
  expectReply(start, 'post', '/auth/passkey/start', 200);
  // Signing in needs user verification (Face ID, Touch ID, a PIN).
  expect(start.body.options).toMatchObject({ challenge: expect.any(String), userVerification: 'required' });
  const r = await call('post', '/auth/passkey/finish', { json: { challengeId: start.body.challengeId, response: junk } });
  expectError(r, 'post', '/auth/passkey/finish', 400, 'passkey_refused');
  const unknown = await call('post', '/auth/passkey/finish', { json: { challengeId: 'no-such-challenge', response: junk } });
  expectError(unknown, 'post', '/auth/passkey/finish', 400, 'passkey_refused');
});

test("removing one that isn't there", async () => {
  const { token } = await signUp();
  expectError(await call('delete', '/me/passkeys/bm90LWEta2V5', { token }), 'delete', '/me/passkeys/{id}', 404, 'not_found');
});

test('signed out', async () => {
  expectError(await call('get', '/me/passkeys'), 'get', '/me/passkeys', 401, 'signed_out');
  expectError(await call('post', '/me/passkeys/start'), 'post', '/me/passkeys/start', 401, 'signed_out');
});
