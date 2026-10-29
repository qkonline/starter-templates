// Error reports: repeats counted under one signature, at most 500 kept (the least recently seen
// go), the hourly counts behind errors24h, and reading what browsers send.
import { describe, expect, it } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { MAX_REPORTS } from './db';
import { clientReport, cspReports, recordReport, serverReport, type Report } from './reports';

const HOUR = 3600_000;
const report = (message: string, stack = 'at x'): Report => clientReport({ message, stack })!;

describe('recording', () => {
  it('counts a repeat instead of storing it again, keyed by the message and the first line of the stack', async () => {
    const { ctx } = fakeCtx();
    const now = 1_800_000_000_000;
    await recordReport(ctx, report('Boom', 'TypeError: Boom\n at a'), now);
    await recordReport(ctx, report('Boom', 'TypeError: Boom\n at b'), now + 1000);
    await recordReport(ctx, report('Boom', 'Other first line'), now + 2000);
    const rows = await ctx.db.reports(null, 10);
    expect(rows.map((r) => r.count).sort()).toEqual([1, 2]);
    const twice = rows.find((r) => r.count === 2)!;
    expect(twice).toMatchObject({ first_seen: now, last_seen: now + 1000, detail: 'TypeError: Boom\n at a' });
    // Most recently seen first.
    expect(rows[0]!.last_seen).toBe(now + 2000);
  });

  it(`keeps at most ${MAX_REPORTS} after the daily sweep: the least recently seen go first`, async () => {
    const { ctx } = fakeCtx();
    const now = 1_800_000_000_000;
    for (let i = 0; i < MAX_REPORTS + 5; i++) await recordReport(ctx, report(`Error ${i}`), now + i);
    // An old one seen again stays.
    await recordReport(ctx, report('Error 5'), now + 10_000);
    await recordReport(ctx, report('Newest'), now + 10_001);
    // Recording only adds; trimming is the sweep's.
    expect(await ctx.db.reports(null, 1000)).toHaveLength(MAX_REPORTS + 6);
    await ctx.db.sweep(now + 10_002);
    const all = await ctx.db.reports(null, 1000);
    expect(all).toHaveLength(MAX_REPORTS);
    const kept = new Set(all.map((r) => r.message));
    for (const gone of [0, 1, 2, 3, 4, 6]) expect(kept.has(`Error ${gone}`)).toBe(false);
    expect(kept.has('Error 5')).toBe(true);
    expect(kept.has('Error 7')).toBe(true);
    expect(kept.has('Newest')).toBe(true);
  });

  it('counts the last 24 hours, repeats included; clearing empties both', async () => {
    const { ctx } = fakeCtx();
    const now = 1_800_000_000_000;
    await recordReport(ctx, report('Old'), now - 30 * HOUR);
    await recordReport(ctx, report('A'), now - 2 * HOUR);
    await recordReport(ctx, report('A'), now - HOUR);
    await recordReport(ctx, report('B'), now);
    expect((await ctx.db.stats(now)).errors24h).toBe(3);
    await ctx.db.clearReports();
    expect((await ctx.db.stats(now)).errors24h).toBe(0);
    expect(await ctx.db.reports(null, 10)).toEqual([]);
  });

  it('never throws, even when storing fails', async () => {
    const { ctx } = fakeCtx();
    ctx.db.recordReport = async () => {
      throw new Error('D1 down');
    };
    await expect(recordReport(ctx, report('x'))).resolves.toBeUndefined();
  });
});

describe('reading reports', () => {
  it('drops what is not a browser error', () => {
    for (const body of [null, 'text', [1], {}, { message: 7 }, { message: 'x'.repeat(1001) }, { message: 'ok', stack: 5 }])
      expect(clientReport(body)).toBeNull();
    expect(clientReport({ message: 'ok', extra: true })).toMatchObject({ kind: 'client', message: 'ok', detail: null });
  });

  it('keys a server error by its message and first frame', () => {
    const a = serverReport(new TypeError('nope'), 'GET /api/x');
    expect(a).toMatchObject({ kind: 'server', message: 'TypeError: nope', url: 'GET /api/x' });
    expect(a.key[1]).toMatch(/^at /);
  });

  it('reads CSP reports in both forms the same way', () => {
    const page = 'https://app.example/p';
    const legacy = cspReports({
      'csp-report': { 'document-uri': page, 'violated-directive': 'img-src', 'blocked-uri': 'https://x.test/i.png', 'source-file': page, 'line-number': 3 },
    });
    const modern = cspReports([
      { type: 'csp-violation', body: { documentURL: page, effectiveDirective: 'img-src', blockedURL: 'https://x.test/i.png', sourceFile: page, lineNumber: 3 } },
      { type: 'deprecation', body: {} },
    ]);
    expect(legacy).toEqual(modern);
    expect(legacy).toEqual([
      { kind: 'csp', message: 'img-src blocked https://x.test/i.png', detail: `${page}:3`, url: page, release: null, key: ['img-src', 'https://x.test/i.png', page] },
    ]);
    expect(cspReports({ 'csp-report': 'odd' })).toEqual([]);
    expect(cspReports(undefined)).toEqual([]);
  });
});
