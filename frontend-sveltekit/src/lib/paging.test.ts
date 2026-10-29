import { describe, expect, it } from 'vitest';
import type { AppNotification } from '#lib/api/index.ts';
import { markedRead } from './notifications.svelte';
import { appendPage } from './paging';

const n = (id: string, readAt: string | null = null): AppNotification => ({
  id,
  title: `t${id}`,
  body: '',
  url: null,
  createdAt: '2026-10-28T12:00:00.000Z',
  readAt,
});

describe('paging', () => {
  it('adds the next page below, leaving out rows already shown', () => {
    const shown = [n('1'), n('2')];
    const merged = appendPage(shown, [n('2'), n('3')], (x) => x.id);
    expect(merged.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(shown).toHaveLength(2);
  });
});

describe('marking notifications read', () => {
  it('marks the given ones and keeps earlier read times', () => {
    const list = [n('1'), n('2', '2026-10-01T00:00:00.000Z'), n('3')];
    const out = markedRead(list, new Set(['1', '2']), 'NOW');
    expect(out.map((x) => x.readAt)).toEqual(['NOW', '2026-10-01T00:00:00.000Z', null]);
  });

  it('marks everything with "all"', () => {
    expect(markedRead([n('1'), n('2')], 'all', 'NOW').every((x) => x.readAt === 'NOW')).toBe(true);
  });
});
