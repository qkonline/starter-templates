// Six-digit codes by email (PRD R1.4). Each works for 10 minutes and 5 tries, then is gone, even
// under many tries at once. 60 seconds between codes to one address; at most 6 per address and
// 30 per network an hour. Codes for different purposes are kept and counted apart, and a code's
// hash includes its purpose, so one can never stand in for another.
//
// What's stored is an HMAC of the code keyed with CODE_PEPPER, a secret kept out of the
// database: six digits are only a million guesses, so a plain hash in a leaked database would
// give every code away.

import { b64url, sixDigits } from './crypto';
import type { Ctx } from './env';
import { HOUR, limit, MINUTE, networkLimit } from './limits';
import { codeMail, sendMail } from './mail';

const CODE_MS = 10 * MINUTE;
const TRIES = 5;
const PER_ADDRESS = 6;
const PER_NETWORK = 30;

/**
 * What a code is for, and what it's kept under: sign-in and reset by address, confirming by
 * account, changing email by the account that asked (`bind`) and the new address, so two
 * accounts moving to one address each keep their own code.
 */
export type Purpose = 'signin' | 'reset' | 'confirm' | 'change';

const LINES: Record<Purpose, string> = {
  signin: 'Enter it to sign in.',
  reset: 'Enter it to set a new password.',
  confirm: 'Enter it to confirm your email address.',
  change: 'Enter it to move your account to this address.',
};

interface Code {
  purpose: Purpose;
  /** The address, or the account id for `confirm`. */
  subject: string;
  /** The account the code is for, when only that one may use it. */
  bind?: string;
}

/** The key a code is kept under (db/index.ts ACCOUNT_CODES finds an account's by it). */
const keyOf = (c: Code) => (c.bind ? `${c.purpose}|${c.bind}|${c.subject}` : `${c.purpose}|${c.subject}`);

const enc = new TextEncoder();

/** Stands in for CODE_PEPPER on a local API only, so development needs no secret. */
const DEV_PEPPER = 'dev-only-code-pepper-never-used-when-deployed';

function pepper(ctx: Ctx): string {
  if (ctx.env.CODE_PEPPER) return ctx.env.CODE_PEPPER;
  if (ctx.cfg.local) return DEV_PEPPER;
  throw new Error('CODE_PEPPER is not set: put it with `npx wrangler secret put CODE_PEPPER` (npm run setup does).');
}

/** An HMAC of `text` keyed with CODE_PEPPER, as base64url (43 characters). */
export async function keyedHash(ctx: Ctx, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper(ctx)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

const hashOf = (ctx: Ctx, c: Code, code: string) => keyedHash(ctx, `${keyOf(c)}|${code}`);

/**
 * Make a code and email it to `to`. `deliver: false` makes and counts one but sends nothing, so
 * an address without an account gets the same answer as one with. `counted: false` skips the
 * per-address limits: for the code sent with a new account, which signing up already limits.
 * `later: true` sends after the reply (failures logged), so the reply takes as long whether or
 * not anything is sent.
 */
export async function sendCode(ctx: Ctx, c: Code, to: string, opts: { deliver?: boolean; counted?: boolean; later?: boolean } = {}): Promise<void> {
  if (opts.counted !== false) {
    // The network first: one network asking for many addresses stops there, before each address
    // writes counts of its own (D1's daily writes).
    await networkLimit(ctx, `codes:${c.purpose}`, PER_NETWORK, HOUR, 'Too many codes asked for. Try again in an hour.');
    await limit(ctx, `gap:${keyOf(c)}`, 1, MINUTE, 'A code is on its way. Wait a minute before asking for another.');
    await limit(ctx, `codes:${c.purpose}:${to}`, PER_ADDRESS, HOUR, 'Too many codes asked for. Try again in an hour.');
  }
  const code = sixDigits();
  const now = Date.now();
  await ctx.db.putCode({ key: keyOf(c), hash: await hashOf(ctx, c, code), sent: now, expires: now + CODE_MS });
  if (opts.deliver === false) return;
  const mail = codeMail(ctx, to, code, LINES[c.purpose]);
  if (!opts.later || !ctx.waitUntil) return sendMail(ctx, mail);
  ctx.waitUntil(sendMail(ctx, mail).catch((e) => console.error('Sending a code after the reply', e)));
}

/**
 * Spend one of the code's tries: whether `code` is right. It stays usable, for a check that must
 * pass before it's used up (the current password, when changing email); `useCode` then takes it.
 */
export async function matchCode(ctx: Ctx, c: Code, code: string | null): Promise<boolean> {
  if (!code) return false;
  const stored = await ctx.db.spendTry(keyOf(c), TRIES, Date.now());
  return !!stored && stored === (await hashOf(ctx, c, code));
}

/** Use the code up; false if another request already did. */
export async function useCode(ctx: Ctx, c: Code, code: string): Promise<boolean> {
  return ctx.db.useCode(keyOf(c), await hashOf(ctx, c, code));
}

/** Check a code and use it up: true at most once per code, however many ask at once. */
export async function takeCode(ctx: Ctx, c: Code, code: string | null): Promise<boolean> {
  return !!code && (await matchCode(ctx, c, code)) && (await useCode(ctx, c, code));
}
