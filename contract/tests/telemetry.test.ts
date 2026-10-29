// Error and CSP reports: always 204, whatever arrives, so reporting can never cause more errors;
// repeats are counted, not stored again. Seen from the admin area when it's on. (Clearing every
// report is tested here too, after the rest, so it can't race this file's own checks.)

import { describe, expect, test } from 'vitest';
import { asAdmin, call, expectReply, features, signUp } from './lib';

const enc = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v));
const reportError = (json: unknown, token?: string) => call('post', '/telemetry/errors', { token, json });
const reportCsp = (body: unknown, type: string) => call('post', '/telemetry/csp', { bytes: enc(body), type });

const unique = () => crypto.randomUUID();

/** One violation in each of the two forms browsers send. */
function violation(page: string, blocked = 'https://evil.example/x.js') {
  return {
    legacy: {
      'csp-report': {
        'document-uri': page,
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': blocked,
        'source-file': page,
        'line-number': 12,
        disposition: 'report',
      },
    },
    modern: [
      {
        type: 'csp-violation',
        age: 0,
        url: page,
        user_agent: 'test',
        body: { documentURL: page, effectiveDirective: 'script-src-elem', blockedURL: blocked, sourceFile: page, lineNumber: 12, disposition: 'report' },
      },
    ],
  };
}

describe('always 204', () => {
  test('a browser error, signed in or out', async () => {
    const { token } = await signUp();
    const report = { message: `TypeError: x is undefined ${unique()}`, stack: 'at f (app.js:1:2)', url: 'https://app.example/page', release: '1.0.0' };
    expectReply(await reportError(report), 'post', '/telemetry/errors', 204);
    expectReply(await reportError(report, token), 'post', '/telemetry/errors', 204);
    expectReply(await reportError(report, 'x'.repeat(43)), 'post', '/telemetry/errors', 204);
  });

  test('reports that make no sense are dropped, not refused', async () => {
    for (const json of [{}, { message: 42 }, { message: 'x'.repeat(5000) }, [1, 2], 'text', null])
      expectReply(await reportError(json), 'post', '/telemetry/errors', 204);
    const notJson = await call('post', '/telemetry/errors', { bytes: enc('{not json'), type: 'application/json' });
    expectReply(notJson, 'post', '/telemetry/errors', 204);
    const huge = await call('post', '/telemetry/errors', { bytes: new Uint8Array(200_000), type: 'application/json' });
    expectReply(huge, 'post', '/telemetry/errors', 204);
  });

  test('CSP reports in either form, and nonsense', async () => {
    const v = violation(`https://app.example/${unique()}`);
    expectReply(await reportCsp(v.legacy, 'application/csp-report'), 'post', '/telemetry/csp', 204);
    expectReply(await reportCsp(v.modern, 'application/reports+json'), 'post', '/telemetry/csp', 204);
    expectReply(await reportCsp('{nope', 'application/csp-report'), 'post', '/telemetry/csp', 204);
    expectReply(await reportCsp({ 'csp-report': 'odd' }, 'application/csp-report'), 'post', '/telemetry/csp', 204);
    expectReply(await reportCsp([{ type: 'deprecation', body: {} }], 'application/reports+json'), 'post', '/telemetry/csp', 204);
  });
});

type Report = { kind: string; message: string; detail: string | null; url: string | null; release: string | null; count: number };

describe.skipIf(!features.admin)('in the admin area', () => {
  const find = async (token: string, pick: (r: Report) => boolean): Promise<Report[]> => {
    const out: Report[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const r = await call('get', `/admin/errors${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { token });
      expectReply(r, 'get', '/admin/errors', 200);
      out.push(...(r.body.errors as Report[]).filter(pick));
      cursor = r.body.next;
      if (!cursor) break;
    }
    return out;
  };

  test('repeats are counted: keyed by the message and the first line of the stack', async () => {
    const admin = await asAdmin();
    const message = `ReferenceError: nope ${unique()}`;
    const before = (await call('get', '/admin/stats', { token: admin.token })).body.errors24h as number;
    await reportError({ message, stack: `${message}\n    at a (app.js:1:1)`, url: 'https://app.example/a', release: '2.0.0' });
    await reportError({ message, stack: `${message}\n    at b (app.js:9:9)`, url: 'https://app.example/b', release: '2.0.0' });
    await reportError({ message, stack: `Something else first\n    at a (app.js:1:1)` });

    const seen = await find(admin.token, (r) => r.message === message);
    expect(seen).toHaveLength(2);
    expect(seen.map((r) => r.count).sort()).toEqual([1, 2]);
    expect(seen.every((r) => r.kind === 'client')).toBe(true);
    expect(seen.find((r) => r.count === 2)).toMatchObject({ release: '2.0.0', detail: expect.stringContaining('at a') });

    const stats = await call('get', '/admin/stats', { token: admin.token });
    expect(stats.body.errors24h).toBeGreaterThanOrEqual(before + 3);
  });

  test('CSP reports are counted by directive, blocked address and page, whatever the form', async () => {
    const admin = await asAdmin();
    const page = `https://app.example/${unique()}`;
    const v = violation(page);
    await reportCsp(v.legacy, 'application/csp-report');
    await reportCsp(v.legacy, 'application/csp-report');
    await reportCsp(v.modern, 'application/reports+json');
    await reportCsp(violation(page, 'https://other.example/y.js').legacy, 'application/csp-report');

    const seen = await find(admin.token, (r) => r.kind === 'csp' && r.url === page);
    expect(seen.map((r) => r.count).sort()).toEqual([1, 3]);
    const three = seen.find((r) => r.count === 3)!;
    expect(three.message).toContain('script-src-elem');
    expect(three.message).toContain('https://evil.example/x.js');
  });

  test('at most five CSP reports are read from one request', async () => {
    const admin = await asAdmin();
    const page = `https://app.example/${unique()}`;
    const many = Array.from({ length: 7 }, (_, i) => violation(page, `https://evil.example/${i}.js`).modern[0]);
    expectReply(await reportCsp(many, 'application/reports+json'), 'post', '/telemetry/csp', 204);
    expect(await find(admin.token, (r) => r.kind === 'csp' && r.url === page)).toHaveLength(5);
  });

  test('clearing every report', async () => {
    const admin = await asAdmin();
    const message = `Cleared ${unique()}`;
    await reportError({ message });
    expect(await find(admin.token, (r) => r.message === message)).toHaveLength(1);
    expectReply(await call('delete', '/admin/errors', { token: admin.token }), 'delete', '/admin/errors', 204);
    expect(await find(admin.token, (r) => r.message === message)).toHaveLength(0);
  });
});
