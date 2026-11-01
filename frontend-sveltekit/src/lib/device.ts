// What this device keeps: the session token, and the id of the account that last signed in
// here. When a different account signs in, everything the previous person left on the device
// goes first (localStorage, sessionStorage, and whatever an app registered with `onForget`),
// except the device's own settings (`deviceKeys`: theme, mode, text size).
//
// A support session (PRD R6.3) lives in one tab only: its token is in that tab's
// sessionStorage, and while it's there it is the token this tab sends. The admin's own session
// in localStorage is never written or cleared by that tab, not even after the support session
// has ended: a tab that ever held one is marked (`starter:support-tab`, kept until the tab
// closes), and the writers below check the mark rather than whether a session is still there.

const TOKEN = 'starter:token';
const ACCOUNT = 'starter:account';
const SUPPORT = 'starter:support';
const SUPPORT_TAB = 'starter:support-tab';

/** Also kept in memory, for a browser that drops the mark from sessionStorage. */
let wasSupportTab = false;

/** Settings of the device rather than the person: they stay when the device forgets someone. */
export const deviceKeys: readonly string[] = ['starter:theme', 'starter:mode', 'starter:text'];

export interface SupportSession {
  token: string;
  /** Whose account this tab is in, for the banner. */
  email: string;
}

function tabStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** This tab's support session, if it is one. */
export function readSupport(): SupportSession | null {
  try {
    const raw = tabStore()?.getItem(SUPPORT);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SupportSession>;
    if (typeof value.token !== 'string' || !value.token || typeof value.email !== 'string') return null;
    wasSupportTab = true;
    return { token: value.token, email: value.email };
  } catch {
    return null;
  }
}

/**
 * Whether this tab has held a support session, now or earlier. Such a tab never writes the
 * device's own session, even once its support session has ended.
 */
export function isSupportTab(): boolean {
  if (wasSupportTab) return true;
  try {
    if (tabStore()?.getItem(SUPPORT_TAB) === '1') return (wasSupportTab = true);
  } catch {
    /* ignore */
  }
  return readSupport() !== null;
}

/** Make this tab a support session. The device's own session is left as it is. */
export function startSupport(session: SupportSession): void {
  wasSupportTab = true;
  try {
    tabStore()?.setItem(SUPPORT_TAB, '1');
    tabStore()?.setItem(SUPPORT, JSON.stringify(session));
  } catch {
    throw new Error('This browser blocks storage for this tab, so a support session can’t start here.');
  }
}

/** End this tab's support session (the device's own session is untouched). */
export function endSupport(): void {
  try {
    tabStore()?.removeItem(SUPPORT);
  } catch {
    /* ignore */
  }
}

export const inSupport = (): boolean => readSupport() !== null;

/** localStorage when the browser allows it, so private modes that block it don't crash the app. */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  const support = readSupport();
  if (support) return support.token;
  try {
    return store()?.getItem(TOKEN) ?? null;
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  if (isSupportTab()) {
    // In a support tab, only the support session changes; it ends when its token stops working.
    // Once it has ended there is nothing of this tab's own to write, and the admin's session in
    // localStorage is never this tab's to change.
    const support = readSupport();
    if (support && token) startSupport({ ...support, token });
    else if (!token) endSupport();
    return;
  }
  try {
    if (token) store()?.setItem(TOKEN, token);
    else store()?.removeItem(TOKEN);
  } catch {
    /* Storage full or blocked: the session lasts until the page closes. */
  }
}

const cleaners = new Set<() => void | Promise<void>>();

/**
 * Register something to wipe when the device forgets the previous person: an app's IndexedDB,
 * caches, in-memory stores. Returns a function that unregisters it.
 */
export function onForget(clean: () => void | Promise<void>): () => void {
  cleaners.add(clean);
  return () => cleaners.delete(clean);
}

/** Remove everything this app keeps on the device, except the device's own settings. */
export async function forgetDevice(): Promise<void> {
  // A support tab never touches the admin's device: only the tab's own storage goes, and the
  // mark that it was a support tab stays.
  const supportTab = isSupportTab();
  if (!supportTab) {
    try {
      const local = store();
      if (local) {
        const kept = deviceKeys.map((k) => [k, local.getItem(k)] as const);
        local.clear();
        for (const [k, v] of kept) if (v !== null) local.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }
  try {
    tabStore()?.clear();
    if (supportTab) tabStore()?.setItem(SUPPORT_TAB, '1');
  } catch {
    /* ignore */
  }
  await Promise.allSettled([...cleaners].map(async (clean) => clean()));
}

/**
 * Keep a new session. If another account signed in here last, the device forgets that person
 * first. Returns whether it did. Throws in a tab that has held a support session: signing in
 * there would replace the admin's own session on the device.
 */
export async function keepSession(token: string, accountId: string): Promise<boolean> {
  if (isSupportTab())
    throw new Error('This tab was used for a support session. To sign in, open the app in a new tab.');
  let previous: string | null = null;
  try {
    previous = store()?.getItem(ACCOUNT) ?? null;
  } catch {
    /* ignore */
  }
  const switched = previous !== null && previous !== accountId;
  if (switched) await forgetDevice();
  writeToken(token);
  try {
    store()?.setItem(ACCOUNT, accountId);
  } catch {
    /* ignore */
  }
  return switched;
}
