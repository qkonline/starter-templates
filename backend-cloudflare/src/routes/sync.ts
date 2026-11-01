// Offline data (optional, PRD section 11): /sync/push, /sync/pull and files in parts. The Worker
// checks who's asking and which space (their own, or a team they're in), then hands the request
// to that space's Durable Object (sync/space.ts), which applies it in order. Bodies are passed
// on as text, read once there, to keep within Workers Free's CPU time.

import { Hono } from 'hono';
import { isId, readBody, readCapped } from '../checks';
import type { Ctx } from '../env';
import { invalid, notFound, Refusal, tooMany } from '../errors';
import { requireFeature, requireUser, requireVerifiedEmail, type AppEnv } from '../middleware';
import { isMediaType, isSyncId, MAX_BYTES, MAX_FILE, PAGE, PART_SIZE, type Outcome } from '../sync/store';

/** The space a request is for: `user:<id>`, or `team:<id>` for a member. Anything else is not_found. */
async function spaceFor(ctx: Ctx, userId: string, team: string | undefined): Promise<string> {
  if (team === undefined) return `user:${userId}`;
  if (!ctx.cfg.teams || !isId(team) || !(await ctx.db.teamOf(team, userId))) throw notFound();
  return `team:${team}`;
}

const stubOf = (ctx: Ctx, space: string) => ctx.env.SPACES.get(ctx.env.SPACES.idFromName(space));

/**
 * Calls the space's object and unwraps its answer. An object with more waiting than it can take
 * is overloaded: that's `rate_limited` too, so the device waits and sends the same again.
 */
async function ask<T>(work: Promise<Outcome<T>>): Promise<T> {
  let out: Outcome<T>;
  try {
    out = await work;
  } catch (e) {
    if ((e as { overloaded?: boolean })?.overloaded) throw tooMany(5, 'The server is busy. Syncing will carry on in a moment.');
    throw e;
  }
  if (!out.ok) {
    if (out.status === 429) throw tooMany(out.retryAfter, out.message);
    throw new Refusal(out.status, out.code, out.message);
  }
  return out.value;
}

/** Everything a space keeps goes: when its account or team is deleted. */
export async function wipeSpace(ctx: Ctx, space: string): Promise<void> {
  await stubOf(ctx, space).wipe(space);
}

/**
 * Before an account is deleted: the spaces that go with it, its own and those of the teams it's
 * alone in (deleting the account deletes those teams). Wipe them with `wipeSpaces` after.
 */
export async function spacesOf(ctx: Ctx, userId: string): Promise<string[]> {
  if (!ctx.cfg.sync) return [];
  const solo = ctx.cfg.teams ? (await ctx.db.teamsOf(userId)).filter((t) => t.member_count === 1).map((t) => `team:${t.id}`) : [];
  return [`user:${userId}`, ...solo];
}

export async function wipeSpaces(ctx: Ctx, spaces: string[]): Promise<void> {
  for (const space of spaces) await wipeSpace(ctx, space);
}

export const sync = new Hono<AppEnv>();

for (const path of ['/sync', '/sync/*']) sync.use(path, requireFeature((cfg) => cfg.sync), requireUser, requireVerifiedEmail);

sync.post('/sync/push', async (c) => {
  const { ctx, user } = c.var;
  const space = await spaceFor(ctx, user.id, c.req.query('team'));
  const bytes = await readCapped(c.req.raw, MAX_BYTES);
  if (!bytes) throw new Refusal(413, 'too_large', 'That batch is over 256 KB. Send fewer changes at a time.');
  return c.json(await ask(stubOf(ctx, space).push(user.id, new TextDecoder().decode(bytes))));
});

