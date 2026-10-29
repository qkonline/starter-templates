// The session against the real API client and device storage, with fetch, navigation and
// analytics faked. Mostly about support tabs: whatever happens in one, the admin's own session
// in localStorage stays as it was.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/public', () => ({
  PUBLIC_API_URL: 'https://api.test/api',
  PUBLIC_POSTHOG_KEY: '',
  PUBLIC_POSTHOG_HOST: '',
  PUBLIC_GA_ID: '',
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => `/${path}` }));
vi.mock('#lib/analytics/index.ts', () => ({ analytics: { identify: vi.fn(), reset: vi.fn() } }));
vi.mock('#lib/push.ts', () => ({ pushOff: vi.fn(async () => {}) }));

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

const user = {
  id: 'u-person',
  email: 'p@x.test',
  name: null,
  photoUrl: null,
  emailVerified: true,
  hasPassword: true,
  isAdmin: false,
  createdAt: '2026-10-01T00:00:00Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const signedOutReply = () => json(401, { code: 'signed_out', message: 'Signed out.' });

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  assign = vi.fn();
  vi.stubGlobal('window', { location: { assign, pathname: '/app', search: '' } });
});
afterEach(() => vi.unstubAllGlobals());

/** A fresh session module (and device module), as a page load would have. */
async function load() {
  const session = await import('./session.svelte');
  const device = await import('./device');
  return { ...session, ...device };
}

describe('a support session that runs out', () => {
  it('ends the tab’s session and leaves the admin’s token in localStorage', async () => {
    localStorage.setItem('starter:token', 'admin-token');
    const s = await load();
    s.startSupport({ token: 'support-token', email: 'p@x.test' });
    s.loadSupport();
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get('authorization')).toBe('Bearer support-token');
      return signedOutReply();
    });
    vi.stubGlobal('fetch', fetch);

    expect(await s.loadUser()).toBeNull();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('starter:token')).toBe('admin-token');
    expect(sessionStorage.getItem('starter:support')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/support?ended=1');
  });

  it('never lets the tab sign in over the admin’s session afterwards', async () => {
    localStorage.setItem('starter:token', 'admin-token');
    localStorage.setItem('starter:account', 'u-admin');
    const s = await load();
    s.startSupport({ token: 'support-token', email: 'p@x.test' });
    s.endSupport();

    await expect(s.signedIn({ token: 'other-token', user, isNew: false })).rejects.toThrow(/support session/);
    await expect(s.keepSession('other-token', 'u-person')).rejects.toThrow(/support session/);
    s.writeToken('other-token');
    s.writeToken(null);
    await s.forgetDevice();

    expect(localStorage.getItem('starter:token')).toBe('admin-token');
    expect(localStorage.getItem('starter:account')).toBe('u-admin');
  });

  it('remembers the tab was a support tab across a reload', async () => {
    localStorage.setItem('starter:token', 'admin-token');
    const first = await load();
    first.startSupport({ token: 'support-token', email: 'p@x.test' });
    first.endSupport();

    // The same tab after a page load: new modules, the same sessionStorage.
    vi.resetModules();
    const again = await load();
    expect(again.isSupportTab()).toBe(true);
    again.writeToken(null);
    expect(localStorage.getItem('starter:token')).toBe('admin-token');
  });

  it('swaps only the support token when a password reset signs in again', async () => {
    localStorage.setItem('starter:token', 'admin-token');
    const s = await load();
    s.startSupport({ token: 'support-token', email: 'p@x.test' });
    await s.replaceSession({ token: 'new-support-token', user, isNew: false });
    expect(s.readSupport()?.token).toBe('new-support-token');
    expect(localStorage.getItem('starter:token')).toBe('admin-token');
  });
});

describe('an ordinary tab', () => {
  it('drops a token that stopped working and goes to sign in', async () => {
    localStorage.setItem('starter:token', 'old-token');
    const s = await load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => signedOutReply()),
    );

    expect(await s.loadUser()).toBeNull();
    expect(localStorage.getItem('starter:token')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/signin?expired=1&next=%2Fapp');
  });

  it('keeps a new session on sign-in', async () => {
    const s = await load();
    await s.signedIn({ token: 't1', user, isNew: false });
    expect(localStorage.getItem('starter:token')).toBe('t1');
    expect(localStorage.getItem('starter:account')).toBe('u-person');
    expect(s.auth.user?.id).toBe('u-person');
  });
});
