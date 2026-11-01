// One space's synced data (PRD section 11, docs/offline-data.md): the records, the change ids
// already applied, daily counts, and files being uploaded. It runs inside the space's Durable
// Object (space.ts) on its SQLite storage, one request at a time, so nothing here races; it
// knows nothing of Workers, so the unit tests run it on node:sqlite.
//
// - Ids come from the device and are kept. A record is (table, id) within its space.
// - Changes apply in the order sent; each change id once (`applied`), answered the same if sent
//   again. Remembered for 31 days.
// - `put` merges the fields it carries over the record's (later wins per field, by the order the
//   space receives them, never the devices' clocks). Fields the app guards (src/app/sync.ts) are
//   the exception: an edit made on an older version than another device's change to that field
//   is refused with `conflict`, for the person to resolve.
// - `delete` leaves a marker that pulls send with no fields; the last fields are kept here
//   (`kept`) so the record can be restored. A `put` to a marker is refused with `conflict`.
// - Every change gets the next `seq`, the space's own counter: the record's version, and what
//   pulls page by. Each field remembers the seq and session (device) that last set it.
// - Who and which session made and last changed each record is kept (Rule 7).
// - The tables are versioned (`MIGRATIONS`): a later release adds a step, never edits one.

import { noRules, type SyncRules, type SyncWho } from './rules';

/** What the Durable Object's `ctx.storage.sql` gives, and what the tests give in its place. */
export interface Sql {
  exec(query: string, ...bindings: unknown[]): { toArray(): unknown[] };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Most changes in one batch, and most bytes in a batch, or a pull page roughly. */
export const MAX_CHANGES = 100;
export const MAX_BYTES = 256 * 1024;
/** Most bytes a record's fields may be as JSON: under a batch's, so any record fits in one. */
export const MAX_RECORD = 192 * 1024;
/** Records in a pull page when the device doesn't say. */
export const PAGE = 200;
/** Changes a day per person in one space. Each is a few rows written (Workers Free: 100,000 a day app-wide). */
export const CHANGES_PER_DAY = 10_000;
/** How long applied change ids are remembered. */
export const REMEMBER_MS = 31 * DAY;

/** Files: bytes in every part but the last (R2 wants at least 5 MiB, all the same), most a file, most started a day. */
export const PART_SIZE = 8 * 1024 * 1024;
export const MAX_FILE = 1024 ** 3;
export const FILE_BYTES_PER_DAY = 2 * 1024 ** 3;

export type Code = 'invalid_input' | 'forbidden' | 'not_found' | 'conflict' | 'too_large' | 'rate_limited';

/** A refusal, as plain data: it crosses from the Durable Object to the Worker. */
export interface Refused {
  ok: false;
  status: 400 | 403 | 404 | 409 | 413 | 429;
  code: Code;
  message: string;
  retryAfter?: number;
}
export type Outcome<T> = { ok: true; value: T } | Refused;

export const refuse = (status: Refused['status'], code: Code, message: string, retryAfter?: number): Refused => ({
  ok: false,
  status,
  code,
  message,
  ...(retryAfter ? { retryAfter } : {}),
});
const gone = () => refuse(404, 'not_found', 'This data has been deleted.');
const unreadable = () => refuse(400, 'invalid_input', "Those changes couldn't be read. Update the app and try again.");

export interface Change {
  id: string;
  table: string;
  record: string;
  op: 'put' | 'delete';
  fields?: Record<string, unknown>;
  at: string;
  /** The record's version the device had when the change was made. */
  base?: number;
}

export interface Result {
  id: string;
  status: 'applied' | 'refused';
  code?: Code;
  message?: string;
}

export interface RecordView {
  table: string;
  id: string;
  version: string;
  fields: Record<string, unknown>;
  deleted: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  changedAt: string;
}

export interface FileRow {
  id: string;
  type: string;
  size: number;
  upload_id: string;
  complete: number;
  created_by: string;
  created: number;
  /** Deleted: its bytes are gone and its id isn't used again. */
  deleted: number;
}

export const isSyncId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
const isTable = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(v);
const isField = (k: string) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const isTime = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isMediaType = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 100 && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(v);

/** A push body as the contract has it, or null when any of it doesn't fit. */
export function readChanges(text: string): Change[] | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(body) || Object.keys(body).some((k) => k !== 'changes')) return null;
  const list = body.changes;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_CHANGES) return null;
  const out: Change[] = [];
  for (const c of list) {
    if (!isObject(c)) return null;
    if (Object.keys(c).some((k) => !['id', 'table', 'record', 'op', 'fields', 'at', 'base'].includes(k))) return null;
    if (!isSyncId(c.id) || !isTable(c.table) || !isSyncId(c.record) || !isTime(c.at)) return null;
    if (c.base !== undefined && !(typeof c.base === 'string' && /^\d{1,15}$/.test(c.base))) return null;
    const base = c.base === undefined ? {} : { base: Number(c.base) };
    if (c.op === 'put') {
      const fields = c.fields ?? {};
      if (!isObject(fields)) return null;
      const keys = Object.keys(fields);
      if (keys.length > 200 || !keys.every(isField)) return null;
      out.push({ id: c.id, table: c.table, record: c.record, op: 'put', fields, at: c.at, ...base });
    } else if (c.op === 'delete') {
      if (c.fields !== undefined) return null;
      out.push({ id: c.id, table: c.table, record: c.record, op: 'delete', at: c.at, ...base });
    } else return null;
  }
  return out;
}

