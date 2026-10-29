// The optional parts an app switches on (`/features`): each is either fully there or answers
// `not_found` on every one of its paths.

import { expect, test } from 'vitest';
import { call, expectError, expectReply, features, signUp } from './lib';

test('the switches', async () => {
  expectReply(await call('get', '/features'), 'get', '/features', 200);
});

test.skipIf(!features.push)("push's public key is a P-256 point, as browsers subscribe with it", () => {
  const key = Buffer.from(features.push!.vapidPublicKey, 'base64url');
  expect(features.push!.vapidPublicKey).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(key).toHaveLength(65);
  expect(key[0]).toBe(4);
});

test('nobody is an admin of the app by signing up', async () => {
  const s = await signUp();
  expect(s.user.isAdmin).toBe(false);
});

test.skipIf(features.teams)('teams switched off are not there', async () => {
  const { token } = await signUp();
  expectError(await call('get', '/teams', { token }), 'get', '/teams', 404, 'not_found');
  expectError(await call('post', '/teams', { token, json: { name: 'Off' } }), 'post', '/teams', 404, 'not_found');
  expectError(await call('get', '/invites', { token }), 'get', '/invites', 404, 'not_found');
  expectError(await call('post', '/invites/accept', { token, json: { token: 'x'.repeat(32) } }), 'post', '/invites/accept', 404, 'not_found');
});

test.skipIf(features.admin)('the admin area switched off is not there', async () => {
  const { token } = await signUp();
  expectError(await call('get', '/admin/stats', { token }), 'get', '/admin/stats', 404, 'not_found');
  expectError(await call('get', '/admin/users', { token }), 'get', '/admin/users', 404, 'not_found');
  expectError(await call('post', '/auth/support/exchange', { json: { code: 'x'.repeat(32) } }), 'post', '/auth/support/exchange', 404, 'not_found');
});

test.skipIf(!!features.push)('push switched off is not there', async () => {
  const { token } = await signUp();
  const subscription = { endpoint: 'https://push.invalid/off', keys: { p256dh: 'x', auth: 'y' } };
  expectError(await call('put', '/me/push', { token, json: { subscription } }), 'put', '/me/push', 404, 'not_found');
  expectError(await call('delete', '/me/push', { token, json: { endpoint: subscription.endpoint } }), 'delete', '/me/push', 404, 'not_found');
  expectError(await call('post', '/me/push/test', { token }), 'post', '/me/push/test', 404, 'not_found');
});
