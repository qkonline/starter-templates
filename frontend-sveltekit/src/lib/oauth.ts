// Signing in with Google from this tab only (PRD R1.9). The backend checks its own nonce (a
// cookie on its domain), which stops another site finishing a sign-in it started; this checks
// the other way round: that the sign-in coming back to /auth/callback was started here, in this
// tab, so no one can send a person a link that signs them into the sender's account (login CSRF).
//
// Before going to the provider, a random nonce goes in this tab's sessionStorage and in the
// return address (`/auth/callback?n=…`). The backend adds `code` (or `error`) to that address
// and keeps `n` (`searchParams.set`). The callback trades the code only when `n` matches, and
// the nonce works once.

const NONCE = 'starter:oauth';

function tabStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** A new nonce, kept in this tab; null when the browser blocks storage (then sign-in can't check it). */
export function newOAuthNonce(): string | null {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const store = tabStore();
    if (!store) return null;
    store.setItem(NONCE, nonce);
    return nonce;
  } catch {
    return null;
  }
}

/** The return address for the provider: `callback` with the nonce added. */
export function oauthReturn(callback: string, nonce: string): string {
  const url = new URL(callback);
  url.searchParams.set('n', nonce);
  return url.href;
}

/** Whether `given` is the nonce this tab started with. Either way, it can't be used again. */
export function takeOAuthNonce(given: string | null): boolean {
  try {
    const store = tabStore();
    const kept = store?.getItem(NONCE) ?? null;
    store?.removeItem(NONCE);
    return !!given && !!kept && given === kept;
  } catch {
    return false;
  }
}
