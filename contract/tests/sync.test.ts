// Offline data (optional, PRD section 11, docs/offline-data.md): changes pushed in batches with
// ids made on the device, pulled back in pages, and files uploaded in parts. With sync off,
// every path answers `not_found`.

import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { API, call, confirm, expectError, expectReply, features, mailed, methods, signIn, signUp as signUpOnly } from './lib';

type Change = { id: string; table: string; record: string; op: 'put' | 'delete'; fields?: Record<string, unknown>; at: string };
type SyncRecord = { table: string; id: string; fields: Record<string, unknown>; deleted: boolean; createdBy: string | null; updatedBy: string | null };

const id = () => randomUUID();
const at = () => new Date().toISOString();
const put = (table: string, record: string, fields: Record<string, unknown>): Change => ({ id: id(), table, record, op: 'put', fields, at: at() });
const del = (table: string, record: string): Change => ({ id: id(), table, record, op: 'delete', at: at() });
const q = (team?: string) => (team ? `?team=${team}` : '');

async function push(token: string, changes: Change[], team?: string) {
  const r = await call('post', `/sync/push${q(team)}`, { token, json: { changes } });
  expectReply(r, 'post', '/sync/push', 200);
  return r.body.results as { id: string; status: string; code?: string; message?: string }[];
}

/** Every page from `since` on: all the records, and the cursor to keep. */
async function pullAll(token: string, opts: { team?: string; since?: string; limit?: number } = {}) {
  const records: SyncRecord[] = [];
  let since = opts.since;
  let pages = 0;
  for (;;) {
    const query = new URLSearchParams();
    if (opts.team) query.set('team', opts.team);
    if (since) query.set('since', since);
    if (opts.limit) query.set('limit', String(opts.limit));
    const r = await call('get', `/sync/pull?${query}`, { token });
    expectReply(r, 'get', '/sync/pull', 200);
    records.push(...r.body.records);
    since = r.body.next;
    pages++;
    if (!r.body.more) return { records, next: since!, pages };
  }
}

/** An account that may sync: confirmed, when the app holds unconfirmed people back. */
async function signUp() {
  const p = await signUpOnly();
  if (methods.requireVerifiedEmail) p.user = await confirm(p);
  return p;
}

const byId = (records: SyncRecord[], recordId: string) => records.filter((r) => r.id === recordId);

