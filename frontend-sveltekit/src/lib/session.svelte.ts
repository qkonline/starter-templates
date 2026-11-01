// Who is signed in, how this app signs people in, and which optional parts it has on. One
// shared state for every page.
//
// Signing out always ends with a full page load, so nothing of the person stays in memory; a
// different account signing in afterwards also clears what the device stored (#lib/device).
// A support tab (PRD R6.3) is the same, with the person's session kept in that tab only.
//
// Starting offline: each successful read of the sign-in settings, the switches and the person is
// kept on the device (#lib/device `keep`), and `startFromDevice` opens the app from those copies
// at once, checking with the backend in the background; with no connection, the copies stand.

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { Path } from '$app/types';
import { analytics } from '#lib/analytics/index.ts';
import {
  ApiError,
  api,
  setApiHooks,
  type Features,
  type Methods,
  type SignIn,
  type User,
} from '#lib/api/index.ts';
import {
  endSupport,
  forgetDevice,
  isSupportTab,
  keep,
  keepSession,
  kept,
  readSupport,
  readToken,
  writeToken,
} from '#lib/device.ts';
import { closeForSignOut, closeSupportData } from '#lib/db/index.svelte.ts';
import { pushOff } from '#lib/push.ts';
import { homePath } from '#lib/config.ts';
import { safeNext } from '#lib/format.ts';

export const auth = $state<{
  methods: Methods | null;
  features: Features | null;
  user: User | null;
  /** Set in a support tab: whose account this is, for the banner. */
  support: { email: string } | null;
  /** This copy of the app is older than the backend serves: it must update to carry on. */
  outdated: boolean;
}>({ methods: null, features: null, user: null, support: null, outdated: false });

/** Everything optional off: what a backend without `/features` has. */
const allOff: Features = { teams: false, admin: false, push: null, sync: false, minClient: null };

/** No answer, or the backend failing: what a copy kept on the device can stand in for. */
const unreachable = (e: unknown) =>
  e instanceof ApiError && (e.code === 'network' || e.status >= 500 || e.status === 0);

/** Whether this build is older than the oldest the backend serves. */
function checkVersion(f: Features) {
  if (f.minClient && Date.parse(__BUILT_AT__) < Date.parse(f.minClient)) auth.outdated = true;
}

let methodsLoading: Promise<Methods> | null = null;
let featuresLoading: Promise<Features> | null = null;

/** /features, read once. A backend that doesn't have it has every optional part off. */
export function loadFeatures(): Promise<Features> {
  featuresLoading ??= api.features().then(
    (f) => {
      keep('features', f);
      checkVersion(f);
      return (auth.features = f);
    },
    (e) => {
      if (e instanceof ApiError && e.code === 'not_found') return (auth.features = allOff);
      featuresLoading = null;
      const copy = unreachable(e) ? kept<Features>('features') : null;
      if (copy) return (auth.features = copy);
      throw e;
    },
  );
  return featuresLoading;
}

/** Read the support tab's state from sessionStorage (call once at start). */
export function loadSupport(): void {
  const support = readSupport();
  auth.support = support ? { email: support.email } : null;
}

/** /auth/methods, read once. A failure isn't kept, so trying again asks again. */
export function loadMethods(): Promise<Methods> {
  methodsLoading ??= api.methods().then(
    (m) => {
      keep('methods', m);
      return (auth.methods = m);
    },
    (e) => {
      methodsLoading = null;
      const copy = unreachable(e) ? kept<Methods>('methods') : null;
      if (copy) return (auth.methods = copy);
      throw e;
    },
  );
  return methodsLoading;
}

export const hasToken = (): boolean => readToken() !== null;

/** The signed-in person, or null when this device has no working session. */
export async function loadUser(): Promise<User | null> {
  if (!hasToken()) return (auth.user = null);
  try {
    auth.user = await api.me();
    keep('me', auth.user);
    if (!auth.support) analytics.identify(auth.user.id);
    return auth.user;
  } catch (e) {
    // No connection: the person as this device last saw them.
    const copy = unreachable(e) ? kept<User>('me') : null;
    if (copy) return (auth.user = copy);
    if ((e as { code?: string }).code === 'signed_out') {
      // In a support tab the `signedOut` hook below has already ended the support session;
      // writeToken knows the tab was one and leaves the admin's own token alone.
      writeToken(null);
      return (auth.user = null);
    }
    throw e;
  }
}

