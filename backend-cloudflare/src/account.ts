// Sessions and the account as the API shows it. A session is a random bearer token the device
// keeps; only its SHA-256 hash is stored (PRD R1.11).

import { randomToken, sha256 } from './crypto';
import type { SessionRow, UserRow } from './db';
import type { Ctx } from './env';
import { suspended, wrongCredentials } from './errors';

/** A device that hasn't been used for this long is signed out. */
const SESSION_IDLE_MS = 365 * 24 * 3600_000;
/** lastUsedAt moves at most this often, so reading a session rarely writes. */
const DAY_MS = 24 * 3600_000;

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  name: string | null;
  photoUrl: string | null;
  createdAt: string;
  isAdmin: boolean;
}

/** An admin of the app: the admin area is on, the email is in ADMIN_EMAILS, and it's confirmed (PRD R6.1). */
export const isAdmin = (ctx: Ctx, u: UserRow) => !!ctx.cfg.admin && !!u.email_verified && ctx.cfg.admin.emails.includes(u.email);

const iso = (ms: number) => new Date(ms).toISOString();

/** Where a person's photo is served, or null for none. */
export const photoUrl = (ctx: Ctx, userId: string, photo: string | null) => (photo ? `${ctx.api}/photos/${userId}/${photo}` : null);

/** The account as the contract's `User`. */
export function userView(ctx: Ctx, u: UserRow): User {
  return {
    id: u.id,
    email: u.email,
    emailVerified: !!u.email_verified,
    hasPassword: !!u.password,
    name: u.name,
    photoUrl: photoUrl(ctx, u.id, u.photo),
    createdAt: iso(u.created),
    isAdmin: isAdmin(ctx, u),
  };
}

export function sessionView(s: SessionRow, currentId: string | null) {
  return {
    id: s.id,
    device: s.device,
    createdAt: iso(s.created),
    lastUsedAt: iso(s.used),
    current: s.id === currentId,
    support: !!s.support,
  };
}

export interface SessionOptions {
  /** A support session, ending then. */
  support?: { expires: number };
  /**
   * Made only while the account's auth_epoch is still this (the one read with the password just
   * checked); else null. A take-back or new password in the meantime wins.
   */
  epoch?: number;
}

/** A new session for this device; the token to give it, or null when `epoch` no longer holds. */
export async function startSession(ctx: Ctx, userId: string, device: string, opts: SessionOptions = {}): Promise<string | null> {
  const token = randomToken();
  const made = await ctx.db.createSession({ id: randomToken(12), hash: await sha256(token), userId, device, now: Date.now(), ...opts });
  return made ? token : null;
}

/** The session behind a token and its account, or null for no token or one that no longer works. */
export async function sessionFor(ctx: Ctx, token: string | null | undefined): Promise<{ session: SessionRow; user: UserRow } | null> {
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  const session = await ctx.db.sessionByHash(hash);
  if (!session) return null;
  const now = Date.now();
  if (now - session.used > SESSION_IDLE_MS || (session.expires != null && now > session.expires)) {
    await ctx.db.endSessionByHash(hash);
    return null;
  }
  const user = await ctx.db.userById(session.user_id);
  // Suspending ends every session; this also covers one made in the same moment.
  if (!user || user.suspended) return null;
  if (now - session.used > DAY_MS) await ctx.db.touchSession(session.id, now);
  return { session, user };
}

/**
 * The contract's `SignIn`: a new session, the account, and whether this sign-in made it. Never for
 * a suspended account. With `epoch` (after a password check), an account whose sign-in changed
 * meanwhile answers `invalid_credentials`, as the old password now would.
 */
export async function signedIn(ctx: Ctx, user: UserRow, device: string, isNew: boolean, opts: SessionOptions = {}) {
  notSuspended(user);
  const token = await startSession(ctx, user.id, device, opts);
  if (!token) throw wrongCredentials();
  return { token, user: userView(ctx, user), isNew };
}

/** Every way of signing in refuses a suspended account (PRD R6.2). */
export function notSuspended(user: UserRow | null | undefined): void {
  if (user?.suspended) throw suspended();
}

/**
 * Someone has just proved they own `email` (an emailed code, or Google's verified address): the
 * account with it, now confirmed, or a new one. An unconfirmed account with a password was made
 * by someone who never proved the address, so its password is cleared and its sessions end
 * first (PRD R1.8).
 */
export async function ownerOf(ctx: Ctx, email: string): Promise<{ user: UserRow; isNew: boolean }> {
  const { db } = ctx;
  let user = await db.userByEmail(email);
  if (!user) {
    const id = randomToken(12);
    // Two at once for one new address: one makes it, the other finds it.
    const made = await db.createUser({ id, email, verified: true, password: null, now: Date.now() });
    user = made ? await db.userById(id) : await db.userByEmail(email);
    if (!user) throw new Error(`No account for ${email} after making it`);
    return { user, isNew: made };
  }
  if (!user.email_verified) {
    if (user.password) await db.claimAccount(user.id, null);
    else await db.setVerified(user.id);
    user = (await db.userById(user.id)) ?? user;
  }
  return { user, isNew: false };
}
