import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { refusal, type SyncRules, type SyncWho } from './rules';
import { CHANGES_PER_DAY, DAY, partLength, partsOf, PART_SIZE, readChanges, REMEMBER_MS, SpaceStore, type Sql } from './store';

/** The store on node:sqlite, shaped like a Durable Object's `ctx.storage.sql`. */
function fakeStore(rules?: SyncRules, db = new DatabaseSync(':memory:')) {
  const sql: Sql = {
    exec(query, ...bindings) {
      const st = db.prepare(query);
      const rows = st.columns().length ? st.all(...(bindings as never[])).map((r) => ({ ...r })) : (st.run(...(bindings as never[])), []);
      return { toArray: () => rows };
    },
  };
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return new SpaceStore(sql, transaction, rules);
}

/** Someone sending from one device: their session is `<user>-1` unless said. */
const who = (user: string, session = `${user}-1`, role: SyncWho['role'] = null): SyncWho => ({ user, session, role, space: 'team:t' });

let n = 0;
const uid = () => `id-${String(++n).padStart(16, '0')}`;
const AT = '2026-11-01T10:00:00.000Z';
const put = (record: string, fields: Record<string, unknown>, id = uid()) => ({ id, table: 'notes', record, op: 'put' as const, fields, at: AT });
const del = (record: string, id = uid()) => ({ id, table: 'notes', record, op: 'delete' as const, at: AT });
const body = (...changes: unknown[]) => JSON.stringify({ changes });

function pushed(store: SpaceStore, user: string | SyncWho, changes: unknown[], now?: number) {
  const out = store.push(typeof user === 'string' ? who(user) : user, body(...changes), now);
  if (!out.ok) throw new Error(out.message);
  return out.value.results;
}

describe('reading a batch', () => {
  test('takes what the contract allows and nothing else', () => {
    const r = uid();
    expect(readChanges(body(put(r, { a: 1 }), del(r)))).toHaveLength(2);
    expect(readChanges(body({ ...put(r, {}), fields: undefined }))).toEqual([expect.objectContaining({ fields: {} })]);
    for (const bad of [
      'not json',
      '[]',
      JSON.stringify({ changes: [] }),
      JSON.stringify({ changes: [put(r, {})], more: 1 }),
      body({ ...put(r, {}), id: 'short' }),
      body({ ...put(r, {}), table: 'Notes' }),
      body({ ...put(r, {}), op: 'patch' }),
      body({ ...put(r, {}), at: '2026-13-01' }),
      body({ ...put(r, {}), fields: [] }),
      body({ ...put(r, {}), fields: { '1st': 1 } }),
      body({ ...del(r), fields: {} }),
      body({ ...put(r, {}), extra: true }),
      body(...Array.from({ length: 101 }, () => put(r, {}))),
    ])
      expect(readChanges(bad), bad.slice(0, 80)).toBeNull();
  });
});