/**
 * Open the signed-in app from what the device kept, without waiting for the network: true when
 * there was a session and a copy of everything needed (then check with `loadMethods`,
 * `loadFeatures` and `loadUser` in the background). Never in a support tab.
 */
export function startFromDevice(): boolean {
  if (!hasToken() || isSupportTab()) return false;
  const methods = kept<Methods>('methods');
  const features = kept<Features>('features');
  const user = kept<User>('me');
  if (!methods || !features || !user) return false;
  auth.methods ??= methods;
  auth.features ??= features;
  auth.user ??= user;
  return true;
}

/** Keep a new session and go on into the app. */
export async function signedIn(result: SignIn, next?: string | null): Promise<void> {
  await keepSession(result.token, result.user.id);
  auth.user = result.user;
  keep('me', result.user);
  analytics.identify(result.user.id);
  await goto(safeNext(next) ?? resolve(homePath), { replace: true });
}

/** Swap the token without leaving the page (a password reset from the account page). */
export async function replaceSession(result: SignIn): Promise<void> {
  // In a support tab the new token replaces the tab's support session, never the device's.
  if (isSupportTab()) writeToken(result.token);
  else await keepSession(result.token, result.user.id);
  auth.user = result.user;
}

/** Leave the app for a page, reloading so no state of the person stays in memory. */
function leaveTo(path: Path): void {
  window.location.assign(resolve(path));
}

/** Sign this device out. */
export async function signOut(): Promise<void> {
  if (auth.support) return endSupportSession();
  // What was done here offline gets a few seconds to reach the backend. Then this account's data
  // on the device goes, unless something hasn't reached the backend: that stays, in this
  // person's own database, for their next sign-in here (the account page says so first).
  await closeForSignOut().catch(() => {});
  // This device's notifications belong to the person leaving, not whoever signs in next.
  if (auth.features?.push) await withTimeout(pushOff(), 3000).catch(() => {});
  try {
    await api.signOut();
  } catch {
    /* Signing out never gets stuck: the token goes either way. */
  }
  writeToken(null);
  analytics.reset();
  leaveTo('signin');
}

/** End this tab's support session; the admin's own session on the device stays. */
export async function endSupportSession(): Promise<void> {
  await closeSupportData().catch(() => {});
  try {
    await api.signOut();
  } catch {
    /* It ends within the hour anyway. */
  }
  endSupport();
  window.location.assign(`${resolve('support')}?ended=1`);
}

/** After the account is deleted: nothing of it stays on the device. */
export async function accountDeleted(): Promise<void> {
  await forgetDevice({ deleted: true });
  analytics.reset();
  leaveTo('');
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

let leaving = false;
// The pages that check a stale token themselves, so a `signed_out` reply there needs no reload.
// Kept as a list rather than derived from the route groups: `/contact` is a (site) page, and
// not every (open) page an app adds will want this.
const publicPaths = ['/signin', '/signup', '/forgot', '/auth/callback', '/support', '/invite', '/contact'];

setApiHooks({
  // Any reply saying the token no longer works: back to sign in, once.
  signedOut() {
    // A support session that ran out: say so in this tab, never touch the admin's session.
    if (isSupportTab()) {
      endSupport();
      if (leaving) return;
      leaving = true;
      window.location.assign(`${resolve('support')}?ended=1`);
      return;
    }
    writeToken(null);
    // The sign-in pages check a stale token themselves; no need to reload them.
    if (leaving || publicPaths.some((p) => window.location.pathname.endsWith(p))) return;
    leaving = true;
    const here = window.location.pathname + window.location.search;
    window.location.assign(`${resolve('signin')}?expired=1&next=${encodeURIComponent(here)}`);
  },
  // An app's own path said the email must be confirmed first: show the gate.
  unverified() {
    if (auth.user) auth.user = { ...auth.user, emailVerified: false };
  },
  // The backend no longer serves this copy of the app: the root layout asks for the update.
  outdated() {
    auth.outdated = true;
  },
});
