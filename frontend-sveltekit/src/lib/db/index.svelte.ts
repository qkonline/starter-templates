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
// its changes are pulled too. The (app) layout opens the signed-in account's data (`useAccount`)
// and, when `/features` has sync on, starts the sync, which runs on opening the app, coming back
// online, returning to the tab, shortly after each write, and every few minutes.
//
// Each account has its own database on the device (`starter-data-<account>`), so on a shared
// computer one person signing in never wipes another's unsent work. A support tab (PRD R6.3)
// works in a database of its own (`starter-support-<account>`), filled from the backend and
// deleted when the support session ends; the admin's own data is never touched by it.
//
// Signing out deletes the account's database when everything in it has reached the backend; with
// changes still unsent, it stays, and they go the next time that person signs in here.

import { api } from '#lib/api/index.ts';
import { onForget } from '#lib/device.ts';
import { newId } from './ids';
import { ME, openLocal, type Fields, type Local, type RefusedChange, type Space } from './local';
import { createSync } from './sync';

export { ME, newId };
export type { Fields, LocalRecord, RefusedChange, Space } from './local';

export const syncState = $state({
  /** Changes made here the backend hasn't applied yet. */
  pending: 0,
  running: false,
  /** Why the last run stopped short, in plain words; null when it didn't. */
  error: null as string | null,
  /** When the next try is due, after the backend asked to wait or didn't answer (ms). */
  waitUntil: null as number | null,
  /** Changes the backend refused, with what they set, until the person dismisses them. */
  refused: [] as RefusedChange[],
  /** Team spaces the backend turned away this session; their unsent changes are kept. */
  lost: [] as { space: Space; pending: number }[],
  /** Another tab has a newer version of the app: this one must reload to keep using the data. */
  stale: false,
});

const DATA = 'starter-data-';
const SUPPORT = 'starter-support-';

let account: { id: string; support: boolean } | null = null;
let opened: Promise<Local> | null = null;

const dbName = (a: { id: string; support: boolean }) => (a.support ? SUPPORT : DATA) + a.id;

function open(): Promise<Local> {
  if (!account) return Promise.reject(new Error('Sign in first: the data on this device is per account.'));
  if (syncState.stale)
    return Promise.reject(new Error('This app was updated in another tab. Reload to carry on.'));
  opened ??= openLocal(dbName(account), {
    onStale: () => {
      opened = null;
      stopSync();
      syncState.stale = true;
    },
    onClosed: () => (opened = null),
  }).catch((e: unknown) => {
    opened = null;
    throw e;
  });
  return opened;
}

/**
 * Whose data this tab works with: the signed-in account (the (app) layout calls this once it
 * knows), or in a support tab the account it's in. Changing account closes the previous one's.
 */
export async function useAccount(id: string, support = false): Promise<void> {
  if (account?.id === id && account.support === support) return;
  stopSync();
  const previous = opened;
  opened = null;
  if (previous) (await previous.catch(() => null))?.db.close();
  // A support session starts from what the backend has, never from an earlier one's leftovers.
  if (support) await deleteDatabase(dbName({ id, support }));
  account = { id, support };
  channel?.close();
  channel = null;
}

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- callbacks, not state anything renders
const listeners = new Set<(space: Space) => void>();
let channel: BroadcastChannel | null = null;

/** Tells this tab's pages and the other tabs' that a space's data changed. */
function changed(space: Space, fromOtherTab = false) {
  for (const fn of listeners) fn(space);
  if (!fromOtherTab) channel?.postMessage({ space });
}

