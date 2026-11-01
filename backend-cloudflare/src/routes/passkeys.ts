// Passkeys (PRD R1.6), as in boardo: a signed-in person adds one on each device (at most 20), and
// from then on signs in with Face ID, Touch ID or a security key. The passkey site is RP_ID, so
// passkeys made on any of its subdomains work on the others.
//
// User verification (Face ID, Touch ID, a PIN) is required both ways: a passkey replaces the
// password, so merely having the device must not be enough. Registration asks for it too, so a
// security key that can't verify fails when it's added rather than at every sign-in after.
// Only a confirmed email may add a passkey (needsConfirmedEmail): one added by someone who
// signed up with an address they don't own would outlast the owner taking it back.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { Hono } from 'hono';
import { signedIn } from '../account';
import { deviceName, isId, readBody } from '../checks';
import { keyedHash } from '../codes';
import { b64url, fromB64url, randomToken, sameText, sha256 } from '../crypto';
import type { PasskeyRow } from '../db';
import type { Ctx } from '../env';
import { invalid, notFound, Refusal } from '../errors';
import { needsConfirmedEmail, perNetwork, requireUser, type AppEnv } from '../middleware';

const CHALLENGE_MS = 5 * 60_000;
const MAX_KEYS = 20;

type Purpose = 'add' | 'signin';
type RegistrationJSON = Parameters<typeof verifyRegistrationResponse>[0]['response'];
type AuthenticationJSON = Parameters<typeof verifyAuthenticationResponse>[0]['response'];

const refused = (message = "That passkey couldn't be checked. Try again.") => new Refusal(400, 'passkey_refused', message);

/** The passkey site for a page on `host`: RP_ID when the host is it or under it, else the host itself. */
function rpFor(ctx: Ctx, host: string): string {
  const root = ctx.env.RP_ID || 'localhost';
  return host === root || host.endsWith(`.${root}`) ? root : host;
}

/** The passkey site for this request's page (an allowed Origin), or RP_ID when there's none. */
function rpOf(ctx: Ctx, origin: string | undefined): string {
  if (origin && ctx.cfg.origins.includes(origin)) return rpFor(ctx, new URL(origin).hostname);
  return ctx.env.RP_ID || 'localhost';
}

/** What an answer may come from: the allowed frontend origins, and their passkey sites. */
function expected(ctx: Ctx) {
  return { expectedOrigin: ctx.cfg.origins, expectedRPID: [...new Set(ctx.cfg.origins.map((o) => rpFor(ctx, new URL(o).hostname)))] };
}

async function saveChallenge(ctx: Ctx, challenge: string, userId: string, purpose: Purpose): Promise<string> {
  const id = randomToken(16);
  const now = Date.now();
  await ctx.db.saveChallenge({ id, challenge, userId, purpose, expires: now + CHALLENGE_MS, now });
  return id;
}

/**
 * A sign-in challenge, held by the browser rather than stored: signed (CODE_PEPPER) with its
 * expiry, so starting a passkey sign-in, which needs no account, writes nothing to D1 and can't
 * spend its daily writes. It's used up when a sign-in with it succeeds (`useSignedChallenge`).
 * Laid out as `p<expiry, 9 base-36 digits><signature, 43><challenge>`, all in the contract's Id.
 */
async function signedChallenge(ctx: Ctx, challenge: string): Promise<string> {
  const expires = (Date.now() + CHALLENGE_MS).toString(36).padStart(9, '0');
  return `p${expires}${await keyedHash(ctx, `signin|${expires}|${challenge}`)}${challenge}`;
}

/** The challenge in a token from `signedChallenge`, if it's genuine and in time. */
async function openSignedChallenge(ctx: Ctx, token: unknown): Promise<string> {
  const late = refused('That took too long. Try again.');
  if (!isId(token) || token.length < 1 + 9 + 43 + 16 || token[0] !== 'p') throw late;
  const expires = token.slice(1, 10);
  const signature = token.slice(10, 53);
  const challenge = token.slice(53);
  if (!sameText(signature, await keyedHash(ctx, `signin|${expires}|${challenge}`))) throw late;
  if (parseInt(expires, 36) < Date.now()) throw late;
  return challenge;
}

/** After the passkey checked out: the challenge is spent, so the same answer can't sign in twice. */
async function useSignedChallenge(ctx: Ctx, token: string): Promise<void> {
  const id = await sha256(token);
  const fresh = await ctx.db.spendChallenge({ id, expires: Date.now() + CHALLENGE_MS, now: Date.now() });
  if (!fresh) throw refused('That took too long. Try again.');
}

