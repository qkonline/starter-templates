// Signing in and out: email and password (the default), forgot password, email codes (when on),
// and the settings the frontend reads first. Passkeys are in passkeys.ts, Google in oauth.ts.

import { Hono } from 'hono';
import { notSuspended, ownerOf, signedIn } from '../account';
import { checkCaptcha } from '../captcha';
import type { Ctx } from '../env';
import { cleanCode, cleanEmail, deviceName, isPasswordKey, readBody } from '../checks';
import { sendCode, takeCode } from '../codes';
import { randomToken, sha256 } from '../crypto';
import { emailTaken, invalid, notFound, wrongCode, wrongCredentials } from '../errors';
import { HOUR, limit, MINUTE, networkLimit, uncount, uncountNetwork } from '../limits';
import { bearer, perNetwork, type AppEnv } from '../middleware';
import { browserRoundsOf, checkPasswordKey, hashPasswordKey } from '../password';

/** The browser's PBKDF2 rounds (contract/password.ts). Fixed: changing it changes every key. */
const SIGNUPS_PER_NETWORK = 30;
const WRONG_PER_ADDRESS = 10;
const WRONG_PER_NETWORK = 100;
const WRONG_WINDOW = 15 * MINUTE;

const notAnEmail = () => invalid("That doesn't look like an email address.");
const notAKey = () => invalid("The password couldn't be read. Reload the page and try again.");

/**
 * Count a password check against the address and the network before making it, so many at once
 * can't get past the limit; a right password takes its count back, so only wrong ones add up.
 */
export async function checkWithLimits(
  ctx: Ctx,
  email: string,
  key: string,
  stored: string | null,
  previousKey?: unknown,
): Promise<{ ok: boolean; rehash: boolean }> {
  const message = 'Too many wrong passwords. Wait 15 minutes, or set a new one with "Forgot password".';
  // The network first: one network trying many addresses stops there, before each address
  // writes a count of its own (D1's daily writes).
  await networkLimit(ctx, 'wrong', WRONG_PER_NETWORK, WRONG_WINDOW, message);
  await limit(ctx, `wrong:${email}`, WRONG_PER_ADDRESS, WRONG_WINDOW, message);
  const result = await checkPasswordKey(keyFor(ctx, stored, key, previousKey), stored, ctx.cfg.passwordIterations);
  if (result.ok) {
    await uncount(ctx, `wrong:${email}`);
    await uncountNetwork(ctx, 'wrong');
  }
  return result;
}

/**
 * The key to check against a stored hash: the one made with today's browser rounds, or, while
 * the rounds are changing (PASSWORD_PREVIOUS_ITERATIONS), the one made with the previous rounds
 * when that's what the hash was made from. The browser sends both then, so nothing about the
 * account has to be asked first (which would tell anyone whether it exists).
 */
export function keyFor(ctx: Ctx, stored: string | null, key: string, previousKey: unknown): string {
  const made = browserRoundsOf(stored);
  if (made !== ctx.cfg.passwordIterations && made === ctx.cfg.previousIterations && isPasswordKey(previousKey)) return previousKey;
  return key;
}

export const auth = new Hono<AppEnv>();

auth.get('/auth/methods', (c) => {
  const { cfg } = c.var.ctx;
  return c.json({
    password: { saltPrefix: cfg.saltPrefix, iterations: cfg.passwordIterations, minLength: 8, previousIterations: cfg.previousIterations },
    emailCode: cfg.emailCode,
    oauth: cfg.google ? ['google'] : [],
    captcha: cfg.captcha ? { provider: 'turnstile', siteKey: cfg.captcha.siteKey } : null,
    requireVerifiedEmail: cfg.requireVerifiedEmail,
  });
});

auth.post('/auth/password/signup', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const b = await readBody(c.req.raw, ['email', 'passwordKey', 'captcha']);
  const email = cleanEmail(b.email);
  if (!email) throw notAnEmail();
  if (!isPasswordKey(b.passwordKey)) throw notAKey();
  await checkCaptcha(ctx, b.captcha);
  await networkLimit(ctx, 'signups', SIGNUPS_PER_NETWORK, HOUR, 'Too many accounts made from this network. Try again in an hour.');
  const id = randomToken(12);
  const made = await ctx.db.createUser({ id, email, verified: false, password: await hashPasswordKey(b.passwordKey, ctx.cfg.passwordIterations), now: Date.now() });
  if (!made) throw emailTaken();
  const user = (await ctx.db.userById(id))!;
  if (ctx.cfg.requireVerifiedEmail) {
    // The account is made either way; if the mail fails, the person asks for another code.
    await sendCode(ctx, { purpose: 'confirm', subject: id }, email, { counted: false }).catch((e) => console.error('Confirm code', e));
  }
  return c.json(await signedIn(ctx, user, deviceName(c.req.header('user-agent')), true));
});

