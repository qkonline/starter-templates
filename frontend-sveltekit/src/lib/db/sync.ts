// Keeping this device's data in step with the backend (PRD section 11): send the outbox in
// batches, upload waiting files in parts, then pull what changed in each space. One run at a
// time, in one tab at a time (a Web Lock); it waits as long as the backend says on
// `rate_limited`, backs off on no answer, and stops on `signed_out`. Nothing is lost by stopping:
// the outbox and the cursors are in IndexedDB, and the next run carries on from there.

import { ApiError } from '#lib/api/errors.ts';
import type { Api } from '#lib/api/client.ts';
import { ME, type Local, type OutboxEntry, type Space } from './local';

/** What the backend takes in one batch (the contract's limits), with room for the JSON around it. */
export const BATCH_CHANGES = 100;
export const BATCH_BYTES = 200 * 1024;

export interface Refused {
  space: Space;
  table: string;
  record: string;
  code: string;
  message: string;
}

export interface SyncHooks {
  /** A run started or ended, or the waiting count changed. */
  onState?: (s: {
    running: boolean;
    pending: number;
    error: string | null;
    waitUntil: number | null;
  }) => void;
  /** Changes the backend refused: shown to the person who made them. */
  onRefused?: (r: Refused[]) => void;
  /** Records arrived from the backend: pages showing them read again. */
  onReceived?: (space: Space) => void;
  /** The person can't use this space any more (left the team, or it was deleted). */
  onLostSpace?: (space: Space) => void;
  /** Waits; tests replace it. */
  sleep?: (ms: number) => Promise<void>;
  /** Runs `fn` while holding the sync lock, or not at all when another tab holds it. */
  exclusive?: (fn: () => Promise<void>) => Promise<void>;
}

const team = (space: Space) => (space === ME ? undefined : space);
const realSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** The Web Locks API where there is one, so two tabs don't send the same outbox at once. */
function webLock(fn: () => Promise<void>): Promise<void> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) return fn();
  return locks.request('starter-sync', { ifAvailable: true }, async (lock) => {
    if (lock) await fn();
  });
}

/** Thrown inside a run to end it: the run is over, retried later. */
class Stop extends Error {
  constructor(
    readonly reason: string | null,
    readonly retryInMs: number | null,
  ) {
    super(reason ?? 'stopped');
  }
}

