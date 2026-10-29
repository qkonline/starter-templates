import { expect, test } from 'vitest';
import { call, expectError, expectReply, signIn, signUp } from './lib';

test('one person on two devices', async () => {
  const a = await signUp();
  const b = await signIn(a.email);

  const list = await call('get', '/me/sessions', { token: a.token });
  expectReply(list, 'get', '/me/sessions', 200);
  const sessions: { id: string; current: boolean }[] = list.body.sessions;
  expect(sessions).toHaveLength(2);
  const mine = sessions.filter((s) => s.current);
  expect(mine).toHaveLength(1);
  const other = sessions.find((s) => !s.current)!;
  // Each device sees itself as the current one.
  const fromB = await call('get', '/me/sessions', { token: b.token });
  expect(fromB.body.sessions.find((s: { current: boolean }) => s.current).id).toBe(other.id);

  // Someone else can't end them.
  const stranger = await signUp();
  expectError(await call('delete', `/me/sessions/${other.id}`, { token: stranger.token }), 'delete', '/me/sessions/{id}', 404, 'not_found');
  expectReply(await call('get', '/me', { token: b.token }), 'get', '/me', 200);

  // Signing out every other device leaves this one.
  expectReply(await call('delete', '/me/sessions', { token: a.token }), 'delete', '/me/sessions', 204);
  expectError(await call('get', '/me', { token: b.token }), 'get', '/me', 401, 'signed_out');
  expectReply(await call('get', '/me', { token: a.token }), 'get', '/me', 200);
  expect((await call('get', '/me/sessions', { token: a.token })).body.sessions).toHaveLength(1);

  // A session already gone, then this one.
  expectError(await call('delete', `/me/sessions/${other.id}`, { token: a.token }), 'delete', '/me/sessions/{id}', 404, 'not_found');
  expectReply(await call('delete', `/me/sessions/${mine[0]!.id}`, { token: a.token }), 'delete', '/me/sessions/{id}', 204);
  expectError(await call('get', '/me', { token: a.token }), 'get', '/me', 401, 'signed_out');
});

test('signed out', async () => {
  expectError(await call('get', '/me/sessions'), 'get', '/me/sessions', 401, 'signed_out');
  expectError(await call('delete', '/me/sessions'), 'delete', '/me/sessions', 401, 'signed_out');
});