function openChannel() {
  if (channel || !account || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(dbName(account));
  channel.onmessage = (e: MessageEvent<{ space?: Space }>) => {
    if (typeof e.data?.space === 'string') {
      changed(e.data.space, true);
      void countPending();
      void loadRefused();
    }
  };
}

async function countPending() {
  syncState.pending = await (await open()).pendingCount();
}

async function loadRefused() {
  syncState.refused = await (await open()).refused();
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

  /**
   * Deletes a file here at once, and on the backend when it syncs (by whoever added it, or a
   * team admin). Clear the record fields that point at it with `put`.
   */
  removeFile: async (space: Space, id: string) => {
    await (await open()).removeFile(space, id);
    syncSoon();
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

/** The person has seen these refusals (or, with no ids, all of them). */
export async function dismissRefused(ids?: string[]): Promise<void> {
  await (await open()).dismissRefused(ids);
  await loadRefused();
  channel?.postMessage({ space: ME });
}

/** Try the teams the backend turned away again. */
export const retryLost = () => syncer?.retryLost() ?? Promise.resolve();

/** The person chose to let a turned-away team's data on this device go, unsent changes too. */
export async function discardSpace(space: Space): Promise<void> {
  await syncer?.discardSpace(space);
  syncState.lost = syncState.lost.filter((l) => l.space !== space);
  await countPending();
  changed(space);
}

/** Sync now (the app's own "sync" button, if it has one). */
export const syncNow = () => syncer?.run() ?? Promise.resolve();

let stopListening: (() => void) | null = null;

/** Starts syncing the account given to `useAccount`: once, when `/features` has sync on. */
export function startSync(): void {
  if (syncer || !account || typeof window === 'undefined') return;
  openChannel();
  const name = dbName(account);
  syncer = createSync(lazyLocal(), api, {
    onState: (s) => {
      syncState.running = s.running;
      syncState.pending = s.pending;
      syncState.error = s.error;
      syncState.waitUntil = s.waitUntil;
    },
    onRefused: () => void loadRefused(),
    onReceived: (space) => changed(space),
    onLostSpace: async (space) => {
      const pending = await (await open()).pendingIn(space);
      syncState.lost = [...syncState.lost.filter((l) => l.space !== space), { space, pending }];
    },
    // One tab per account syncs at a time; a support tab has its own database, so its own lock.
    exclusive: (fn) => webLock(`sync:${name}`, fn),
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
  void loadRefused();
  run();
}

function webLock(name: string, fn: () => Promise<void>): Promise<void> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) return fn();
  return locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock) await fn();
  });
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
 * backend. Then the account's data on the device goes if everything reached the backend, and
 * stays (for this person's next sign-in here) if not. Whether anything was left behind.
 */
export async function closeForSignOut(ms = 5000): Promise<{ leftUnsent: boolean }> {
  if (!account) return { leftUnsent: false };
  if (syncer) await Promise.race([syncer.run(), new Promise((done) => setTimeout(done, ms))]);
  stopSync();
  const name = dbName(account);
  const local = await open().catch(() => null);
  const settled = local ? await local.settled().catch(() => false) : true;
  local?.db.close();
  opened = null;
  account = null;
  if (settled) await deleteDatabase(name);
  return { leftUnsent: !settled };
}

/** Stops syncing (signed out). */
export function stopSync(): void {
  syncer?.stop();
  syncer = null;
  stopListening?.();
  stopListening = null;
}

/** The support tab's own copy goes when its session ends. */
export async function closeSupportData(): Promise<void> {
  if (!account?.support) return;
  stopSync();
  const name = dbName(account);
  (await opened?.catch(() => null))?.db.close();
  opened = null;
  account = null;
  await deleteDatabase(name);
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((done) => {
    if (typeof indexedDB === 'undefined') return done();
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => done();
  });
}

/** Whether a database holds anything the backend doesn't have yet. */
async function unsettled(name: string): Promise<boolean> {
  const local = await openLocal(name).catch(() => null);
  if (!local) return false;
  try {
    return !(await local.settled());
  } finally {
    local.db.close();
  }
}

// When the device forgets the previous person: their account deleted, everything of theirs goes.
// Another account signing in: the previous person's data goes only if it has all reached the
// backend; unsent work stays in their own database, sent when they next sign in here.
onForget(async ({ previous, deleted }) => {
  stopSync();
  const mine = account;
  (await opened?.catch(() => null))?.db.close();
  opened = null;
  account = null;
  syncState.pending = 0;
  syncState.refused = [];
  syncState.lost = [];
  const who = deleted ? (mine && !mine.support ? mine.id : previous) : previous;
  if (who) {
    const name = DATA + who;
    if (deleted || !(await unsettled(name))) await deleteDatabase(name);
  }
  changed(ME);
});
