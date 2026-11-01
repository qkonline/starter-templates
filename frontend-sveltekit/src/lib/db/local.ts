// The app's data on this device, in IndexedDB (through `idb`), for apps that work offline (PRD
// section 11, docs/offline-data.md). Pages read and write here and never wait for the network;
// every write also goes into the outbox, which #lib/db/sync.ts sends when there's a connection.
//
// A record keeps two copies of its fields: `base`, what the backend last said, and `fields`, what
// the person sees: `base` with this device's unsent changes on top, merged per field, later wins
// (as the backend merges). When the backend applies a change it's folded into `base`; when it
// refuses one, the change is dropped and `fields` worked out again, so nothing refused lingers.
//
// Data lives in a space: 'me' (the person's own) or a team's id (teams on).

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { newId, isSyncId } from './ids';

export type Fields = Record<string, unknown>;
/** 'me', or the id of a team whose shared data this is. */
export type Space = string;
export const ME: Space = 'me';

export interface LocalRecord {
  space: Space;
  table: string;
  id: string;
  /** What the person sees: `base` and the unsent changes. */
  fields: Fields;
  deleted: boolean;
  /** What the backend last said (empty for a record it hasn't seen). */
  base: Fields;
  baseDeleted: boolean;
  /** Changes made here not yet applied by the backend. */
  pending: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OutboxEntry {
  seq?: number;
  space: Space;
  change: {
    id: string;
    table: string;
    record: string;
    op: 'put' | 'delete';
    fields?: Fields;
    at: string;
  };
}

export interface LocalFile {
  space: Space;
  id: string;
  type: string;
  size: number;
  blob: Blob;
  /** Parts the backend has, with their etags, while uploading. */
  parts: { number: number; etag: string }[];
  /** On the backend, complete. */
  uploaded: boolean;
}

/** A record the backend sent (the contract's SyncRecord). */
export interface ServerRecord {
  table: string;
  id: string;
  fields: Fields;
  deleted: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Schema extends DBSchema {
  records: { key: [string, string, string]; value: LocalRecord; indexes: { byTable: [string, string] } };
  outbox: {
    key: number;
    value: OutboxEntry;
    indexes: { bySpace: [string, number]; byRecord: [string, string, string] };
  };
  meta: { key: string; value: unknown };
  files: { key: [string, string]; value: LocalFile; indexes: { waiting: string } };
}

/** Most a record may be as JSON: the backend refuses more (256 KB). Larger things are files. */
export const MAX_RECORD = 256 * 1024;
const TABLE = /^[a-z][a-z0-9_]{0,39}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Most a file may be (the backend's limit). */
export const MAX_FILE = 1024 ** 3;

/** A blob's type as the contract takes it (`text/plain;charset=utf-8` is `text/plain`). */
export function mediaType(type: string): string {
  const t = type.split(';')[0]!.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(t) && t.length <= 100
    ? t
    : 'application/octet-stream';
}

const merge = (base: Fields, fields: Fields | undefined) => ({ ...base, ...fields });
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** `base` with the unsent changes for it applied in order. */
function view(base: Fields, baseDeleted: boolean, changes: OutboxEntry['change'][]) {
  let fields = base;
  let deleted = baseDeleted;
  for (const c of changes)
    if (c.op === 'delete') {
      fields = {};
      deleted = true;
    } else if (!deleted) fields = merge(fields, c.fields);
  return { fields, deleted };
}

export type Local = Awaited<ReturnType<typeof openLocal>>;

/** Opens (or makes) the database. `name` differs only in tests. */
export async function openLocal(name = 'starter-data') {
  const db: IDBPDatabase<Schema> = await openDB<Schema>(name, 1, {
    upgrade(d) {
      d.createObjectStore('records', { keyPath: ['space', 'table', 'id'] }).createIndex('byTable', [
        'space',
        'table',
      ]);
      const outbox = d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      outbox.createIndex('bySpace', ['space', 'seq']);
      outbox.createIndex('byRecord', ['space', 'change.table', 'change.record']);
      d.createObjectStore('meta');
      // `waiting` is set only on files still to upload, so the index lists just those.
      d.createObjectStore('files', { keyPath: ['space', 'id'] }).createIndex('waiting', 'waiting');
    },
    blocking() {
      // A newer version of the app wants to upgrade the database: let it.
      db.close();
    },
  });

  /** Writes a change: the record as the person now sees it, and the outbox entry. */
  async function write(space: Space, table: string, id: string, op: 'put' | 'delete', fields?: Fields) {
    if (!TABLE.test(table))
      throw new Error(`"${table}" can't be a table name: lower case letters, digits and _.`);
    if (!isSyncId(id)) throw new Error('Record ids are made with newId().');
    if (fields)
      for (const k of Object.keys(fields))
        if (!FIELD.test(k)) throw new Error(`"${k}" can't be a field name.`);
    const tx = db.transaction(['records', 'outbox'], 'readwrite');
    const records = tx.objectStore('records');
    const now = new Date().toISOString();
    const found = await records.get([space, table, id]);
    if (op === 'put' && found?.deleted) throw new Error('That was deleted, so it can’t be changed.');
    const change: OutboxEntry['change'] = { id: newId(), table, record: id, op, at: now };
    if (op === 'put') change.fields = fields ?? {};
    const next = view(found?.fields ?? {}, found?.deleted ?? false, [change]);
    if (bytes(next.fields) > MAX_RECORD)
      throw new Error('That’s too much for one record. Keep large things as files.');
    const record: LocalRecord = {
      space,
      table,
      id,
      base: found?.base ?? {},
      baseDeleted: found?.baseDeleted ?? false,
      createdBy: found?.createdBy ?? null,
      updatedBy: found?.updatedBy ?? null,
      createdAt: found?.createdAt ?? null,
      updatedAt: found?.updatedAt ?? null,
      ...next,
      pending: (found?.pending ?? 0) + 1,
    };
    await Promise.all([records.put(record), tx.objectStore('outbox').add({ space, change }), tx.done]);
    return record;
  }

  /** Works a record out again from its base and the changes still in the outbox. */
  async function refresh(
    tx: IDBPTransaction<Schema, ['records', 'outbox'], 'readwrite'>,
    space: Space,
    table: string,
    id: string,
    base: Pick<LocalRecord, 'base' | 'baseDeleted'> & Partial<LocalRecord>,
  ) {
    const changes = (await tx.objectStore('outbox').index('byRecord').getAll([space, table, id])).map(
      (e) => e.change,
    );
    const found = await tx.objectStore('records').get([space, table, id]);
    const record: LocalRecord = {
      space,
      table,
      id,
      createdBy: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
      ...found,
      ...base,
      ...view(base.base, base.baseDeleted, changes),
      pending: changes.length,
    };
    // A record that only ever existed here, whose every change was refused, goes.
    if (!changes.length && !record.updatedAt && !Object.keys(record.base).length && !record.baseDeleted)
      await tx.objectStore('records').delete([space, table, id]);
    else await tx.objectStore('records').put(record);
  }

  return {
    db,
    newId,

    /** Sets these fields (making the record if new; `id` from newId()). The record as now. */
    put: (space: Space, table: string, id: string, fields: Fields) => write(space, table, id, 'put', fields),
    /** Marks it deleted, here at once and on the backend when it syncs. */
    remove: (space: Space, table: string, id: string) => write(space, table, id, 'delete'),

    get: (space: Space, table: string, id: string) => db.get('records', [space, table, id]),
    /** Every record of a table, deleted ones left out unless asked for. */
    async list(space: Space, table: string, opts: { deleted?: boolean } = {}) {
      const all = await db.getAllFromIndex('records', 'byTable', [space, table]);
      return opts.deleted ? all : all.filter((r) => !r.deleted);
    },

    /** Changes not yet applied by the backend. */
    pendingCount: () => db.count('outbox'),

    /** The oldest unsent changes of one space, in order: a batch of at most `max` and about `maxBytes`. */
    async batch(max: number, maxBytes: number): Promise<{ space: Space; entries: OutboxEntry[] } | null> {
      const first = await db.transaction('outbox').store.openCursor();
      if (!first) return null;
      const space = first.value.space;
      const entries: OutboxEntry[] = [];
      let size = 0;
      let cursor = await db
        .transaction('outbox')
        .store.index('bySpace')
        .openCursor(IDBKeyRange.bound([space, 0], [space, Infinity]));
      while (cursor && entries.length < max) {
        size += bytes(cursor.value.change);
        if (entries.length && size > maxBytes) break;
        entries.push(cursor.value);
        cursor = await cursor.continue();
      }
      return { space, entries };
    },

    /** The backend's answer to a batch: applied changes fold into the base, refused ones are dropped. */
    async settle(space: Space, results: { entry: OutboxEntry; applied: boolean }[]) {
      const tx = db.transaction(['records', 'outbox'], 'readwrite');
      const touched = new Map<string, { table: string; id: string }>();
      for (const { entry, applied } of results) {
        await tx.objectStore('outbox').delete(entry.seq!);
        const { table, record: id } = entry.change;
        if (applied) {
          const found = await tx.objectStore('records').get([space, table, id]);
          if (found) {
            const folded = view(found.base, found.baseDeleted, [entry.change]);
            await tx
              .objectStore('records')
              .put({ ...found, base: folded.fields, baseDeleted: folded.deleted });
          }
        }
        touched.set(`${table}\n${id}`, { table, id });
      }
      for (const { table, id } of touched.values()) {
        const found = await tx.objectStore('records').get([space, table, id]);
        if (found) await refresh(tx, space, table, id, found);
      }
      await tx.done;
    },

    /** Records from the backend: each becomes the base, with this device's unsent changes on top. */
    async receive(space: Space, records: ServerRecord[]) {
      const tx = db.transaction(['records', 'outbox'], 'readwrite');
      for (const r of records)
        await refresh(tx, space, r.table, r.id, {
          base: r.fields,
          baseDeleted: r.deleted,
          createdBy: r.createdBy,
          updatedBy: r.updatedBy,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      await tx.done;
    },

    /** Where pulling a space last stopped. */
    cursor: async (space: Space) => ((await db.get('meta', `cursor:${space}`)) as string | undefined) ?? null,
    setCursor: (space: Space, next: string) => db.put('meta', next, `cursor:${space}`),

    /** The team spaces this device keeps (the app calls `follow` when it opens one). */
    followed: async () => ((await db.get('meta', 'spaces')) as Space[] | undefined) ?? [],
    async follow(space: Space) {
      if (space === ME) return;
      const list = ((await db.get('meta', 'spaces')) as Space[] | undefined) ?? [];
      if (!list.includes(space)) await db.put('meta', [...list, space], 'spaces');
    },

    /** Everything of a space this device kept (the person left the team, or it was deleted). */
    async dropSpace(space: Space) {
      const tx = db.transaction(['records', 'outbox', 'meta', 'files'], 'readwrite');
      const range = IDBKeyRange.bound([space], [space, []]);
      await tx.objectStore('records').delete(range);
      await tx.objectStore('files').delete(range);
      for await (const c of tx
        .objectStore('outbox')
        .index('bySpace')
        .iterate(IDBKeyRange.bound([space, 0], [space, Infinity])))
        await c.delete();
      await tx.objectStore('meta').delete(`cursor:${space}`);
      const list = ((await tx.objectStore('meta').get('spaces')) as Space[] | undefined) ?? [];
      await tx.objectStore('meta').put(
        list.filter((s) => s !== space),
        'spaces',
      );
      await tx.done;
    },

    /** Keeps a file here and queues it for upload; its id, for a record's field. */
    async saveFile(space: Space, blob: Blob, id = newId()): Promise<string> {
      if (!blob.size) throw new Error('That file is empty.');
      if (blob.size > MAX_FILE) throw new Error('Files can be at most 1 GB.');
      await db.put('files', {
        space,
        id,
        type: mediaType(blob.type),
        size: blob.size,
        blob,
        parts: [],
        uploaded: false,
        waiting: '1',
      } as LocalFile);
      return id;
    },
    file: (space: Space, id: string) => db.get('files', [space, id]),
    /** A file fetched from the backend, kept for next time. */
    keepFile: (space: Space, id: string, blob: Blob) =>
      db.put('files', { space, id, type: blob.type, size: blob.size, blob, parts: [], uploaded: true }),
    /** Files still to upload, oldest first. */
    waitingFiles: () => db.getAllFromIndex('files', 'waiting'),
    async updateFile(f: LocalFile) {
      // Only files still to upload carry `waiting`, so the index lists just those.
      const rest = { ...f } as LocalFile & { waiting?: string };
      delete rest.waiting;
      await db.put('files', f.uploaded ? rest : ({ ...rest, waiting: '1' } as LocalFile));
    },

    /** Everything, when the device forgets the person. */
    async wipe() {
      db.close();
      await new Promise<void>((done) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = () => done();
      });
    },
  };
}