describe.skipIf(!features.sync)('sync', () => {
  test("two people offline each add a record: both kept, each with the device's id", async () => {
    // The worked example in docs/offline-data.md: two devices, neither online, each books an
    // appointment. Sent in either order and each twice, both stay, with the ids they were made with.
    const a = await signUp();
    const b = await signIn(a.email); // another device of the same account
    const ali = put('appointments', id(), { patient: 'Ali', slot: '10:00' });
    const sara = put('appointments', id(), { patient: 'Sara', slot: '10:00' });
    expect((await push(b.token, [sara])).map((r) => r.status)).toEqual(['applied']);
    expect((await push(a.token, [ali])).map((r) => r.status)).toEqual(['applied']);
    await push(a.token, [ali]);
    await push(b.token, [sara]);

    const { records } = await pullAll(a.token);
    const appointments = records.filter((r) => r.table === 'appointments');
    expect(appointments.map((r) => r.id).sort()).toEqual([ali.record, sara.record].sort());
    expect(byId(records, ali.record)[0]).toMatchObject({ fields: { patient: 'Ali', slot: '10:00' }, deleted: false, createdBy: a.user.id });
  });

  test('a batch sent again is applied once', async () => {
    const { token } = await signUp();
    const record = id();
    const first = [put('notes', record, { title: 'first' })];
    await push(token, first);
    await push(token, [put('notes', record, { title: 'second' })]);
    // The reply to the first batch was lost; it goes again. It must not undo the second.
    const again = await push(token, first);
    expect(again).toEqual([{ id: first[0]!.id, status: 'applied' }]);
    const { records } = await pullAll(token);
    expect(byId(records, record)).toEqual([expect.objectContaining({ fields: { title: 'second' } })]);
  });

  test('changes are merged per field, and the later one wins a field both set', async () => {
    const { token } = await signUp();
    const record = id();
    await push(token, [put('appointments', record, { patient: 'Ali', slot: '10:00', note: '' })]);
    // Two devices offline: one moves the time, the other adds a note; both reach the backend.
    await push(token, [put('appointments', record, { slot: '11:00' })]);
    await push(token, [put('appointments', record, { note: 'Bring scans' })]);
    // Both set the same field: the one the backend received later wins.
    await push(token, [put('appointments', record, { slot: '12:00' }), put('appointments', record, { slot: '09:30' })]);
    const { records } = await pullAll(token);
    expect(byId(records, record)[0]!.fields).toEqual({ patient: 'Ali', slot: '09:30', note: 'Bring scans' });
  });

  test('a delete stays as a marker, and a later edit to it is refused, not brought back', async () => {
    const { token } = await signUp();
    const record = id();
    await push(token, [put('notes', record, { title: 'x' })]);
    const { next } = await pullAll(token);
    await push(token, [del('notes', record)]);
    const after = await pullAll(token, { since: next });
    expect(byId(after.records, record)).toEqual([expect.objectContaining({ deleted: true, fields: {} })]);

    const late = put('notes', record, { title: 'edited offline' });
    const [result] = await push(token, [late]);
    expect(result).toMatchObject({ id: late.id, status: 'refused', code: 'conflict' });
    expect(result!.message!.length).toBeGreaterThan(0);
    const still = await pullAll(token);
    expect(byId(still.records, record)[0]!.deleted).toBe(true);
  });

  test('a change that cannot be applied is refused on its own; the rest of the batch is applied', async () => {
    const { token } = await signUp();
    // A record grown past 256 KB by merging is refused; the change next to it still goes in.
    const grow = id();
    await push(token, [put('notes', grow, { a: 'x'.repeat(200 * 1024) })]);
    const good = put('notes', id(), { title: 'fine' });
    const results = await push(token, [put('notes', grow, { b: 'y'.repeat(60 * 1024) }), good]);
    expect(results.map((r) => r.status)).toEqual(['refused', 'applied']);
    expect(results[0]).toMatchObject({ code: 'too_large' });
    const { records } = await pullAll(token);
    expect(byId(records, good.record)).toHaveLength(1);
    expect(Object.keys(byId(records, grow)[0]!.fields)).toEqual(['a']);

    // A batch over 256 KB is refused whole.
    const huge = put('notes', id(), { a: 'x'.repeat(130 * 1024), b: 'y'.repeat(130 * 1024) });
    expectError(await call('post', '/sync/push', { token, json: { changes: [huge] } }), 'post', '/sync/push', 413, 'too_large');
  });

  test('a batch that cannot be read is refused whole', async () => {
    const { token } = await signUp();
    const bad = (json: unknown) => call('post', '/sync/push', { token, json });
    expectError(await bad({}), 'post', '/sync/push', 400, 'invalid_input');
    expectError(await bad({ changes: [] }), 'post', '/sync/push', 400, 'invalid_input');
    expectError(await bad({ changes: [put('notes', id(), {})], extra: 1 }), 'post', '/sync/push', 400, 'invalid_input');
    expectError(await bad({ changes: Array.from({ length: 101 }, () => put('notes', id(), {})) }), 'post', '/sync/push', 400, 'invalid_input');
    for (const change of [
      { ...put('notes', id(), {}), id: 'short' },
      { ...put('notes', id(), {}), table: 'Bad Table' },
      { ...put('notes', id(), {}), record: 'no/slashes/here/please' },
      { ...put('notes', id(), {}), op: 'merge' },
      { ...put('notes', id(), {}), at: 'yesterday' },
      { ...put('notes', id(), {}), fields: [1, 2] },
      { ...put('notes', id(), {}), fields: { 'bad name': 1 } },
      { ...del('notes', id()), fields: { title: 'x' } },
    ])
      expectError(await bad({ changes: [change] }), 'post', '/sync/push', 400, 'invalid_input');
    expectError(await call('get', '/sync/pull?since=abc', { token }), 'get', '/sync/pull', 400, 'invalid_input');
    expectError(await call('get', '/sync/pull?limit=0', { token }), 'get', '/sync/pull', 400, 'invalid_input');
  });

  test('pages pick up where the last one stopped', async () => {
    const { token } = await signUp();
    const ids = Array.from({ length: 120 }, () => id());
    for (let i = 0; i < ids.length; i += 50)
      await push(token, ids.slice(i, i + 50).map((r, j) => put('items', r, { n: i + j })));

    const { records, next, pages } = await pullAll(token, { limit: 25 });
    expect(pages).toBeGreaterThanOrEqual(5);
    expect(records.map((r) => r.id)).toEqual(ids);

    // Nothing new: an empty page, the same cursor.
    const none = await pullAll(token, { since: next });
    expect(none.records).toEqual([]);
    expect(none.next).toBe(next);

    // One record changes: the next pull has that one only, as it is now.
    await push(token, [put('items', ids[3]!, { n: 'changed' })]);
    const later = await pullAll(token, { since: next });
    expect(later.records).toEqual([expect.objectContaining({ id: ids[3], fields: { n: 'changed' } })]);
  });

  test('a busy server answers 429 with when to try again, and applies nothing', async () => {
    const { token } = await signUp();
    let refused: Awaited<ReturnType<typeof call>> | null = null;
    const record = id();
    for (let i = 0; i < 70 && !refused; i++) {
      const r = await call('post', '/sync/push', { token, json: { changes: [put('ticks', record, { n: i })] } });
      if (r.status === 429) refused = r;
      else expectReply(r, 'post', '/sync/push', 200);
    }
    expect(refused, 'no 429 after 70 batches in a row').not.toBeNull();
    expectError(refused!, 'post', '/sync/push', 429, 'rate_limited');
    expect(Number(refused!.headers.get('retry-after'))).toBeGreaterThan(0);
    // The refused batch changed nothing: the record has the last applied value.
    // (Pulling has its own, larger limit.)
    expect(byId((await pullAll(token)).records, record)[0]!.fields).toEqual({ n: 59 });
  });

  test("one person's data is theirs alone", async () => {
    const a = await signUp();
    const b = await signUp();
    const record = id();
    await push(a.token, [put('notes', record, { secret: 'a' })]);
    expect((await pullAll(b.token)).records).toEqual([]);
    // B sending a change to the same id makes B's own record; A's is untouched.
    await push(b.token, [put('notes', record, { secret: 'b' })]);
    expect(byId((await pullAll(a.token)).records, record)[0]!.fields).toEqual({ secret: 'a' });
  });

  test.skipIf(!methods.requireVerifiedEmail)('holds back an unconfirmed email when the app requires confirming', async () => {
    const { token } = await signUpOnly();
    expectError(await call('get', '/sync/pull', { token }), 'get', '/sync/pull', 403, 'email_unverified');
  });

  test('needs a session', async () => {
    expectError(await call('get', '/sync/pull'), 'get', '/sync/pull', 401, 'signed_out');
    expectError(await call('post', '/sync/push', { json: { changes: [put('notes', id(), {})] } }), 'post', '/sync/push', 401, 'signed_out');
  });

  describe.skipIf(!features.teams)("a team's shared data", () => {
    test('members share it; others get not_found', async () => {
      const admin = await signUp();
      if (!methods.requireVerifiedEmail) await confirm(admin); // only a confirmed email can invite
      const team = (await call('post', '/teams', { token: admin.token, json: { name: 'Clinic' } })).body.team as { id: string };
      const member = await signUp();
      const { found } = await mailed(member.email, /[?&]token=([A-Za-z0-9_-]+)/, () =>
        call('post', `/teams/${team.id}/invites`, { token: admin.token, json: { email: member.email, role: 'member' } }),
      );
      expectReply(await call('post', '/invites/accept', { token: member.token, json: { token: found } }), 'post', '/invites/accept', 200);

      // Both offline, both book: two records in the team's data, made by each.
      const ali = put('appointments', id(), { patient: 'Ali' });
      const sara = put('appointments', id(), { patient: 'Sara' });
      await push(member.token, [sara], team.id);
      await push(admin.token, [ali], team.id);
      const { records } = await pullAll(member.token, { team: team.id });
      expect(records.map((r) => [r.id, r.createdBy]).sort()).toEqual(
        [
          [ali.record, admin.user.id],
          [sara.record, member.user.id],
        ].sort(),
      );
      // Not in either person's own data.
      expect((await pullAll(admin.token)).records).toEqual([]);

      const outsider = await signUp();
      expectError(await call('get', `/sync/pull?team=${team.id}`, { token: outsider.token }), 'get', '/sync/pull', 404, 'not_found');
      expectError(await call('post', `/sync/push?team=${team.id}`, { token: outsider.token, json: { changes: [put('x', id(), {})] } }), 'post', '/sync/push', 404, 'not_found');
    });
  });

  describe('files', () => {
    const start = (token: string, json: unknown) => call('post', '/sync/files', { token, json });
    const part = (token: string, fileId: string, n: number, bytes: Uint8Array<ArrayBuffer>) =>
      call('put', `/sync/files/${fileId}/parts/${n}`, { token, bytes });
    const finish = (token: string, fileId: string, parts: { number: number; etag: string }[]) =>
      call('post', `/sync/files/${fileId}/complete`, { token, json: { parts } });
    const download = (token: string, fileId: string) => fetch(`${API}/sync/files/${fileId}`, { headers: { authorization: `Bearer ${token}` } });

    function bytesOf(size: number): Uint8Array<ArrayBuffer> {
      const b = new Uint8Array(size);
      for (let i = 0; i < size; i++) b[i] = (i * 31 + 7) & 0xff;
      return b;
    }

    test('a small file: start, one part, finish, download', async () => {
      const { token } = await signUp();
      const fileId = id();
      const data = bytesOf(1000);
      const s = await start(token, { id: fileId, type: 'image/png', size: data.length });
      expectReply(s, 'post', '/sync/files', 200);
      expect(s.body.file).toMatchObject({ id: fileId, type: 'image/png', size: 1000, complete: false });
      expectError(await call('get', `/sync/files/${fileId}`, { token }), 'get', '/sync/files/{fileId}', 404, 'not_found');

      const p = await part(token, fileId, 1, data);
      expectReply(p, 'put', '/sync/files/{fileId}/parts/{number}', 200);
      const done = await finish(token, fileId, [{ number: 1, etag: p.body.etag }]);
      expectReply(done, 'post', '/sync/files/{fileId}/complete', 200);
      expect(done.body.file.complete).toBe(true);
      // Finishing again, and starting again, answer with the file as it is.
      expectReply(await finish(token, fileId, [{ number: 1, etag: p.body.etag }]), 'post', '/sync/files/{fileId}/complete', 200);
      const again = await start(token, { id: fileId, type: 'image/png', size: data.length });
      expect(again.body.file.complete).toBe(true);
      expectError(await part(token, fileId, 1, data), 'put', '/sync/files/{fileId}/parts/{number}', 409, 'conflict');

      const res = await download(token, fileId);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment/);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(data);

      const other = await signUp();
      expectError(await call('get', `/sync/files/${fileId}`, { token: other.token }), 'get', '/sync/files/{fileId}', 404, 'not_found');
    });

    test('a file in two parts, the first sent twice', async () => {
      const { token } = await signUp();
      const fileId = id();
      const s = await start(token, { id: fileId, type: 'application/pdf', size: 1 });
      const partSize = s.body.file.partSize as number;
      expect(partSize).toBeGreaterThanOrEqual(5 * 1024 * 1024);
      // A new upload id for a different size is a different file: refused.
      expectError(await start(token, { id: fileId, type: 'application/pdf', size: 2 }), 'post', '/sync/files', 409, 'conflict');

      const twoId = id();
      const data = bytesOf(partSize + 1234);
      expectReply(await start(token, { id: twoId, type: 'application/pdf', size: data.length }), 'post', '/sync/files', 200);
      // A part of the wrong size is refused.
      expectError(await part(token, twoId, 1, data.slice(0, 100)), 'put', '/sync/files/{fileId}/parts/{number}', 400, 'invalid_input');
      expectError(await part(token, twoId, 3, data.slice(0, 100)), 'put', '/sync/files/{fileId}/parts/{number}', 400, 'invalid_input');
      await part(token, twoId, 1, data.slice(0, partSize));
      const p1 = await part(token, twoId, 1, data.slice(0, partSize));
      const p2 = await part(token, twoId, 2, data.slice(partSize));
      expectError(await finish(token, twoId, [{ number: 1, etag: p1.body.etag }]), 'post', '/sync/files/{fileId}/complete', 400, 'invalid_input');
      const done = await finish(token, twoId, [
        { number: 1, etag: p1.body.etag },
        { number: 2, etag: p2.body.etag },
      ]);
      expectReply(done, 'post', '/sync/files/{fileId}/complete', 200);
      const res = await download(token, twoId);
      // Compared as buffers: a deep equal of 8 MB takes vitest minutes.
      expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(data))).toBe(true);
    });

    test('too large, unknown, or not readable', async () => {
      const { token } = await signUp();
      expectError(await start(token, { id: id(), type: 'video/mp4', size: 1024 ** 3 + 1 }), 'post', '/sync/files', 413, 'too_large');
      expectError(await start(token, { id: id(), type: 'not a type', size: 10 }), 'post', '/sync/files', 400, 'invalid_input');
      expectError(await start(token, { id: 'short', type: 'image/png', size: 10 }), 'post', '/sync/files', 400, 'invalid_input');
      expectError(await part(token, id(), 1, bytesOf(10)), 'put', '/sync/files/{fileId}/parts/{number}', 404, 'not_found');
      expectError(await finish(token, id(), [{ number: 1, etag: 'x' }]), 'post', '/sync/files/{fileId}/complete', 404, 'not_found');
    });
  });
});

test.skipIf(features.sync)('sync switched off is not there', async () => {
  const { token } = await signUpOnly();
  expectError(await call('get', '/sync/pull', { token }), 'get', '/sync/pull', 404, 'not_found');
  expectError(await call('post', '/sync/push', { token, json: { changes: [put('notes', id(), {})] } }), 'post', '/sync/push', 404, 'not_found');
  expectError(await call('post', '/sync/files', { token, json: { id: id(), type: 'image/png', size: 1 } }), 'post', '/sync/files', 404, 'not_found');
});
