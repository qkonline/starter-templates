import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '#lib/api/errors.ts';
import type { Api } from '#lib/api/client.ts';
import { newId } from './ids';
import { ME, openLocal, type Fields } from './local';
import { createSync, type Refused } from './sync';

let n = 0;

type Change = {
  id: string;
  table: string;
  record: string;
  op: 'put' | 'delete';
  fields?: Fields;
  at: string;
};

/** A backend in memory that merges as the real one does, with hooks to make it refuse. */
function fakeBackend() {
  const records = new Map<
    string,
    { table: string; id: string; fields: Fields; deleted: boolean; seq: number }
  >();
  const applied = new Set<string>();
  let seq = 0;
  const batches: Change[][] = [];
  const files = new Map<string, { size: number; parts: Map<number, Blob>; complete: boolean }>();
  const backend = {
    records,
    batches,
    files,
    /** Throw this from the next push (once). */
    failNext: null as ApiError | null,
    /** Teams the person isn't in. */
    gone: new Set<string>(),
    /** Change ids whose batch can't be read. */
    unreadable: new Set<string>(),
    partCalls: 0,
    failPartAt: 0,
    /** File ids the person may not delete. */
    notYours: new Set<string>(),
  };
  const check = (team?: string) => {
    if (team && backend.gone.has(team)) throw new ApiError('not_found', "That isn't here.", 404);
  };
  const api = {
    async syncPush(changes: Change[], team?: string) {
      check(team);
      if (backend.failNext) {
        const e = backend.failNext;
        backend.failNext = null;
        throw e;
      }
      if (changes.some((c) => backend.unreadable.has(c.id)))
        throw new ApiError('invalid_input', 'Unreadable.', 400);
      batches.push(changes);
      return changes.map((c) => {
        if (applied.has(c.id)) return { id: c.id, status: 'applied' as const };
        applied.add(c.id);
        const key = `${team ?? ME}/${c.table}/${c.record}`;
        const found = records.get(key);
        if (c.op === 'put' && found?.deleted)
          return {
            id: c.id,
            status: 'refused' as const,
            code: 'conflict' as const,
            message: 'Deleted elsewhere.',
          };
        records.set(key, {
          table: c.table,
          id: c.record,
          fields: c.op === 'delete' ? {} : { ...found?.fields, ...c.fields },
          deleted: c.op === 'delete',
          seq: ++seq,
        });
        return { id: c.id, status: 'applied' as const };
      });
    },
    async syncPull(opts: { team?: string; since?: string; limit?: number } = {}) {
      check(opts.team);
      const since = Number(opts.since ?? 0);
      const limit = opts.limit ?? 2;
      const mine = [...records.entries()]
        .filter(([k, r]) => k.startsWith(`${opts.team ?? ME}/`) && r.seq > since)
        .map(([, r]) => r)
        .sort((a, b) => a.seq - b.seq);
      const page = mine.slice(0, limit);
      return {
        records: page.map((r) => ({
          table: r.table,
          id: r.id,
          version: String(r.seq),
          fields: r.fields,
          deleted: r.deleted,
          createdBy: 'u',
          updatedBy: 'u',
          createdAt: 'x',
          updatedAt: 'y',
          changedAt: 'z',
        })),
        next: String(page.at(-1)?.seq ?? since),
        more: mine.length > limit,
      };
    },
    async syncFileStart(f: { id: string; size: number; type: string }) {
      if (!files.has(f.id)) files.set(f.id, { size: f.size, parts: new Map(), complete: false });
      return { id: f.id, type: f.type, size: f.size, partSize: 4, complete: files.get(f.id)!.complete };
    },
    async syncFilePart(id: string, number: number, bytes: Blob) {
      backend.partCalls++;
      if (backend.failPartAt && backend.partCalls === backend.failPartAt)
        throw new ApiError('network', 'No answer.', 0);
      files.get(id)!.parts.set(number, bytes);
      return `etag-${number}`;
    },
    deletedFiles: [] as string[],
    async syncFileDelete(id: string) {
      if (backend.notYours.has(id)) throw new ApiError('forbidden', 'Not yours to delete.', 403);
      files.delete(id);
      api.deletedFiles.push(id);
    },
    async syncFileComplete(id: string) {
      const f = files.get(id)!;
      f.complete = true;
      return { id, type: 'x/y', size: f.size, partSize: 4, complete: true };
    },
  };
  return { backend, api: api as unknown as Api, deleted: api.deletedFiles };
}