export function createSync(local: Local, api: Api, hooks: SyncHooks = {}) {
  const sleep = hooks.sleep ?? realSleep;
  const exclusive = hooks.exclusive ?? webLock;
  let running: Promise<void> | null = null;
  let again = false;
  /** Failures in a row with no answer, for the back-off. */
  let failures = 0;
  let stopped = false;

  async function report(state: { running: boolean; error: string | null; waitUntil: number | null }) {
    hooks.onState?.({ ...state, pending: await local.pendingCount() });
  }

  /**
   * One call to the backend. `rate_limited` waits as long as it says (plus a little, so devices
   * don't all come back at once) and tries again; no answer or a server error ends the run with a
   * growing wait; anything else is the caller's.
   */
  async function attempt<T>(call: () => Promise<T>): Promise<T> {
    for (;;) {
      try {
        const out = await call();
        failures = 0;
        return out;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        if (e.code === 'rate_limited') {
          const wait = (e.retryAfter ?? 30) * 1000 + Math.random() * 2000;
          // A long wait (the day's limit) ends the run; a short one is waited out here.
          if (wait > 120_000) throw new Stop(e.message, wait);
          await report({ running: true, error: null, waitUntil: Date.now() + wait });
          await sleep(wait);
          continue;
        }
        if (e.code === 'network' || e.status >= 500) {
          failures++;
          const wait = Math.min(5 * 60_000, 2000 * 2 ** Math.min(failures, 8)) * (0.5 + Math.random() / 2);
          throw new Stop(e.code === 'network' ? null : e.message, wait);
        }
        if (e.code === 'signed_out' || e.code === 'account_suspended') throw new Stop(null, null);
        throw e;
      }
    }
  }

  /** Sends one batch; when the backend can't read it, its changes one by one, dropping any it can't. */
  async function send(space: Space, entries: OutboxEntry[]): Promise<Refused[]> {
    let results;
    try {
      results = await attempt(() =>
        api.syncPush(
          entries.map((e) => e.change),
          team(space),
        ),
      );
    } catch (e) {
      if (!(e instanceof ApiError) || !['invalid_input', 'too_large'].includes(e.code)) throw e;
      if (entries.length > 1) {
        const refused: Refused[] = [];
        for (const one of entries) refused.push(...(await send(space, [one])));
        return refused;
      }
      // This change alone can't be read: it can never go, so it's dropped and said so.
      const [entry] = entries as [OutboxEntry];
      await local.settle(space, [{ entry, applied: false }]);
      return [
        { space, table: entry.change.table, record: entry.change.record, code: e.code, message: e.message },
      ];
    }
    const refused: Refused[] = [];
    await local.settle(
      space,
      entries.map((entry, i) => {
        const r = results[i];
        const applied = r?.status === 'applied';
        if (r && !applied)
          refused.push({
            space,
            table: entry.change.table,
            record: entry.change.record,
            code: r.code ?? 'conflict',
            message: r.message ?? '',
          });
        return { entry, applied };
      }),
    );
    return refused;
  }

  async function pushAll() {
    for (;;) {
      const batch = await local.batch(BATCH_CHANGES, BATCH_BYTES);
      if (!batch) return;
      try {
        const refused = await send(batch.space, batch.entries);
        if (refused.length) hooks.onRefused?.(refused);
      } catch (e) {
        if (
          e instanceof ApiError &&
          (e.code === 'not_found' || e.code === 'forbidden') &&
          batch.space !== ME
        ) {
          await lose(batch.space);
          continue;
        }
        throw e;
      }
      await report({ running: true, error: null, waitUntil: null });
    }
  }

  async function uploadAll() {
    for (const f of await local.waitingFiles()) {
      try {
        const remote = await attempt(() =>
          api.syncFileStart({ id: f.id, type: f.type, size: f.size }, team(f.space)),
        );
        if (!remote.complete) {
          for (let n = 1, at = 0; at < f.size; n++, at += remote.partSize) {
            if (f.parts.some((p) => p.number === n)) continue;
            const etag = await attempt(() =>
              api.syncFilePart(f.id, n, f.blob.slice(at, at + remote.partSize), team(f.space)),
            );
            f.parts = [...f.parts, { number: n, etag }];
            // Kept after each part, so a dropped connection resumes from the next.
            await local.updateFile(f);
          }
          const parts = [...f.parts].sort((a, b) => a.number - b.number);
          await attempt(() => api.syncFileComplete(f.id, parts, team(f.space)));
        }
        await local.updateFile({ ...f, parts: [], uploaded: true });
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        if (e.code === 'not_found' && f.space !== ME && !(await canUse(f.space))) {
          await lose(f.space);
          continue;
        }
        if (e.code === 'not_found' || e.code === 'invalid_input') {
          // The backend lost the upload, or the parts don't match: start the parts again.
          await local.updateFile({ ...f, parts: [] });
          continue;
        }
        if (e.code === 'conflict' || e.code === 'too_large') {
          // Never going to fit: keep it on this device only, and say so.
          await local.updateFile({ ...f, uploaded: true });
          hooks.onRefused?.([
            { space: f.space, table: 'files', record: f.id, code: e.code, message: e.message },
          ]);
          continue;
        }
        throw e;
      }
    }
  }

  /** Whether the person can still reach this team's data. */
  async function canUse(space: Space): Promise<boolean> {
    try {
      await attempt(() => api.syncPull({ team: team(space), limit: 1, since: '999999999999999' }));
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'not_found' || e.code === 'forbidden')) return false;
      throw e;
    }
  }

  async function lose(space: Space) {
    await local.dropSpace(space);
    hooks.onLostSpace?.(space);
  }

  async function pullAll() {
    for (const space of [ME, ...(await local.followed())]) {
      try {
        for (;;) {
          const since = (await local.cursor(space)) ?? undefined;
          const page = await attempt(() => api.syncPull({ team: team(space), since }));
          if (page.records.length) {
            await local.receive(space, page.records);
            hooks.onReceived?.(space);
          }
          await local.setCursor(space, page.next);
          if (!page.more) break;
        }
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'not_found' || e.code === 'forbidden') && space !== ME) {
          await lose(space);
          continue;
        }
        throw e;
      }
    }
  }

  /** Waits `ms`, then runs again, unless something else starts a run first. */
  function later(ms: number) {
    setTimeout(() => void run(), ms);
  }

  async function once() {
    await report({ running: true, error: null, waitUntil: null });
    try {
      await pushAll();
      await uploadAll();
      await pullAll();
      await report({ running: false, error: null, waitUntil: null });
    } catch (e) {
      if (e instanceof Stop) {
        await report({
          running: false,
          error: e.reason,
          waitUntil: e.retryInMs ? Date.now() + e.retryInMs : null,
        });
        if (e.retryInMs !== null && !stopped) later(e.retryInMs);
        return;
      }
      const message = e instanceof Error ? e.message : 'Syncing stopped.';
      await report({ running: false, error: message, waitUntil: null });
    }
  }

  /**
   * Syncs now. A call while a run is on makes one more run after it, so a change made mid-run
   * still goes. Resolves when the runs are done.
   */
  function run(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await exclusive(once);
      } while (again && !stopped);
    })().finally(() => (running = null));
    return running;
  }

  return {
    run,
    /** No more runs (signed out, or the device forgot the person). */
    stop() {
      stopped = true;
    },
  };
}
