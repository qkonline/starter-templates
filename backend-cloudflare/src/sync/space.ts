// One space's Durable Object (PRD section 11): a person's own data, or a team's. Cloudflare runs
// each space as one object, anywhere in its network, with its own SQLite storage, and hands it
// one request at a time: every space is its own first-come-first-served queue, and a million
// spaces are a million queues side by side rather than one shared line. The data is in
// store.ts; this adds the per-minute limits (kept in memory: the object holds all of its space's
// requests, so the count is exact while it's awake, and starting afresh after it sleeps is fine
// for a limit), and the R2 calls that start and finish multipart uploads.
//
// Every method answers an `Outcome`: plain data, since a thrown error loses its fields on the
// way back to the Worker.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import {
  fileView,
  MINUTE,
  partLength,
  partsOf,
  refuse,
  SpaceStore,
  type Outcome,
  type Result,
  type RecordView,
} from './store';

/** Requests a minute per person in one space. */
export const PUSHES_PER_MINUTE = 60;
export const PULLS_PER_MINUTE = 300;
export const PARTS_PER_MINUTE = 600;

type FileView = ReturnType<typeof fileView>;

/** Where a space's files are in R2: `sync/user/<id>/<file>` or `sync/team/<id>/<file>`. */
export const filePrefix = (space: string) => `sync/${space.replace(':', '/')}/`;

export class SyncSpace extends DurableObject<Env> {
  private readonly store: SpaceStore;
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SpaceStore(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn));
  }

  /** Counts one request against `key`; the seconds to wait when it's over `max` a minute. */
  private busy(key: string, max: number, now = Date.now()): number | null {
    let w = this.windows.get(key);
    if (!w || now - w.start >= MINUTE) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
      // Forget the windows that have run out, so the map stays small.
      if (this.windows.size > 1000) for (const [k, v] of this.windows) if (now - v.start >= MINUTE) this.windows.delete(k);
    }
    if (w.count >= max) return Math.max(1, Math.ceil((w.start + MINUTE - now) / 1000));
    w.count++;
    return null;
  }

  private slowDown(wait: number) {
    return refuse(429, 'rate_limited', 'Syncing is going too fast. It will carry on in a moment.', wait);
  }

  async push(user: string, body: string): Promise<Outcome<{ results: Result[] }>> {
    const wait = this.busy(`push:${user}`, PUSHES_PER_MINUTE);
    if (wait) return this.slowDown(wait);
    return this.store.push(user, body);
  }

  async pull(user: string, since: number, limit?: number): Promise<Outcome<{ records: RecordView[]; next: string; more: boolean }>> {
    const wait = this.busy(`pull:${user}`, PULLS_PER_MINUTE);
    if (wait) return this.slowDown(wait);
    return { ok: true, value: this.store.pull(since, limit) };
  }

  /** Starts an upload, or answers with the file already started under this id. */
  async fileStart(space: string, user: string, f: { id: string; type: string; size: number }): Promise<Outcome<{ file: FileView }>> {
    const wait = this.busy(`part:${user}`, PARTS_PER_MINUTE);
    if (wait) return this.slowDown(wait);
    // No other request of this space runs until the upload is recorded, so one id is one upload.
    return this.ctx.blockConcurrencyWhile(async () => {
      const check = this.store.fileCheck(user, f);
      if (!check.ok) return check;
      if (check.value) return { ok: true as const, value: { file: fileView(check.value) } };
      const upload = await this.env.FILES.createMultipartUpload(filePrefix(space) + f.id, { httpMetadata: { contentType: f.type } });
      return { ok: true as const, value: { file: fileView(this.store.fileStarted(user, f, upload.uploadId)) } };
    });
  }

  /** Where part `n` of a file goes, once its length is right; the Worker sends the bytes to R2. */
  async filePart(space: string, user: string, fileId: string, n: number, length: number): Promise<Outcome<{ key: string; uploadId: string }>> {
    const wait = this.busy(`part:${user}`, PARTS_PER_MINUTE);
    if (wait) return this.slowDown(wait);
    const f = this.store.file(fileId);
    if (!f) return refuse(404, 'not_found', "That upload isn't here. Start it again.");
    if (f.complete) return refuse(409, 'conflict', 'That file is already complete.');
    const want = partLength(f.size, n);
    if (want === null) return refuse(400, 'invalid_input', `That file has ${partsOf(f.size)} parts.`);
    if (length !== want) return refuse(400, 'invalid_input', `Part ${n} should be ${want} bytes.`);
    return { ok: true, value: { key: filePrefix(space) + f.id, uploadId: f.upload_id } };
  }

  async fileComplete(space: string, user: string, fileId: string, parts: { number: number; etag: string }[]): Promise<Outcome<{ file: FileView }>> {
    const wait = this.busy(`part:${user}`, PARTS_PER_MINUTE);
    if (wait) return this.slowDown(wait);
    return this.ctx.blockConcurrencyWhile(async () => {
      const f = this.store.file(fileId);
      if (!f) return refuse(404, 'not_found', "That upload isn't here. Start it again.");
      if (f.complete) return { ok: true as const, value: { file: fileView(f) } };
      const count = partsOf(f.size);
      if (parts.length !== count || parts.some((p, i) => p.number !== i + 1))
        return refuse(400, 'invalid_input', `Send all ${count} parts, in order, to finish this file.`);
      try {
        await this.env.FILES.resumeMultipartUpload(filePrefix(space) + f.id, f.upload_id).complete(
          parts.map((p) => ({ partNumber: p.number, etag: p.etag })),
        );
      } catch {
        return refuse(400, 'invalid_input', "The parts sent don't match what was uploaded. Send the missing ones again.");
      }
      this.store.fileCompleted(f.id);
      return { ok: true as const, value: { file: fileView({ ...f, complete: 1 }) } };
    });
  }

  /** Where a complete file is, for the Worker to send. */
  async fileGet(space: string, user: string, fileId: string): Promise<Outcome<{ key: string; type: string }>> {
    const wait = this.busy(`pull:${user}`, PULLS_PER_MINUTE);
    if (wait) return this.slowDown(wait);
    const f = this.store.file(fileId);
    if (!f?.complete) return refuse(404, 'not_found', "That file isn't here.");
    return { ok: true, value: { key: filePrefix(space) + f.id, type: f.type } };
  }

  /** Everything of this space goes: its files in R2, unfinished uploads, and its storage. */
  async wipe(space: string): Promise<void> {
    for (const f of this.store.unfinished())
      await this.env.FILES.resumeMultipartUpload(filePrefix(space) + f.id, f.upload_id)
        .abort()
        .catch(() => {});
    let cursor: string | undefined;
    do {
      const page = await this.env.FILES.list({ prefix: filePrefix(space), cursor });
      if (page.objects.length) await this.env.FILES.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    await this.ctx.storage.deleteAll();
    this.windows.clear();
    this.store.init();
  }
}
