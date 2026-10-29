import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newOAuthNonce, oauthReturn, takeOAuthNonce } from './oauth';

beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('the sign-in nonce', () => {
  it('matches once, in the tab that started', () => {
    const nonce = newOAuthNonce()!;
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(takeOAuthNonce(nonce)).toBe(true);
    expect(takeOAuthNonce(nonce)).toBe(false);
  });

  it('refuses a missing or different nonce, and forgets the kept one', () => {
    const nonce = newOAuthNonce()!;
    expect(takeOAuthNonce('someone-elses')).toBe(false);
    expect(takeOAuthNonce(nonce)).toBe(false);
    newOAuthNonce();
    expect(takeOAuthNonce(null)).toBe(false);
    expect(takeOAuthNonce('')).toBe(false);
  });

  it('survives the backend adding its code to the return address', () => {
    const back = new URL(oauthReturn('https://app.test/auth/callback', 'abc'));
    expect(back.href).toBe('https://app.test/auth/callback?n=abc');
    // What backend-cloudflare's oauth callback does with the return address.
    back.searchParams.set('code', 'one-time');
    expect(back.searchParams.get('n')).toBe('abc');
    expect(back.searchParams.get('code')).toBe('one-time');
  });
});
