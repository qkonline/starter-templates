// The account (PRD section 2): name, password, confirming and changing the email, photo, export,
// devices, deletion. Every route here needs a session, and none needs a confirmed email, so an
// unconfirmed person can always confirm, change the address, or leave.

import { Hono } from 'hono';
import { sessionView, userView } from '../account';
import { checkCaptcha } from '../captcha';
import { cleanCode, cleanEmail, cleanName, isId, isPasswordKey, readBody, readCapped } from '../checks';
import { matchCode, sendCode, takeCode, useCode } from '../codes';
import { randomToken } from '../crypto';
import type { Ctx } from '../env';
import { emailTaken, invalid, notFound, Refusal, signedOut, wrongCode } from '../errors';
import { HOUR, limit } from '../limits';
import { requireUser, type AppEnv } from '../middleware';
import { checkPasswordKey, hashPasswordKey } from '../password';
import { clearPhotos, photoKey } from '../photos';
import { checkWithLimits } from './auth';
import { exportOf } from './export';
import { deleteAccount } from '../deletion';

const MAX_PHOTO = 2 * 1024 * 1024;
const PHOTOS_PER_HOUR = 20;
const EMAIL_CHANGES_PER_HOUR = 5;

/** The photo types taken, with the bytes each file starts with, so what's stored is what it says. */
const PHOTO_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
};

/** The account as it is now, read again after a change. */
async function fresh(ctx: Ctx, id: string) {
  const user = await ctx.db.userById(id);
  if (!user) throw signedOut();
  return { user: userView(ctx, user) };
}

export const me = new Hono<AppEnv>();

me.use('/me', requireUser);
me.use('/me/*', requireUser);

me.get('/me', (c) => c.json({ user: userView(c.var.ctx, c.var.user) }));

me.patch('/me', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['name']);
  const name = cleanName(b.name);
  if (!name) throw invalid('Give a name of 1 to 60 characters.');
  await ctx.db.setName(user.id, name);
  return c.json(await fresh(ctx, user.id));
});

me.delete('/me', async (c) => {
  const { ctx, user } = c.var;
  await deleteAccount(ctx, user.id);
  return c.body(null, 204);
});

me.put('/me/password', async (c) => {
  const { ctx, user, session } = c.var;
  const b = await readBody(c.req.raw, ['currentPasswordKey', 'passwordKey']);
  if (!isPasswordKey(b.currentPasswordKey) || !isPasswordKey(b.passwordKey))
    throw invalid("The password couldn't be read. Reload the page and try again.");
  if (!user.password) throw invalid('This account has no password yet. Set one with "Forgot password".');
  if (!(await checkWithLimits(ctx, user.email, b.currentPasswordKey, user.password)).ok)
    throw new Refusal(400, 'invalid_credentials', "That isn't your current password.");
  // Whoever knew the old password is out, even mid-sign-in (auth_epoch); this device stays.
  await ctx.db.changePassword(user.id, await hashPasswordKey(b.passwordKey), session.id);
  return c.body(null, 204);
});

me.post('/me/email/confirm/send', async (c) => {
  const { ctx, user } = c.var;
  if (user.email_verified) throw invalid('Your email address is already confirmed.');
  await sendCode(ctx, { purpose: 'confirm', subject: user.id }, user.email);
  return c.body(null, 204);
});

me.post('/me/email/confirm', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['code']);
  if (!(await takeCode(ctx, { purpose: 'confirm', subject: user.id }, cleanCode(b.code)))) throw wrongCode();
  await ctx.db.setVerified(user.id);
  return c.json(await fresh(ctx, user.id));
});

me.post('/me/email/send', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['email', 'captcha']);
  const email = cleanEmail(b.email);
  if (!email) throw invalid("That doesn't look like an email address.");
  if (email === user.email) throw invalid("That's already your email address.");
  await checkCaptcha(ctx, b.captcha);
  await limit(ctx, `emailchange:user:${user.id}`, EMAIL_CHANGES_PER_HOUR, HOUR, 'Too many codes asked for. Try again in an hour.');
  // An address another account has gets the same answer and no mail, so this can't be used to
  // find out who has an account; verify refuses it once a right code shows the inbox is theirs.
  const taken = !!(await ctx.db.userByEmail(email));
  // Kept under this account and the new address: good only for this account (bind).
  await sendCode(ctx, { purpose: 'change', subject: email, bind: user.id }, email, { deliver: !taken });
  return c.body(null, 204);
});