describe('pushing', () => {
  test('ids are kept, fields merge, the later one wins', () => {
    const s = fakeStore();
    const r = uid();
    pushed(s, 'a', [put(r, { patient: 'Ali', slot: '10:00' })]);
    pushed(s, 'b', [put(r, { note: 'scans' })]);
    pushed(s, 'a', [put(r, { slot: '11:00' }), put(r, { slot: '12:00' })]);
    const [rec] = s.pull(0).records;
    expect(rec).toMatchObject({ id: r, fields: { patient: 'Ali', slot: '12:00', note: 'scans' }, createdBy: 'a', updatedBy: 'a', changedAt: AT });
  });

  test('a change sent again is answered the same and not applied again', () => {
    const s = fakeStore();
    const r = uid();
    const first = put(r, { v: 1 });
    pushed(s, 'a', [first]);
    pushed(s, 'a', [put(r, { v: 2 })]);
    expect(pushed(s, 'a', [first, first])).toEqual([
      { id: first.id, status: 'applied' },
      { id: first.id, status: 'applied' },
    ]);
    expect(s.pull(0).records[0]!.fields).toEqual({ v: 2 });
    // A refusal is remembered as one too.
    pushed(s, 'a', [del(r)]);
    const late = put(r, { v: 3 });
    expect(pushed(s, 'a', [late])[0]).toMatchObject({ status: 'refused', code: 'conflict' });
    expect(pushed(s, 'a', [late])[0]).toMatchObject({ status: 'refused', code: 'conflict' });
  });

  test('a delete before the record ever arrived still leaves a marker', () => {
    const s = fakeStore();
    const r = uid();
    pushed(s, 'a', [del(r)]);
    expect(s.pull(0).records).toEqual([expect.objectContaining({ id: r, deleted: true, fields: {} })]);
    expect(pushed(s, 'b', [put(r, { x: 1 })])[0]!.status).toBe('refused');
  });

  test('a record past 192 KB is refused; the batch goes on', () => {
    const s = fakeStore();
    const r = uid();
    const ok = uid();
    pushed(s, 'a', [put(r, { a: 'x'.repeat(150_000) })]);
    const results = pushed(s, 'a', [put(r, { b: 'y'.repeat(70_000) }), put(ok, {})]);
    expect(results.map((x) => x.code ?? x.status)).toEqual(['too_large', 'applied']);
  });

  test('the daily limit refuses the whole batch, and counts only new changes', () => {
    const s = fakeStore();
    const now = Date.UTC(2026, 10, 1, 12);
    const r = uid();
    const batch = Array.from({ length: 100 }, () => put(r, { v: 1 }));
    for (let i = 0; i < CHANGES_PER_DAY / 100; i++)
      pushed(
        s,
        'a',
        batch.map((c) => ({ ...c, id: uid() })),
        now,
      );
    const over = s.push(who('a'), body(put(r, { v: 2 })), now);
    expect(over).toMatchObject({ ok: false, status: 429, code: 'rate_limited', retryAfter: 12 * 3600 });
    // Someone else, and the next day, are fine.
    expect(s.push(who('b'), body(put(r, { v: 3 })), now).ok).toBe(true);
    expect(s.push(who('a'), body(put(r, { v: 4 })), now + DAY).ok).toBe(true);
  });

  test('applied ids are forgotten after a month', () => {
    const s = fakeStore();
    const now = Date.UTC(2026, 10, 1);
    const first = put(uid(), { v: 1 });
    pushed(s, 'a', [first], now);
    const later = now + REMEMBER_MS + DAY;
    pushed(s, 'a', [put(uid(), {})], later);
    // Forgotten: sent again it's a new change (the record gets a later seq).
    const before = s.pull(0).next;
    pushed(s, 'a', [first], later);
    expect(Number(s.pull(0).next)).toBeGreaterThan(Number(before));
  });
});

describe("the app's rules", () => {
  const rules: SyncRules = {
    onlyListed: true,
    tables: {
      notes: {},
      doses: {
        guard: ['mg'],
        check: (c, current, w) => {
          if (c.op === 'delete' && w.role !== 'admin') return refusal('forbidden', 'Only an admin can delete a dose.');
          if (c.op === 'put' && !current && typeof c.fields?.mg !== 'number') return refusal('invalid_input', 'A dose needs mg.');
          return null;
        },
      },
    },
  };
  const dose = (record: string, fields: Record<string, unknown>, base?: string) => ({ ...put(record, fields), table: 'doses', ...(base ? { base } : {}) });

  test('a stale edit to a guarded field is refused; other fields still merge, later wins', () => {
    const s = fakeStore(rules);
    const r = uid();
    pushed(s, 'a', [dose(r, { mg: 5, note: '' })]);
    const v1 = s.pull(0).records[0]!.version;
    // Two devices both had v1. B changes the dose first; A's change of the dose, made on v1, is stale.
    expect(pushed(s, who('b'), [dose(r, { mg: 10 }, v1)])[0]!.status).toBe('applied');
    expect(pushed(s, who('a'), [dose(r, { mg: 7 }, v1)])[0]).toMatchObject({ status: 'refused', code: 'conflict' });
    // A field that isn't guarded, from the same stale version: merged.
    expect(pushed(s, who('a'), [dose(r, { note: 'with food' }, v1)])[0]!.status).toBe('applied');
    expect(s.pull(0).records[0]!.fields).toEqual({ mg: 10, note: 'with food' });
    // Made on the version after B's change: applied.
    const now = s.pull(0).records[0]!.version;
    expect(pushed(s, who('a'), [dose(r, { mg: 7 }, now)])[0]!.status).toBe('applied');
  });

  test("a device's own changes in a row, all made on the version it had, don't clash with each other", () => {
    const s = fakeStore(rules);
    const r = uid();
    pushed(s, 'a', [dose(r, { mg: 5 })]);
    const v1 = s.pull(0).records[0]!.version;
    expect(pushed(s, 'a', [dose(r, { mg: 6 }, v1), dose(r, { mg: 7 }, v1)]).map((x) => x.status)).toEqual(['applied', 'applied']);
  });

  test('without a base, a guarded field changed after the record was made is a clash', () => {
    const s = fakeStore(rules);
    const r = uid();
    pushed(s, 'a', [dose(r, { mg: 5 })]);
    expect(pushed(s, who('b'), [dose(r, { mg: 6 })])[0]!.status).toBe('applied');
    expect(pushed(s, who('c'), [dose(r, { mg: 7 })])[0]).toMatchObject({ code: 'conflict' });
  });

  test("the app's check refuses with its own code and message; unlisted tables are refused", () => {
    const s = fakeStore(rules);
    const r = uid();
    expect(pushed(s, 'a', [dose(r, {})])[0]).toMatchObject({ status: 'refused', code: 'invalid_input', message: 'A dose needs mg.' });
    pushed(s, 'a', [dose(r, { mg: 1 })]);
    expect(pushed(s, who('a', 'a-1', 'member'), [{ ...del(r), table: 'doses' }])[0]).toMatchObject({ code: 'forbidden' });
    expect(pushed(s, who('b', 'b-1', 'admin'), [{ ...del(r), table: 'doses' }])[0]!.status).toBe('applied');
    expect(pushed(s, 'a', [{ ...put(uid(), {}), table: 'other' }])[0]).toMatchObject({ code: 'invalid_input' });
  });
});