/** The challenge, used up whether or not the answer passes, so each is tried once. */
async function takeChallenge(ctx: Ctx, id: unknown, purpose: Purpose, userId: string) {
  const late = refused('That took too long. Try again.');
  if (!isId(id)) throw late;
  const row = await ctx.db.takeChallenge(id);
  if (!row || row.purpose !== purpose || row.user_id !== userId || row.expires < Date.now()) throw late;
  return row.challenge;
}

const iso = (ms: number) => new Date(ms).toISOString();
export const passkeyView = (p: PasskeyRow) => ({
  id: p.id,
  device: p.device,
  createdAt: iso(p.created),
  lastUsedAt: p.used == null ? null : iso(p.used),
});

const answerOf = (body: { challengeId?: unknown; response?: unknown }) => {
  const r = body.response;
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw refused();
  return r as Record<string, unknown>;
};

export const passkeys = new Hono<AppEnv>();

passkeys.post('/auth/passkey/start', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const options = await generateAuthenticationOptions({ rpID: rpOf(ctx, c.req.header('origin')), userVerification: 'required' });
  return c.json({ challengeId: await signedChallenge(ctx, options.challenge), options });
});

passkeys.post('/auth/passkey/finish', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const b = await readBody(c.req.raw, ['challengeId', 'response']).catch(() => {
    throw refused();
  });
  const challenge = await openSignedChallenge(ctx, b.challengeId);
  const response = answerOf(b) as unknown as AuthenticationJSON;
  const key = isId(response.id) ? await ctx.db.passkey(response.id) : null;
  if (!key) throw refused("That passkey isn't one of this app's. Pick another, or sign in with your email.");
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      ...expected(ctx),
      credential: {
        id: key.id,
        publicKey: fromB64url(key.public_key),
        counter: key.counter,
        transports: key.transports ? JSON.parse(key.transports) : undefined,
      },
      requireUserVerification: true,
    });
  } catch {
    throw refused();
  }
  if (!v.verified) throw refused();
  await useSignedChallenge(ctx, b.challengeId as string);
  await ctx.db.passkeyUsed(key.id, v.authenticationInfo.newCounter, Date.now());
  const user = await ctx.db.userById(key.user_id);
  if (!user) throw refused("That passkey's account was deleted.");
  return c.json(await signedIn(ctx, user, deviceName(c.req.header('user-agent')), false));
});

passkeys.get('/me/passkeys', requireUser, async (c) => {
  return c.json({ passkeys: (await c.var.ctx.db.passkeys(c.var.user.id)).map(passkeyView) });
});

passkeys.post('/me/passkeys/start', requireUser, async (c) => {
  const { ctx, user } = c.var;
  needsConfirmedEmail(user);
  const keys = await ctx.db.passkeys(user.id);
  if (keys.length >= MAX_KEYS) throw invalid('This account has as many passkeys as it can. Remove one first.');
  const options = await generateRegistrationOptions({
    rpName: ctx.cfg.title,
    rpID: rpOf(ctx, c.req.header('origin')),
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    userID: new TextEncoder().encode(`${ctx.cfg.saltPrefix}:${user.id}`) as Uint8Array<ArrayBuffer>,
    attestationType: 'none',
    excludeCredentials: keys.map((k) => ({ id: k.id, transports: k.transports ? JSON.parse(k.transports) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return c.json({ challengeId: await saveChallenge(ctx, options.challenge, user.id, 'add'), options });
});

passkeys.post('/me/passkeys/finish', requireUser, async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['challengeId', 'response']).catch(() => {
    throw refused();
  });
  // Another account's challenge is refused, and used up all the same.
  const challenge = await takeChallenge(ctx, b.challengeId, 'add', user.id);
  const response = answerOf(b) as unknown as RegistrationJSON;
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, ...expected(ctx), requireUserVerification: true });
  } catch {
    throw refused();
  }
  if (!v.verified) throw refused();
  const { credential } = v.registrationInfo;
  const row = {
    id: credential.id,
    user_id: user.id,
    public_key: b64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    device: deviceName(c.req.header('user-agent')),
    created: Date.now(),
  };
  if ((await ctx.db.passkeys(user.id)).length >= MAX_KEYS) throw refused('This account has as many passkeys as it can. Remove one first.');
  if (!(await ctx.db.addPasskey(row))) throw new Refusal(409, 'conflict', 'That passkey is already saved.');
  return c.json({ passkey: passkeyView({ ...row, used: null }) });
});

passkeys.delete('/me/passkeys/:id', requireUser, async (c) => {
  const id = c.req.param('id');
  if (!isId(id) || !(await c.var.ctx.db.removePasskey(c.var.user.id, id))) throw notFound();
  return c.body(null, 204);
});