/** Seconds until the next UTC midnight, when the daily counts start again. */
export const toMidnight = (now: number) => Math.max(1, Math.ceil((DAY - (now % DAY)) / 1000));

/**
 * The tables, as steps: step n takes a space from version n to n+1, and runs once, in a
 * transaction, the first time a space's object starts after the release that added it. A
 * later release adds steps at the end; it never edits or removes one, since spaces already
 * past it would never see the change.
 */
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS records (
      tbl TEXT NOT NULL,
      id TEXT NOT NULL,
      fields TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL,
      created_by TEXT,
      updated_by TEXT,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      changed_at TEXT NOT NULL,
      PRIMARY KEY (tbl, id)
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS records_seq ON records (seq)`,
    `CREATE TABLE IF NOT EXISTS applied (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      code TEXT,
      message TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS applied_at ON applied (at)`,
    `CREATE TABLE IF NOT EXISTS usage (
      key TEXT PRIMARY KEY,
      day INTEGER NOT NULL,
      count INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      upload_id TEXT NOT NULL,
      complete INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created INTEGER NOT NULL
    )`,
  ],
  [
    "ALTER TABLE records ADD COLUMN versions TEXT NOT NULL DEFAULT '{}'",
    'ALTER TABLE records ADD COLUMN first INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE records ADD COLUMN kept TEXT',
    'ALTER TABLE records ADD COLUMN created_session TEXT',
    'ALTER TABLE records ADD COLUMN updated_session TEXT',
  ],
  ['ALTER TABLE files ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'],
];

interface RecordRow {
  tbl: string;
  id: string;
  fields: string;
  deleted: number;
  seq: number;
  created_by: string | null;
  updated_by: string | null;
  created: number;
  updated: number;
  changed_at: string;
  /** Per field: [the seq that last set it, the session it came through]. */
  versions: string;
  /** The seq it was made at. */
  first: number;
  /** A deleted record's last fields. */
  kept: string | null;
  created_session: string | null;
  updated_session: string | null;
}

type Versions = Record<string, [number, string | null]>;

const iso = (ms: number) => new Date(ms).toISOString();

const view = (r: RecordRow): RecordView => ({
  table: r.tbl,
  id: r.id,
  version: String(r.seq),
  fields: JSON.parse(r.fields) as Record<string, unknown>,
  deleted: !!r.deleted,
  createdBy: r.created_by,
  updatedBy: r.updated_by,
  createdAt: iso(r.created),
  updatedAt: iso(r.updated),
  changedAt: r.changed_at,
});

export class SpaceStore {
  private lastSweep = 0;

  constructor(
    private readonly sql: Sql,
    /** Runs `fn` as one transaction: all of it or none. */
    private readonly transaction: <T>(fn: () => T) => T,
    private readonly rules: SyncRules = noRules,
  ) {
    this.init();
  }

  /** Brings the tables up to date (or makes them, again after `deleteAll`). */
  init(): void {
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const at = Number(this.meta('schema') ?? 0);
    if (at > MIGRATIONS.length) throw new Error(`This space's data is from a newer release (version ${at}); deploy that release or later.`);
    if (at === MIGRATIONS.length) return;
    this.transaction(() => {
      for (const step of MIGRATIONS.slice(at)) for (const statement of step) this.sql.exec(statement);
      this.setMeta('schema', String(MIGRATIONS.length));
    });
  }

  private meta(key: string): string | null {
    return this.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
  }

  /** Whether the space was deleted: kept as a mark after its data goes, so nothing late writes it again. */
  get isGone(): boolean {
    return this.meta('gone') === '1';
  }

  markGone(): void {
    this.setMeta('gone', '1');
  }

  private rows<T>(query: string, ...bindings: unknown[]): T[] {
    return this.sql.exec(query, ...bindings).toArray() as T[];
  }

  private first<T>(query: string, ...bindings: unknown[]): T | null {
    return this.rows<T>(query, ...bindings)[0] ?? null;
  }

  /**
   * Counts `amount` against `key`'s daily `max`; false (and nothing counted) when it would go
   * over. Days are UTC.
   */
  private countDay(key: string, amount: number, max: number, now: number): boolean {
    const day = Math.floor(now / DAY);
    const row = this.first<{ day: number; count: number }>('SELECT day, count FROM usage WHERE key = ?', key);
    const used = row && row.day === day ? row.count : 0;
    if (used + amount > max) return false;
    this.sql.exec(
      'INSERT INTO usage (key, day, count) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET day = excluded.day, count = excluded.count',
      key,
      day,
      used + amount,
    );
    return true;
  }

  /** Applies a batch from `who`, in order, as one transaction. `applied` is what went in, for `afterApply`. */
  push(who: SyncWho, text: string, now = Date.now()): Outcome<{ results: Result[]; applied: Change[] }> {
    if (this.isGone) return gone();
    const changes = readChanges(text);
    if (!changes) return unreadable();
    const user = who.user;
    return this.transaction(() => {
      if (now - this.lastSweep > HOUR) {
        this.sql.exec('DELETE FROM applied WHERE at < ?', now - REMEMBER_MS);
        this.lastSweep = now;
      }
      const ids = changes.map((c) => c.id);
      const seen = new Map(
        this.rows<{ id: string; code: Code | null; message: string | null }>(
          `SELECT id, code, message FROM applied WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        ).map((r) => [r.id, r]),
      );
      const fresh = changes.filter((c) => !seen.has(c.id)).length;
      if (fresh && !this.countDay(`changes:${user}`, fresh, CHANGES_PER_DAY, now))
        return refuse(429, 'rate_limited', "You've made as many changes as can be kept today. They'll be sent tomorrow.", toMidnight(now));

      let seq = this.first<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM records')?.seq ?? 0;
      const results: Result[] = [];
      const applied: Change[] = [];
      for (const c of changes) {
        const before = seen.get(c.id);
        if (before) {
          results.push(before.code ? { id: c.id, status: 'refused', code: before.code, message: before.message ?? '' } : { id: c.id, status: 'applied' });
          continue;
        }
        // The same change id twice in one batch: once.
        seen.set(c.id, { id: c.id, code: null, message: null });
        const refusal = this.apply(c, who, ++seq, now);
        if (refusal) {
          seq--;
          seen.set(c.id, { id: c.id, code: refusal.code, message: refusal.message });
          this.sql.exec('INSERT INTO applied (id, at, code, message) VALUES (?, ?, ?, ?)', c.id, now, refusal.code, refusal.message);
          results.push({ id: c.id, status: 'refused', code: refusal.code, message: refusal.message });
        } else {
          this.sql.exec('INSERT INTO applied (id, at) VALUES (?, ?)', c.id, now);
          results.push({ id: c.id, status: 'applied' });
          applied.push(c);
        }
      }
      return { ok: true as const, value: { results, applied } };
    });
  }

  /** One change; a refusal, or nothing when it was applied. */
  private apply(c: Change, who: SyncWho, seq: number, now: number): { code: Code; message: string } | null {
    if (who.role === 'viewer') return { code: 'forbidden', message: "You can see this team's data but not change it. Ask a team admin." };
    const rules = this.rules.tables[c.table];
    if (!rules && this.rules.onlyListed) return { code: 'invalid_input', message: 'This app has no such kind of record. Update the app.' };
    const row = this.first<RecordRow>('SELECT * FROM records WHERE tbl = ? AND id = ?', c.table, c.record);
    const current = row ? { fields: JSON.parse(row.fields) as Record<string, unknown>, deleted: !!row.deleted } : null;
    if (c.op === 'put' && current?.deleted) return { code: 'conflict', message: 'This was deleted on another device, so the change wasn’t kept.' };

    if (c.op === 'put' && row && rules?.guard) {
      // An edit made on a version older than another device's change to a guarded field.
      const base = c.base ?? row.first;
      const versions = JSON.parse(row.versions) as Versions;
      const clash = Object.keys(c.fields ?? {}).filter((f) => {
        const v = versions[f];
        return (rules.guard === '*' || rules.guard!.includes(f)) && v && v[0] > base && v[1] !== who.session;
      });
      if (clash.length)
        return {
          code: 'conflict',
          message: `Someone else changed ${clash.join(', ')} after you last had this record, so your change wasn’t applied. Compare the two and enter it again if it’s still right.`,
        };
    }

    const refused = rules?.check?.(c, current, who);
    if (refused) return refused;

    if (c.op === 'delete') {
      if (row) {
        if (row.deleted) return null;
        this.sql.exec(
          "UPDATE records SET kept = fields, fields = '{}', deleted = 1, seq = ?, updated_by = ?, updated_session = ?, updated = ?, changed_at = ? WHERE tbl = ? AND id = ?",
          seq,
          who.user,
          who.session,
          now,
          c.at,
          c.table,
          c.record,
        );
      }
      // Deleted before it ever arrived (made and deleted elsewhere): the marker, so a late edit is refused.
      else
        this.sql.exec(
          "INSERT INTO records (tbl, id, fields, deleted, seq, first, created_by, updated_by, created_session, updated_session, created, updated, changed_at) VALUES (?, ?, '{}', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          c.table,
          c.record,
          seq,
          seq,
          who.user,
          who.user,
          who.session,
          who.session,
          now,
          now,
          c.at,
        );
      return null;
    }
    const fields = JSON.stringify({ ...current?.fields, ...c.fields });
    if (new TextEncoder().encode(fields).length > MAX_RECORD)
      return { code: 'too_large', message: 'This record would be over 192 KB, so the change wasn’t kept. Keep large things as files.' };
    const versions = row ? (JSON.parse(row.versions) as Versions) : {};
    for (const f of Object.keys(c.fields ?? {})) versions[f] = [seq, who.session];
    if (row)
      this.sql.exec(
        'UPDATE records SET fields = ?, versions = ?, seq = ?, updated_by = ?, updated_session = ?, updated = ?, changed_at = ? WHERE tbl = ? AND id = ?',
        fields,
        JSON.stringify(versions),
        seq,
        who.user,
        who.session,
        now,
        c.at,
        c.table,
        c.record,
      );
    else
      this.sql.exec(
        'INSERT INTO records (tbl, id, fields, versions, deleted, seq, first, created_by, updated_by, created_session, updated_session, created, updated, changed_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        c.table,
        c.record,
        fields,
        JSON.stringify(versions),
        seq,
        seq,
        who.user,
        who.user,
        who.session,
        who.session,
        now,
        now,
        c.at,
      );
    return null;
  }

  /** The records changed after `since`, oldest change first, up to `limit` or about 256 KB. */
  pull(since: number, limit = PAGE): { records: RecordView[]; next: string; more: boolean } {
    const rows = this.rows<RecordRow>('SELECT * FROM records WHERE seq > ? ORDER BY seq LIMIT ?', since, limit + 1);
    const records: RecordView[] = [];
    let bytes = 0;
    let next = since;
    for (const r of rows.slice(0, limit)) {
      bytes += r.fields.length + 200;
      // Always at least one, so a page never stalls on a large record.
      if (records.length && bytes > MAX_BYTES) break;
      records.push(view(r));
      next = r.seq;
    }
    return { records, next: String(next), more: rows.length > records.length };
  }

  file(id: string): FileRow | null {
    return this.first<FileRow>('SELECT * FROM files WHERE id = ?', id);
  }

  /**
   * Before an upload starts: the file if it's already there (the same size and type), a refusal,
   * or null to go ahead (its bytes counted against the day).
   */
  fileCheck(user: string, f: { id: string; type: string; size: number }, now = Date.now()): Outcome<FileRow | null> {
    const found = this.file(f.id);
    if (found) {
      if (found.deleted) return refuse(409, 'conflict', 'That file was deleted. A new file needs a new id.');
      if (found.size !== f.size || found.type !== f.type)
        return refuse(409, 'conflict', 'A different file was already started with this id.');
      return { ok: true, value: found };
    }
    if (!this.countDay(`bytes:${user}`, f.size, FILE_BYTES_PER_DAY, now))
      return refuse(429, 'rate_limited', "You've uploaded as much as you can today. The rest will go tomorrow.", toMidnight(now));
    return { ok: true, value: null };
  }

  fileStarted(user: string, f: { id: string; type: string; size: number }, uploadId: string, now = Date.now()): FileRow {
    this.sql.exec(
      'INSERT INTO files (id, type, size, upload_id, complete, created_by, created) VALUES (?, ?, ?, ?, 0, ?, ?)',
      f.id,
      f.type,
      f.size,
      uploadId,
      user,
      now,
    );
    return this.file(f.id)!;
  }

  fileRestarted(id: string, uploadId: string): void {
    this.sql.exec('UPDATE files SET upload_id = ? WHERE id = ?', uploadId, id);
  }

  fileDeleted(id: string): void {
    this.sql.exec('UPDATE files SET deleted = 1 WHERE id = ?', id);
  }

  fileCompleted(id: string): void {
    this.sql.exec('UPDATE files SET complete = 1 WHERE id = ?', id);
  }

  /** Files whose upload never finished, to abort when the space is wiped. */
  unfinished(): FileRow[] {
    return this.rows<FileRow>('SELECT * FROM files WHERE complete = 0 AND deleted = 0');
  }
}

/** How many parts a file of `size` has. */
export const partsOf = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE));

/** The bytes part `n` must have, or null when the file has no such part. */
export function partLength(size: number, n: number): number | null {
  const count = partsOf(size);
  if (!Number.isInteger(n) || n < 1 || n > count) return null;
  return n < count ? PART_SIZE : size - PART_SIZE * (count - 1);
}

export const fileView = (f: FileRow) => ({ id: f.id, type: f.type, size: f.size, partSize: PART_SIZE, complete: !!f.complete });
