import { describe, expect, it, vi } from 'vitest';
import { createApi } from './client';
import { ApiError } from './errors';

const user = {
  id: 'u1',
  email: 'a@example.com',
  emailVerified: false,
  hasPassword: true,
  name: null,
  photoUrl: null,
  createdAt: '2026-10-28T12:00:00.000Z',
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function setup(reply: (req: Request) => Response | Promise<Response>, token: string | null = 'tok_123') {
  const requests: Request[] = [];
  const onSignedOut = vi.fn();
  const onUnverified = vi.fn();
  const api = createApi({
    baseUrl: 'http://api.test/api/',
    getToken: () => token,
    onSignedOut,
    onUnverified,
    fetch: async (input) => {
      const req = input instanceof Request ? input : new Request(input);
      requests.push(req.clone());
      return reply(req);
    },
  });
  return { api, requests, onSignedOut, onUnverified };
}

describe('the API module', () => {
  it('sends the bearer token and reads the reply', async () => {
    const { api, requests } = setup(() => json(200, { user }));
    expect(await api.me()).toEqual(user);
    expect(requests[0]!.url).toBe('http://api.test/api/me');
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer tok_123');
  });

  it('sends no Authorization header without a token', async () => {
    const { api, requests } = setup(() => json(200, { user, token: 'x'.repeat(32), isNew: true }), null);
    await api.signUp('a@example.com', 'k'.repeat(43));
    expect(requests[0]!.headers.has('authorization')).toBe(false);
  });

  it('sends the password key and the CAPTCHA token, never a password', async () => {
    const { api, requests } = setup(() => json(200, { user, token: 'x'.repeat(32), isNew: false }));
    await api.signIn('a@example.com', 'k'.repeat(43), 'captcha-token');
    expect(requests[0]!.method).toBe('POST');
    expect(await requests[0]!.json()).toEqual({
      email: 'a@example.com',
      passwordKey: 'k'.repeat(43),
      captcha: 'captcha-token',
    });
  });

  it('leaves the CAPTCHA out when there is none', async () => {
    const { api, requests } = setup(() => new Response(null, { status: 204 }));
    await api.forgotPassword('a@example.com', undefined);
    expect(await requests[0]!.json()).toEqual({ email: 'a@example.com' });
  });

  it('returns nothing for 204 replies', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.signOutOthers()).resolves.toBeUndefined();
  });

  it('puts ids in the path, encoded', async () => {
    const { api, requests } = setup(() => new Response(null, { status: 204 }));
    await api.removePasskey('abc_DEF-123');
    expect(requests[0]!.method).toBe('DELETE');
    expect(requests[0]!.url).toBe('http://api.test/api/me/passkeys/abc_DEF-123');
  });

  it('uploads the photo as the body, with its type', async () => {
    const { api, requests } = setup(() =>
      json(200, { user: { ...user, photoUrl: 'http://api.test/p/1.jpg' } }),
    );
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    const updated = await api.setPhoto(photo);
    expect(updated.photoUrl).toBe('http://api.test/p/1.jpg');
    expect(requests[0]!.method).toBe('PUT');
    expect(requests[0]!.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await requests[0]!.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('throws the contract error as an ApiError', async () => {
    const { api } = setup(() =>
      json(409, { code: 'email_taken', message: 'Another account has that address.' }),
    );
    const e = await api.sendEmailChange('b@example.com').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('email_taken');
    expect(e.message).toBe('Another account has that address.');
  });

  it('reports signed_out once a token stopped working', async () => {
    const { api, onSignedOut } = setup(() => json(401, { code: 'signed_out', message: 'Sign in again.' }));
    await expect(api.me()).rejects.toMatchObject({ code: 'signed_out' });
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('does not report signed_out for requests sent without a token', async () => {
    const { api, onSignedOut } = setup(
      () => json(401, { code: 'signed_out', message: 'Sign in again.' }),
      null,
    );
    await expect(api.me()).rejects.toMatchObject({ code: 'signed_out' });
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('reports email_unverified from any path', async () => {
    const { api, onUnverified } = setup(() =>
      json(403, { code: 'email_unverified', message: 'Confirm first.' }),
    );
    await expect(api.client.GET('/me')).resolves.toBeTruthy();
    expect(onUnverified).toHaveBeenCalledTimes(1);
  });

  it('turns a failed connection into a network error', async () => {
    const { api } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.methods()).rejects.toMatchObject({ code: 'network', status: 0 });
  });

  it('carries Retry-After on rate_limited', async () => {
    const { api } = setup(() =>
      json(429, { code: 'rate_limited', message: 'Wait a minute.' }, { 'retry-after': '60' }),
    );
    await expect(api.sendCode('a@example.com')).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfter: 60,
    });
  });

  it('builds the social sign-in address with the return page', () => {
    const { api } = setup(() => json(200, {}));
    expect(api.oauthStartUrl('google', 'http://localhost:5173/auth/callback')).toBe(
      'http://api.test/api/auth/oauth/google/start?return=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback',
    );
  });

  it('sends both keys when changing the email of an account with a password', async () => {
    const { api, requests } = setup(() => json(200, { user }));
    await api.verifyEmailChange({
      email: 'b@example.com',
      code: '123456',
      currentPasswordKey: 'c'.repeat(43),
      passwordKey: 'n'.repeat(43),
    });
    expect(await requests[0]!.json()).toEqual({
      email: 'b@example.com',
      code: '123456',
      currentPasswordKey: 'c'.repeat(43),
      passwordKey: 'n'.repeat(43),
    });
  });
});