async function setup() {
  const local = await openLocal(`sync-${++n}`);
  const { backend, api, deleted } = fakeBackend();
  const refused: Refused[] = [];
  const lost: string[] = [];
  const sleep = vi.fn((ms: number) => Promise.resolve(void ms));
  const sync = createSync(local, api, {
    sleep,
    exclusive: (fn) => fn(),
    onRefused: (r) => refused.push(...r),
    onLostSpace: (s) => lost.push(s),
  });
  return { local, backend, api, sync, refused, lost, sleep, deleted };
}

describe('syncing', () => {
  it('two devices offline each add a record: after both sync, both have both', async () => {
    const a = await setup();
    const local2 = await openLocal(`sync-${++n}`);
    const sync2 = createSync(local2, a.api, { exclusive: (fn) => fn() });
    const ali = newId();
    const sara = newId();
    await a.local.put(ME, 'appointments', ali, { patient: 'Ali' });
    await local2.put(ME, 'appointments', sara, { patient: 'Sara' });
    await sync2.run();
    await a.sync.run();
    await sync2.run();
    for (const l of [a.local, local2])
      expect((await l.list(ME, 'appointments')).map((r) => r.id).sort()).toEqual([ali, sara].sort());
    expect(await a.local.pendingCount()).toBe(0);
  });

  it('sends the outbox in batches of 100, in order, then pulls every page', async () => {
    const { local, backend, sync } = await setup();
    const ids = Array.from({ length: 150 }, () => newId());
    for (const [i, id] of ids.entries()) await local.put(ME, 'items', id, { i });
    await sync.run();
    expect(backend.batches.map((b) => b.length)).toEqual([100, 50]);
    expect(backend.batches.flat().map((c) => c.record)).toEqual(ids);
    expect(await local.pendingCount()).toBe(0);
    expect(await local.cursor(ME)).toBe('150');
    expect((await local.list(ME, 'items')).every((r) => r.pending === 0 && r.base.i === r.fields.i)).toBe(
      true,
    );
  });

  it('waits as long as the backend says, then sends the same batch again', async () => {
    const { local, backend, sync, sleep } = await setup();
    await local.put(ME, 'notes', newId(), { a: 1 });
    backend.failNext = new ApiError('rate_limited', 'Too fast.', 429, 7);
    await sync.run();
    expect(sleep).toHaveBeenCalledTimes(1);
    const waited = sleep.mock.calls[0]![0];
    expect(waited).toBeGreaterThanOrEqual(7000);
    expect(waited).toBeLessThan(9001);
    expect(backend.batches).toHaveLength(1);
    expect(await local.pendingCount()).toBe(0);
  });

  it('with no answer, stops and keeps everything for the next run', async () => {
    const { local, backend, sync } = await setup();
    await local.put(ME, 'notes', newId(), { a: 1 });
    backend.failNext = new ApiError('network', 'Offline.', 0);
    await sync.run();
    expect(await local.pendingCount()).toBe(1);
    // The next run (on reconnecting, or the retry it set itself) sends it.
    await sync.run();
    expect(await local.pendingCount()).toBe(0);
    sync.stop();
  });

  it('a batch the backend can’t read is sent one by one; only the bad change is dropped, and said', async () => {
    const { local, backend, sync, refused } = await setup();
    const good = newId();
    const bad = newId();
    await local.put(ME, 'notes', good, { ok: true });
    await local.put(ME, 'notes', bad, { ok: false });
    const { entries } = (await local.batch(100, 200_000))!;
    backend.unreadable.add(entries[1]!.change.id);
    await sync.run();
    expect(await local.pendingCount()).toBe(0);
    expect(refused).toEqual([expect.objectContaining({ record: bad, code: 'invalid_input' })]);
    expect(await local.get(ME, 'notes', bad)).toBeUndefined();
    // Set aside with what it said, not lost.
    expect(await local.refused()).toEqual([
      expect.objectContaining({ change: expect.objectContaining({ record: bad, fields: { ok: false } }) }),
    ]);
    expect(await local.get(ME, 'notes', good)).toMatchObject({ fields: { ok: true } });
  });

  it('a change refused by the backend is dropped and the record shows what the backend has', async () => {
    const { local, backend, sync, refused } = await setup();
    const id = newId();
    await local.put(ME, 'notes', id, { title: 'x' });
    await sync.run();
    // Deleted on another device, then edited here before this device heard.
    backend.records.set(`${ME}/notes/${id}`, { table: 'notes', id, fields: {}, deleted: true, seq: 99 });
    await local.put(ME, 'notes', id, { title: 'edited' });
    await sync.run();
    expect(refused).toEqual([expect.objectContaining({ record: id, code: 'conflict' })]);
    expect(await local.get(ME, 'notes', id)).toMatchObject({ deleted: true, pending: 0 });
  });

  it('a team the backend turns away is set aside, its unsent changes kept, until the person discards it', async () => {
    const { local, backend, sync, lost } = await setup();
    await local.follow('t1');
    await local.put('t1', 'notes', newId(), { a: 1 });
    await local.put(ME, 'notes', newId(), { b: 2 });
    backend.gone.add('t1');
    await sync.run();
    expect(lost).toEqual(['t1']);
    // The person's own change still went; the team's is kept.
    expect(await local.pendingCount()).toBe(1);
    expect(await local.followed()).toEqual(['t1']);
    // Added back to the team (or the switch turned on again): it goes.
    backend.gone.delete('t1');
    await sync.retryLost();
    expect(await local.pendingCount()).toBe(0);
    // Turned away again, and this time the person lets it go.
    await local.put('t1', 'notes', newId(), { c: 3 });
    backend.gone.add('t1');
    await sync.run();
    await sync.discardSpace('t1');
    expect(await local.pendingCount()).toBe(0);
    expect(await local.followed()).toEqual([]);
  });

  it('an outdated copy of the app stops syncing and keeps everything', async () => {
    const { local, backend, sync } = await setup();
    await local.put(ME, 'notes', newId(), { a: 1 });
    backend.failNext = new ApiError('client_outdated', 'Update the app.', 426);
    await sync.run();
    expect(await local.pendingCount()).toBe(1);
  });

  it('a file goes up in parts and carries on from the last part after a dropped connection', async () => {
    const { local, backend, sync } = await setup();
    const id = await local.saveFile(ME, new Blob(['0123456789'], { type: 'text/plain' }));
    backend.failPartAt = 2;
    await sync.run();
    expect((await local.waitingFiles())[0]!.parts.map((p) => p.number)).toEqual([1]);
    await sync.run();
    const f = backend.files.get(id)!;
    expect(f.complete).toBe(true);
    expect(await Promise.all([1, 2, 3].map(async (p) => f.parts.get(p)!.text()))).toEqual([
      '0123',
      '4567',
      '89',
    ]);
    // Part 1 went once.
    expect(backend.partCalls).toBe(4);
    expect(await local.waitingFiles()).toEqual([]);
  });

  it('a file deleted here is deleted on the backend; one that is not theirs is said, not retried', async () => {
    const { local, backend, sync, refused, deleted } = await setup();
    const [mine, theirs] = [newId(), newId()];
    await local.keepFile(ME, mine, new Blob(['a']));
    await local.keepFile(ME, theirs, new Blob(['b']));
    backend.notYours.add(theirs);
    await local.removeFile(ME, mine);
    await local.removeFile(ME, theirs);
    await sync.run();
    expect(deleted).toEqual([mine]);
    expect(refused).toEqual([expect.objectContaining({ record: theirs, code: 'forbidden' })]);
    expect(await local.deletions()).toEqual([]);
  });
});
