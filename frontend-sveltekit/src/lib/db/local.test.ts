import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { ME, mediaType, openLocal } from './local';

let n = 0;
const fresh = () => openLocal(`test-${++n}`);

describe('ids made on the device', () => {
  it('are UUID v7, never repeat, and sort by time', () => {
    const a = newId(1_000);
    const b = newId(2_000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
  });
});

describe('the data on this device', () => {
  it('writes at once, merging per field, and queues each change', async () => {
    const d = await fresh();
    const id = newId();
    await d.put(ME, 'appointments', id, { patient: 'Ali', slot: '10:00' });
    const r = await d.put(ME, 'appointments', id, { slot: '11:00' });
    expect(r).toMatchObject({ fields: { patient: 'Ali', slot: '11:00' }, base: {}, pending: 2 });
    expect(await d.list(ME, 'appointments')).toHaveLength(1);
    expect(await d.pendingCount()).toBe(2);
    await d.remove(ME, 'appointments', id);
    expect(await d.list(ME, 'appointments')).toEqual([]);
    expect(await d.list(ME, 'appointments', { deleted: true })).toHaveLength(1);
    await expect(d.put(ME, 'appointments', id, { slot: '12:00' })).rejects.toThrow(/deleted/);
  });

  it('refuses what the backend would', async () => {
    const d = await fresh();
    await expect(d.put(ME, 'Bad', newId(), {})).rejects.toThrow();
    await expect(d.put(ME, 'notes', 'short', {})).rejects.toThrow();
    await expect(d.put(ME, 'notes', newId(), { 'a b': 1 })).rejects.toThrow();
    await expect(d.put(ME, 'notes', newId(), { a: 'x'.repeat(300_000) })).rejects.toThrow(/too much/);
    expect(await d.pendingCount()).toBe(0);
  });

  it('batches one space at a time, oldest first', async () => {
    const d = await fresh();
    await d.put(ME, 'notes', newId(), { n: 1 });
    await d.put('team1', 'notes', newId(), { n: 2 });
    await d.put(ME, 'notes', newId(), { n: 3 });
    const b = await d.batch(100, 200_000);
    expect(b!.space).toBe(ME);
    expect(b!.entries.map((e) => e.change.fields)).toEqual([{ n: 1 }, { n: 3 }]);
    expect((await d.batch(1, 200_000))!.entries).toHaveLength(1);
  });

  it('an applied change becomes the base; a refused one is dropped and the view worked out again', async () => {
    const d = await fresh();
    const id = newId();
    await d.put(ME, 'notes', id, { title: 'a' });
    await d.put(ME, 'notes', id, { body: 'too big for the backend' });
    const { entries } = (await d.batch(100, 200_000))!;
    await d.settle(ME, [
      { entry: entries[0]!, applied: true },
      { entry: entries[1]!, applied: false },
    ]);
    expect(await d.get(ME, 'notes', id)).toMatchObject({
      fields: { title: 'a' },
      base: { title: 'a' },
      pending: 0,
    });
    expect(await d.pendingCount()).toBe(0);

    // A record made here whose only change was refused doesn't stay.
    const lone = newId();
    await d.put(ME, 'notes', lone, { x: 1 });
    const b = (await d.batch(100, 200_000))!;
    await d.settle(ME, [{ entry: b.entries[0]!, applied: false }]);
    expect(await d.get(ME, 'notes', lone)).toBeUndefined();
  });

  it("records from the backend become the base, with this device's unsent changes still on top", async () => {
    const d = await fresh();
    const id = newId();
    await d.put(ME, 'appointments', id, { note: 'mine' });
    const server = {
      table: 'appointments',
      id,
      deleted: false,
      createdBy: 'u1',
      updatedBy: 'u2',
      createdAt: 'x',
      updatedAt: 'y',
    };
    await d.receive(ME, [{ ...server, fields: { patient: 'Ali', note: 'theirs' } }]);
    expect(await d.get(ME, 'appointments', id)).toMatchObject({
      fields: { patient: 'Ali', note: 'mine' },
      base: { patient: 'Ali', note: 'theirs' },
      pending: 1,
      updatedBy: 'u2',
    });
    // Deleted on the backend: deleted here too, whatever was waiting.
    await d.receive(ME, [{ ...server, fields: {}, deleted: true }]);
    expect(await d.get(ME, 'appointments', id)).toMatchObject({ deleted: true, fields: {} });
  });

  it('drops a space with everything of it', async () => {
    const d = await fresh();
    await d.follow('team1');
    await d.put('team1', 'notes', newId(), {});
    await d.put(ME, 'notes', newId(), {});
    await d.saveFile('team1', new Blob(['x'], { type: 'text/plain' }));
    await d.setCursor('team1', '5');
    await d.dropSpace('team1');
    expect(await d.list('team1', 'notes')).toEqual([]);
    expect(await d.list(ME, 'notes')).toHaveLength(1);
    expect(await d.pendingCount()).toBe(1);
    expect(await d.waitingFiles()).toEqual([]);
    expect(await d.cursor('team1')).toBeNull();
    expect(await d.followed()).toEqual([]);
  });

  it('files: kept here, listed until uploaded, types cleaned up', async () => {
    const d = await fresh();
    await expect(d.saveFile(ME, new Blob([]))).rejects.toThrow(/empty/);
    const id = await d.saveFile(ME, new Blob(['hello'], { type: 'text/plain;charset=utf-8' }));
    const [f] = await d.waitingFiles();
    expect(f).toMatchObject({ id, type: 'text/plain', size: 5, uploaded: false });
    await d.updateFile({ ...f!, uploaded: true });
    expect(await d.waitingFiles()).toEqual([]);
    expect(mediaType('Image/PNG')).toBe('image/png');
    expect(mediaType('nonsense')).toBe('application/octet-stream');
  });
});
