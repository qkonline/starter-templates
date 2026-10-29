// Contact messages and feedback: signed in or out, behind the CAPTCHA, kept for the admin area.

import { describe, expect, test } from 'vitest';
import { asAdmin, call, captcha, expectError, expectReply, features, freshEmail, methods, signUp } from './lib';

const send = (json: Record<string, unknown>, token?: string) => call('post', '/contact', { token, json: { ...captcha(), ...json } });

type Message = { id: string; kind: string; name: string | null; email: string; userId: string | null; message: string; page: string | null; status: string };

/** The message with this text in the admin area's list, looking through every page. */
async function stored(token: string, text: string, status = 'open'): Promise<Message | null> {
  let cursor: string | null = null;
  for (let i = 0; i < 40; i++) {
    const r = await call('get', `/admin/messages?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token });
    expectReply(r, 'get', '/admin/messages', 200);
    const found = (r.body.messages as Message[]).find((m) => m.message === text);
    if (found) return found;
    cursor = r.body.next;
    if (!cursor) return null;
  }
  return null;
}

const unique = (what: string) => `${what} ${crypto.randomUUID()}`;

test('signed out, with an address to answer', async () => {
  expectReply(await send({ kind: 'contact', name: 'Ada', email: freshEmail(), message: unique('Hello') }), 'post', '/contact', 204);
});

test('signed out without an address, or with one that is not', async () => {
  expectError(await send({ kind: 'contact', message: 'Hello' }), 'post', '/contact', 400, 'invalid_input');
  for (const email of ['nobody', 'a b@example.test', 'a?b@example.test', 'a&cc=x@example.test', 'a@b'])
    expectError(await send({ kind: 'contact', email, message: 'Hello' }), 'post', '/contact', 400, 'invalid_input');
});

test('what a message must be', async () => {
  const email = freshEmail();
  for (const json of [
    { kind: 'complaint', email, message: 'Hello' },
    { email, message: 'Hello' },
    { kind: 'contact', email, message: '   ' },
    { kind: 'contact', email },
    { kind: 'contact', email, message: 'x'.repeat(5001) },
    { kind: 'contact', email, message: 'Hello', name: 'x'.repeat(81) },
    { kind: 'feedback', email, message: 'Hello', page: 'x'.repeat(501) },
    { kind: 'contact', email, message: 'Hello', extra: true },
  ])
    expectError(await send(json), 'post', '/contact', 400, 'invalid_input');
});

test('signed in, no address needed', async () => {
  const { token } = await signUp();
  expectReply(await send({ kind: 'feedback', message: unique('Nice'), page: '/settings' }, token), 'post', '/contact', 204);
});

test('at most 20 a day from one account', async () => {
  const { token } = await signUp();
  for (let i = 0; i < 20; i++) expectReply(await send({ kind: 'feedback', message: `Number ${i}` }, token), 'post', '/contact', 204);
  expectError(await send({ kind: 'feedback', message: 'One too many' }, token), 'post', '/contact', 429, 'rate_limited');
});

test.skipIf(!methods.captcha)('without the CAPTCHA', async () => {
  const r = await call('post', '/contact', { json: { kind: 'contact', email: freshEmail(), message: 'Hello' } });
  expectError(r, 'post', '/contact', 400, 'captcha_failed');
});

describe.skipIf(!features.admin)('in the admin area', () => {
  test('kept as sent; signed in, the account answers for it', async () => {
    const admin = await asAdmin();
    const outside = unique('From outside');
    const email = freshEmail();
    await send({ kind: 'contact', name: 'Ada', email: email.toUpperCase(), message: `  ${outside}  ` });
    expect(await stored(admin.token, outside)).toMatchObject({ kind: 'contact', name: 'Ada', email, userId: null, page: null, status: 'open' });

    const p = await signUp();
    const inside = unique('From inside');
    await send({ kind: 'feedback', email: 'someone@else.test', message: inside, page: '/teams' }, p.token);
    expect(await stored(admin.token, inside)).toMatchObject({ kind: 'feedback', email: p.email, userId: p.user.id, page: '/teams' });
  });

  test('the name loses its line breaks and control characters', async () => {
    const admin = await asAdmin();
    const text = unique('Named');
    await send({ kind: 'contact', name: 'Ada\r\nBcc: x@evil.test\u0007', email: freshEmail(), message: text });
    expect((await stored(admin.token, text))?.name).toBe('Ada Bcc: x@evil.test');
  });

  test('marked done, and open again', async () => {
    const admin = await asAdmin();
    const text = unique('To be done');
    await send({ kind: 'contact', email: freshEmail(), message: text });
    const m = (await stored(admin.token, text))!;
    const patch = (status: unknown, id = m.id) => call('patch', `/admin/messages/${id}`, { token: admin.token, json: { status } });

    const done = await patch('done');
    expectReply(done, 'patch', '/admin/messages/{messageId}', 200);
    expect(done.body.message).toEqual({ ...m, status: 'done' });
    expect(await stored(admin.token, text, 'done')).not.toBeNull();
    expect(await stored(admin.token, text, 'open')).toBeNull();

    expectReply(await patch('open'), 'patch', '/admin/messages/{messageId}', 200);
    expect(await stored(admin.token, text, 'open')).not.toBeNull();

    expectError(await patch('closed'), 'patch', '/admin/messages/{messageId}', 400, 'invalid_input');
    expectError(await patch('done', 'no-such-message'), 'patch', '/admin/messages/{messageId}', 404, 'not_found');
    expectError(await call('get', '/admin/messages?status=closed', { token: admin.token }), 'get', '/admin/messages', 400, 'invalid_input');
  });
});