me.post('/me/email/verify', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['email', 'code', 'currentPasswordKey', 'passwordKey']);
  // The email salts the password key, so a password account sends the key made with the old
  // address (to prove the password) and the one made with the new (to store).
  if (user.password) {
    if (!isPasswordKey(b.currentPasswordKey) || !isPasswordKey(b.passwordKey))
      throw invalid('Give your current password to move your account to a new address.');
  } else if (b.currentPasswordKey !== undefined || b.passwordKey !== undefined) {
    throw invalid("This account has no password, so there's none to give.");
  }
  const email = cleanEmail(b.email);
  const code = cleanCode(b.code);
  const which = { purpose: 'change' as const, subject: email ?? '', bind: user.id };
  if (!email || !code) throw wrongCode();
  // Each check of the current password here spends one of the code's five tries, which bounds
  // the guesses (this route has no rate_limited answer of its own).
  if (!(await matchCode(ctx, which, code))) throw wrongCode();
  // Only once the code is right: whoever has it owns the address, so this tells them nothing new.
  if (await ctx.db.userByEmail(email)) throw emailTaken();
  if (user.password && !(await checkPasswordKey(b.currentPasswordKey as string, user.password)).ok)
    throw new Refusal(400, 'invalid_credentials', "That isn't your current password.");
  if (!(await useCode(ctx, which, code))) throw wrongCode();
  const password = user.password ? await hashPasswordKey(b.passwordKey as string) : null;
  if (!(await ctx.db.setEmail(user.id, email, password))) throw emailTaken();
  return c.json(await fresh(ctx, user.id));
});

me.put('/me/photo', async (c) => {
  const { ctx, user } = c.var;
  const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const looksRight = PHOTO_TYPES[type];
  if (!looksRight) throw new Refusal(415, 'unsupported_type', 'Use a PNG, JPEG or WebP image.');
  // Read no further than 2 MB, whatever Content-Length says (or doesn't).
  const bytes = await readCapped(c.req.raw, MAX_PHOTO);
  if (!bytes) throw new Refusal(413, 'too_large', 'That image is over 2 MB. Pick a smaller one.');
  if (!looksRight(bytes)) throw invalid(`That file isn't the ${type.slice(6).toUpperCase()} image it says it is.`);
  await limit(ctx, `photos:user:${user.id}`, PHOTOS_PER_HOUR, HOUR, "That's a lot of new photos. Try again in an hour.");
  // A new id with each photo, so its address changes and it can be cached for good.
  const photo = randomToken(12);
  await ctx.env.PHOTOS.put(photoKey(user.id, photo), bytes, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  await ctx.db.setPhoto(user.id, photo);
  // Every other photo goes, including any left by an upload that failed half way.
  await clearPhotos(ctx.env.PHOTOS, user.id, photo);
  return c.json(await fresh(ctx, user.id));
});

me.delete('/me/photo', async (c) => {
  const { ctx, user } = c.var;
  if (user.photo) {
    await ctx.db.setPhoto(user.id, null);
    await clearPhotos(ctx.env.PHOTOS, user.id);
  }
  return c.json(await fresh(ctx, user.id));
});

me.get('/me/export', async (c) => {
  const { ctx, user, session } = c.var;
  return c.json(await exportOf(ctx, user, session.id));
});

me.get('/me/sessions', async (c) => {
  const { ctx, user, session } = c.var;
  return c.json({ sessions: (await ctx.db.sessions(user.id)).map((s) => sessionView(s, session.id)) });
});

me.delete('/me/sessions', async (c) => {
  const { ctx, user, session } = c.var;
  await ctx.db.endOtherSessions(user.id, session.id);
  return c.body(null, 204);
});

me.delete('/me/sessions/:id', async (c) => {
  const { ctx, user } = c.var;
  const id = c.req.param('id');
  if (!isId(id) || !(await ctx.db.endSession(user.id, id))) throw notFound();
  return c.body(null, 204);
});

/** The photo itself, for <img> tags: public, at an address that changes with each photo. */
export const photos = new Hono<AppEnv>();

photos.get('/photos/:userId/:photo', async (c) => {
  const userId = c.req.param('userId');
  const photo = c.req.param('photo');
  if (!isId(userId) || !isId(photo)) throw notFound();
  const obj = await c.var.ctx.env.PHOTOS.get(photoKey(userId, photo));
  if (!obj) throw notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(obj.body, { headers });
});