auth.post('/auth/password/signin', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const b = await readBody(c.req.raw, ['email', 'passwordKey', 'previousPasswordKey', 'captcha']);
  const email = cleanEmail(b.email);
  if (!email) throw notAnEmail();
  if (!isPasswordKey(b.passwordKey)) throw notAKey();
  await checkCaptcha(ctx, b.captcha);
  // An unknown address is checked against nothing, at the same cost: the same answer either way.
  const user = await ctx.db.userByEmail(email);
  const { ok, rehash } = await checkWithLimits(ctx, email, b.passwordKey, user?.password ?? null, b.previousPasswordKey);
  if (!ok || !user) throw wrongCredentials();
  // Behind (the Worker's rounds, or the browser's): stored again from the key made today.
  if (rehash) await ctx.db.setPassword(user.id, await hashPasswordKey(b.passwordKey, ctx.cfg.passwordIterations));
  // Only while nothing has changed who may sign in since the password was read (a reset, the
  // owner taking the address back): else the checked password is already the old one.
  return c.json(await signedIn(ctx, user, deviceName(c.req.header('user-agent')), false, { epoch: user.auth_epoch }));
});

auth.post('/auth/password/forgot', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const b = await readBody(c.req.raw, ['email', 'captcha']);
  const email = cleanEmail(b.email);
  if (!email) throw notAnEmail();
  await checkCaptcha(ctx, b.captcha);
  // Counted and limited the same with or without an account, and the mail goes after the reply,
  // so neither the answer nor how long it takes says whether there's an account.
  const user = await ctx.db.userByEmail(email);
  await sendCode(ctx, { purpose: 'reset', subject: email }, email, { deliver: !!user, later: true });
  return c.body(null, 204);
});

auth.post('/auth/password/reset', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const b = await readBody(c.req.raw, ['email', 'code', 'passwordKey']);
  if (!isPasswordKey(b.passwordKey)) throw notAKey();
  const email = cleanEmail(b.email);
  if (!email || !(await takeCode(ctx, { purpose: 'reset', subject: email }, cleanCode(b.code)))) throw wrongCode();
  const user = await ctx.db.userByEmail(email);
  if (!user) throw wrongCode();
  notSuspended(user);
  // The code proves the address: it's confirmed, and whoever knew the old password is out.
  await ctx.db.claimAccount(user.id, await hashPasswordKey(b.passwordKey, ctx.cfg.passwordIterations));
  return c.json(await signedIn(ctx, (await ctx.db.userById(user.id))!, deviceName(c.req.header('user-agent')), false));
});

auth.post('/auth/code/send', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  if (!ctx.cfg.emailCode) throw notFound();
  const b = await readBody(c.req.raw, ['email', 'captcha']);
  const email = cleanEmail(b.email);
  if (!email) throw notAnEmail();
  await checkCaptcha(ctx, b.captcha);
  await sendCode(ctx, { purpose: 'signin', subject: email }, email);
  return c.body(null, 204);
});

auth.post('/auth/code/verify', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  if (!ctx.cfg.emailCode) throw notFound();
  const b = await readBody(c.req.raw, ['email', 'code']);
  const email = cleanEmail(b.email);
  if (!email || !(await takeCode(ctx, { purpose: 'signin', subject: email }, cleanCode(b.code)))) throw wrongCode();
  // Before ownerOf, which may change the account.
  notSuspended(await ctx.db.userByEmail(email));
  const { user, isNew } = await ownerOf(ctx, email);
  return c.json(await signedIn(ctx, user, deviceName(c.req.header('user-agent')), isNew));
});

auth.post('/auth/signout', async (c) => {
  // Succeeds whatever the token, so signing out never gets stuck.
  const token = bearer(c.req.header('authorization'));
  if (token && token.length <= 100) await c.var.ctx.db.endSessionByHash(await sha256(token));
  return c.body(null, 204);
});