sync.get('/sync/pull', async (c) => {
  const { ctx, user } = c.var;
  const space = await spaceFor(ctx, user.id, c.req.query('team'));
  const since = c.req.query('since');
  const limit = c.req.query('limit');
  if (since !== undefined && !/^\d{1,15}$/.test(since)) throw invalid('That sync position is out of date. Start again from the beginning.');
  if (limit !== undefined && (!/^\d{1,3}$/.test(limit) || +limit < 1 || +limit > PAGE)) throw invalid(`Ask for 1 to ${PAGE} records at a time.`);
  return c.json(await ask(stubOf(ctx, space).pull(user.id, Number(since ?? 0), limit === undefined ? undefined : Number(limit))));
});

sync.post('/sync/files', async (c) => {
  const { ctx, user } = c.var;
  const space = await spaceFor(ctx, user.id, c.req.query('team'));
  const b = await readBody(c.req.raw, ['id', 'type', 'size']);
  if (!isSyncId(b.id) || !isMediaType(b.type) || !Number.isSafeInteger(b.size) || (b.size as number) < 1)
    throw invalid("That file couldn't be read. Update the app and try again.");
  if ((b.size as number) > MAX_FILE) throw new Refusal(413, 'too_large', 'Files can be at most 1 GB.');
  return c.json(await ask(stubOf(ctx, space).fileStart(space, user.id, { id: b.id, type: b.type, size: b.size as number })));
});

sync.put('/sync/files/:fileId/parts/:number', async (c) => {
  const { ctx, user } = c.var;
  const space = await spaceFor(ctx, user.id, c.req.query('team'));
  const fileId = c.req.param('fileId');
  const n = Number(c.req.param('number'));
  if (!isSyncId(fileId)) throw notFound();
  if (!Number.isInteger(n) || n < 1 || n > 10_000) throw invalid('Parts are numbered from 1 to 10,000.');
  const bytes = await readCapped(c.req.raw, PART_SIZE);
  if (!bytes) throw new Refusal(413, 'too_large', 'That part is larger than a part can be.');
  const target = await ask(stubOf(ctx, space).filePart(space, user.id, fileId, n, bytes.length));
  let part: R2UploadedPart;
  try {
    part = await ctx.env.FILES.resumeMultipartUpload(target.key, target.uploadId).uploadPart(n, bytes);
  } catch {
    // R2 has dropped the upload (unfinished for days): it has to start again.
    throw new Refusal(404, 'not_found', "That upload isn't here any more. Start it again.");
  }
  return c.json({ etag: part.etag });
});

sync.post('/sync/files/:fileId/complete', async (c) => {
  const { ctx, user } = c.var;
  const space = await spaceFor(ctx, user.id, c.req.query('team'));
  const fileId = c.req.param('fileId');
  if (!isSyncId(fileId)) throw notFound();
  const b = await readBody(c.req.raw, ['parts']);
  const parts = b.parts;
  const fits = (p: unknown): p is { number: number; etag: string } =>
    !!p &&
    typeof p === 'object' &&
    Object.keys(p).every((k) => k === 'number' || k === 'etag') &&
    Number.isInteger((p as { number: unknown }).number) &&
    typeof (p as { etag: unknown }).etag === 'string' &&
    (p as { etag: string }).etag.length <= 200;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 10_000 || !parts.every(fits))
    throw invalid("That list of parts couldn't be read. Update the app and try again.");
  return c.json(await ask(stubOf(ctx, space).fileComplete(space, user.id, fileId, parts)));
});

sync.get('/sync/files/:fileId', async (c) => {
  const { ctx, user } = c.var;
  const space = await spaceFor(ctx, user.id, c.req.query('team'));
  const fileId = c.req.param('fileId');
  if (!isSyncId(fileId)) throw notFound();
  const where = await ask(stubOf(ctx, space).fileGet(space, user.id, fileId));
  const obj = await ctx.env.FILES.get(where.key);
  if (!obj) throw notFound();
  // Never shown as a page on the API's address: a download, with nothing it could run.
  return new Response(obj.body, {
    headers: {
      'content-type': where.type,
      'content-disposition': `attachment; filename="${fileId}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
});
