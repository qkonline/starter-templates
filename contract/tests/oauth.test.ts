// What can be checked without signing in at Google: the redirect out, and every refusal. The
// round trip through the provider needs a real account, so the frontend's browser tests cover it.
// Google is optional: with it off, only its absence is checked.

import { describe, expect, test } from 'vitest';
import { API } from './api';
import { call, expectError, expectReply, type Reply } from './lib';

/** Where the backend lets the browser come back to: the frontend's origin, from the run. */
const RETURN = `${process.env.APP_URL ?? 'http://localhost:5173'}/auth/callback`;

const start = (provider: string, ret?: string) =>
  fetch(`${API}/auth/oauth/${provider}/start${ret === undefined ? '' : `?return=${encodeURIComponent(ret)}`}`, { redirect: 'manual' });

const asReply = async (r: Response): Promise<Reply> => ({ status: r.status, headers: r.headers, body: await r.json() });

const methods = await call('get', '/auth/methods');
const google = (methods.body?.oauth ?? []).includes('google');

test('the methods on offer', () => {
  expectReply(methods, 'get', '/auth/methods', 200);
});

test('a provider that is not there', async () => {
  expectError(await asReply(await start('myspace', RETURN)), 'get', '/auth/oauth/{provider}/start', 404, 'not_found');
});

test('exchanging a code that was never given', async () => {
  for (const code of ['x'.repeat(40), ''])
    expectError(await call('post', '/auth/oauth/exchange', { json: { code } }), 'post', '/auth/oauth/exchange', 400, 'invalid_code');
});

test.skipIf(google)('Google switched off is not there', async () => {
  expectError(await asReply(await start('google', RETURN)), 'get', '/auth/oauth/{provider}/start', 404, 'not_found');
});

describe.skipIf(!google)('Google', () => {
  test('start sends the browser to Google, with a state and a nonce cookie', async () => {
    const r = await start('google', RETURN);
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get('location')!);
    expect(to.hostname).toBe('accounts.google.com');
    expect(to.searchParams.get('state')).toBeTruthy();
    expect(to.searchParams.get('redirect_uri')).toBe(`${API}/auth/oauth/google/callback`);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test('a return address the backend does not allow, or none', async () => {
    for (const ret of ['https://evil.example/auth/callback', 'not a url', `${RETURN}?x=${'y'.repeat(2048)}`, undefined])
      expectError(await asReply(await start('google', ret)), 'get', '/auth/oauth/{provider}/start', 400, 'invalid_input');
  });

  test('a callback without the nonce cookie goes back with an error, not a code', async () => {
    const s = await start('google', RETURN);
    const state = new URL(s.headers.get('location')!).searchParams.get('state')!;
    const r = await fetch(`${API}/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=fake`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    const back = new URL(r.headers.get('location')!);
    expect(`${back.origin}${back.pathname}`).toBe(RETURN);
    expect(back.searchParams.get('error')).toBe('oauth_failed');
    expect(back.searchParams.has('code')).toBe(false);
  });

  test('the person cancels at Google', async () => {
    const s = await start('google', RETURN);
    const state = new URL(s.headers.get('location')!).searchParams.get('state')!;
    const cookie = (s.headers.get('set-cookie') ?? '').split(';')[0]!;
    const r = await fetch(`${API}/auth/oauth/google/callback?state=${encodeURIComponent(state)}&error=access_denied`, {
      redirect: 'manual',
      headers: { cookie },
    });
    expect(r.status).toBe(302);
    expect(new URL(r.headers.get('location')!).searchParams.get('error')).toBe('oauth_denied');
  });
});
