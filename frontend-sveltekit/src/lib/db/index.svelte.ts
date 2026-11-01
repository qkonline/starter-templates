// The app's offline data (PRD section 11, docs/offline-data.md): import `data` to read and
// write, and `syncState` for what's still to send. Pages never wait for the network: `data`
// writes to IndexedDB at once and the sync sends it when it can.
//
//   const id = data.newId();                       // made here, kept by the backend (Rule 1)
//   await data.put(ME, 'appointments', id, { patient: 'Ali', slot: '10:00' });
//   const list = await data.list(ME, 'appointments');
//   const stop = data.onChange(() => reload());    // after a write here, in another tab, or a pull
//
// A team's shared data: the team's id in place of ME (teams on); `data.follow(teamId)` once so
// its changes are pulled too. Sync runs only when `/features` has it on: the (app) layout starts
// it after sign-in, and it runs on opening the app, coming back online, returning to the tab,
// shortly after each write, and every few minutes.

import { api } from '#lib/api/index.ts';
import { onForget } from '#lib/device.ts';
import { newId } from './ids';
import { ME, openLocal, type Fields, type Local, type Space } from './local';
import { createSync, type Refused } from './sync';

export { ME, newId };
export type { Fields, LocalRecord, Space } from './local';
export type { Refused } from './sync';

export const syncState = $state({
  /** Changes made here the backend hasn't applied yet. */
  pending: 0,
  running: false,
  /** Why the last run stopped short, in plain words; null when it didn't. */
  error: null as string | null,
  /** When the next try is due, after the backend asked to wait or didn't answer (ms). */
  waitUntil: null as number | null,
  /** Changes the backend refused, for the person to see; cleared with `dismissRefused`. */
  refused: [] as Refused[],
});

let opened: Promise<Local> | null = null;
const open = () => (opened ??= openLocal());

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- callbacks, not state anything renders
const listeners = new Set<(space: Space) => void>();
let channel: BroadcastChannel | null = null;

/** Tells this tab's pages and the other tabs' that a space's data changed. */
function changed(space: Space, fromOtherTab = false) {
  for (const fn of listeners) fn(space);
  if (!fromOtherTab) channel?.postMessage({ space });
}

function openChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('starter-data');
  channel.onmessage = (e: MessageEvent<{ space?: Space }>) => {
    if (typeof e.data?.space === 'string') {
      changed(e.data.space, true);
      void countPending();
    }
  };
}

async function countPending() {
  syncState.pending = await (await open()).pendingCount();
}

let asked = false;
/** Asks the browser to keep this data rather than clear it when space runs low (Safari, after 7 days). */
function keepData() {
  if (asked) return;
  asked = true;
  void navigator.storage?.persist?.().catch(() => {});
}

let syncer: ReturnType<typeof createSync> | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;

/** Sync a moment after a write, so a burst of writes goes as one batch. */
function syncSoon() {
  if (!syncer) return;
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => void syncer?.run(), 1500);
}

async function written<T>(space: Space, work: Promise<T>): Promise<T> {
  const out = await work;
  keepData();
  await countPending();
  changed(space);
  syncSoon();
  return out;
}

export const data = {
  newId,

  /** Sets these fields on the record (made if new), here at once; sent when online. */
  put: async (space: Space, table: string, id: string, fields: Fields) =>
    written(space, (await open()).put(space, table, id, fields)),
  /** Deletes it here at once, and on the backend when it syncs. */
  remove: async (space: Space, table: string, id: string) =>
    written(space, (await open()).remove(space, table, id)),
  get: async (space: Space, table: string, id: string) => (await open()).get(space, table, id),
  list: async (space: Space, table: string, opts?: { deleted?: boolean }) =>
    (await open()).list(space, table, opts),

  /** Keeps a file here and uploads it when online; its id, to keep in a record's field. */
  saveFile: async (space: Space, blob: Blob) => {
    const id = await (await open()).saveFile(space, blob);
    keepData();
    syncSoon();
    return id;
  },
  /** A file's bytes: from this device, or fetched (and kept) when it was made elsewhere. */
  async file(space: Space, id: string): Promise<Blob> {
    const local = await open();
    const found = await local.file(space, id);
    if (found) return found.blob;
    const blob = await api.syncFileGet(id, space === ME ? undefined : space);
    await local.keepFile(space, id, blob);
    return blob;
  },

  /** Keep this team's shared data on the device and in step. */
  follow: async (space: Space) => {
    await (await open()).follow(space);
    void syncer?.run();
  },

  /** Run `fn` whenever a space's data changes here, in another tab, or from the backend. */
  onChange(fn: (space: Space) => void): () => void {
    openChannel();
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const dismissRefused = () => (syncState.refused = []);

/** Sync now (the app's own "sync" button, if it has one). */
export const syncNow = () => syncer?.run() ?? Promise.resolve();

let stopListening: (() => void) | null = null;

/** Starts syncing: once, when someone is signed in and `/features` has sync on. */
export function startSync(): void {
  if (syncer || typeof window === 'undefined') return;
  openChannel();
  syncer = createSync(lazyLocal(), api, {
    onState: (s) => {
      syncState.running = s.running;
      syncState.pending = s.pending;
      syncState.error = s.error;
      syncState.waitUntil = s.waitUntil;
    },
    onRefused: (r) => (syncState.refused = [...syncState.refused, ...r]),
    onReceived: (space) => changed(space),
    onLostSpace: (space) => changed(space),
  });
  const run = () => void syncer?.run();
  const visible = () => document.visibilityState === 'visible' && run();
  addEventListener('online', run);
  document.addEventListener('visibilitychange', visible);
  // Others' changes arrive without a push: look every few minutes while the app is open.
  const every = setInterval(run, 5 * 60_000);
  stopListening = () => {
    removeEventListener('online', run);
    document.removeEventListener('visibilitychange', visible);
    clearInterval(every);
  };
  void countPending();
  run();
}

/** A `Local` whose every method opens the database first, so `createSync` can take it before it's open. */
function lazyLocal(): Local {
  return new Proxy({} as Local, {
    get:
      (_, key: keyof Local) =>
      async (...args: unknown[]) => {
        const local = await open();
        return (local[key] as (...a: unknown[]) => unknown)(...args);
      },
  });
}

/**
 * Before signing out: give the outbox a few seconds to go, so what was done here reaches the
 * backend. What's left stays on the device for this person's next sign-in here.
 */
export async function flushBeforeSignOut(ms = 5000): Promise<void> {
  if (!syncer) return;
  await Promise.race([syncer.run(), new Promise((done) => setTimeout(done, ms))]);
}

/** Stops syncing (signed out). */
export function stopSync(): void {
  syncer?.stop();
  syncer = null;
  stopListening?.();
  stopListening = null;
}

// When the device forgets the person (another account signs in, or the account is deleted),
// their data goes with them, unsent changes included.
onForget(async () => {
  stopSync();
  const local = await (opened ?? Promise.resolve(null));
  opened = null;
  if (local) await local.wipe();
  else
    await new Promise<void>((done) => {
      const req = indexedDB.deleteDatabase('starter-data');
      req.onsuccess = req.onerror = req.onblocked = () => done();
    });
  syncState.pending = 0;
  syncState.refused = [];
  changed(ME);
});