describe('the record of what happened', () => {
  test("a delete keeps the record's last fields on the backend, and who and which device did what", () => {
    const db = new DatabaseSync(':memory:');
    const s = fakeStore(undefined, db);
    const r = uid();
    pushed(s, who('a', 'phone'), [put(r, { title: 'x' })]);
    pushed(s, who('b', 'desk'), [del(r)]);
    expect(s.pull(0).records[0]).toMatchObject({ deleted: true, fields: {}, createdBy: 'a', updatedBy: 'b' });
    const row = db.prepare('SELECT kept, created_session, updated_session FROM records').get();
    expect({ ...row }).toEqual({ kept: '{"title":"x"}', created_session: 'phone', updated_session: 'desk' });
  });

  test('the tables are made once and brought up to date step by step; a space from a newer release is refused', () => {
    const db = new DatabaseSync(':memory:');
    fakeStore(undefined, db);
    // Started again (the object woke up): nothing runs twice.
    const s = fakeStore(undefined, db);
    pushed(s, 'a', [put(uid(), { a: 1 })]);
    expect({ ...db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() }).toEqual({ value: '2' });
    db.exec("UPDATE meta SET value = '99' WHERE key = 'schema'");
    expect(() => fakeStore(undefined, db)).toThrow(/newer release/);
  });

  test('a deleted space refuses changes, so a late request cannot start it again', () => {
    const s = fakeStore();
    s.markGone();
    expect(s.push(who('a'), body(put(uid(), {})))).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('pulling', () => {
  test('pages pick up where the last stopped; a changed record moves to the end', () => {
    const s = fakeStore();
    const ids = Array.from({ length: 30 }, () => uid());
    pushed(s, 'a', ids.map((r, i) => put(r, { i })));
    const seen: string[] = [];
    let since = 0;
    for (;;) {
      const page = s.pull(since, 7);
      seen.push(...page.records.map((r) => r.id));
      since = Number(page.next);
      if (!page.more) break;
    }
    expect(seen).toEqual(ids);
    expect(s.pull(since)).toEqual({ records: [], next: String(since), more: false });
    pushed(s, 'a', [put(ids[0]!, { i: 'again' })]);
    expect(s.pull(since).records.map((r) => r.id)).toEqual([ids[0]]);
  });

  test('a page stops near 256 KB, but always has at least one record', () => {
    const s = fakeStore();
    const big = Array.from({ length: 4 }, () => uid());
    for (const r of big) pushed(s, 'a', [put(r, { a: 'x'.repeat(100_000) })]);
    const first = s.pull(0);
    expect(first.records).toHaveLength(2);
    expect(first.more).toBe(true);
  });
});

describe('files', () => {
  test('parts: every one but the last is the part size', () => {
    expect(partsOf(1)).toBe(1);
    expect(partsOf(PART_SIZE)).toBe(1);
    expect(partsOf(PART_SIZE + 1)).toBe(2);
    expect(partLength(PART_SIZE + 10, 1)).toBe(PART_SIZE);
    expect(partLength(PART_SIZE + 10, 2)).toBe(10);
    expect(partLength(PART_SIZE + 10, 3)).toBeNull();
    expect(partLength(10, 0)).toBeNull();
  });

  test('one id is one file; the day has a byte limit', () => {
    const s = fakeStore();
    const f = { id: uid(), type: 'image/png', size: 100 };
    expect(s.fileCheck('a', f)).toEqual({ ok: true, value: null });
    s.fileStarted('a', f, 'up-1');
    expect(s.fileCheck('a', f)).toMatchObject({ ok: true, value: { id: f.id, upload_id: 'up-1' } });
    expect(s.fileCheck('a', { ...f, size: 101 })).toMatchObject({ ok: false, code: 'conflict' });
    const now = Date.UTC(2026, 10, 1);
    expect(s.fileCheck('b', { id: uid(), type: 'video/mp4', size: 2 * 1024 ** 3 }, now).ok).toBe(true);
    expect(s.fileCheck('b', { id: uid(), type: 'video/mp4', size: 1 }, now)).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});
