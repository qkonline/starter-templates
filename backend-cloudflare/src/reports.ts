// Error tracking without a third party (PRD R7.2): the browser's uncaught errors, this Worker's
// own 500s and CSP violation reports, in one table. A report is keyed by a signature (what makes
// two the same); a repeat is counted, not stored again, and the daily sweep keeps the 500 most
// recently seen (as high-yield-prep keeps its CSP reports). Recording never throws: reporting
// must never cause more errors.

import { randomToken, sha256 } from './crypto';
import type { ReportRow } from './db';
import type { Ctx } from './env';

export interface Report {
  kind: ReportRow['kind'];
  message: string;
  detail: string | null;
  url: string | null;
  release: string | null;
  /** The account that sent it, when signed in. */
  userId?: string | null;
  /** What makes two reports the same one. */
  key: string[];
}

const cut = (v: string | null | undefined, max: number) => (v ? v.slice(0, max) : null);

/** CSP reports kept from one request (the contract says only the first 5); the rest are dropped, never refused. */
export const MAX_CSP = 5;
const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);

export async function recordReport(ctx: Ctx, r: Report, now = Date.now()): Promise<void> {
  try {
    await ctx.db.recordReport(
      {
        id: randomToken(12),
        signature: await sha256([r.kind, ...r.key].join('\n')),
        kind: r.kind,
        message: cut(r.message, 1000) || '(no message)',
        detail: cut(r.detail, 8000),
        url: cut(r.url, 1000),
        release: cut(r.release, 100),
        userId: r.userId ?? null,
      },
      now,
    );
  } catch (e) {
    console.error('Recording a report', e);
  }
}

/** A browser's report (`POST /telemetry/errors`), or null when it isn't one. Keyed by the message and the stack's first line. */
export function clientReport(body: unknown): Report | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const message = text(b.message, 1000);
  const stack = b.stack === undefined ? null : text(b.stack, 8000);
  const url = b.url === undefined ? null : text(b.url, 1000);
  const release = b.release === undefined ? null : text(b.release, 100);
  if (!message || stack === undefined || url === undefined || release === undefined) return null;
  return { kind: 'client', message, detail: stack, url, release, key: [message, stack?.split('\n')[0] ?? ''] };
}

/** This Worker's own uncaught error, for a 500. */
export function serverReport(e: unknown, where: string): Report {
  const err = e instanceof Error ? e : new Error(String(e));
  const message = `${err.name}: ${err.message}`;
  // The first frame, not the message line, so one throw site is one report.
  const frame = err.stack?.split('\n').find((l) => /^\s+at /.test(l))?.trim() ?? '';
  return { kind: 'server', message, detail: err.stack ?? null, url: where, release: null, key: [message, frame] };
}

/**
 * The violations in a CSP report, in either form browsers send: `application/csp-report` (one,
 * under "csp-report") or `application/reports+json` (a list, each with a body). Keyed by the
 * directive, the blocked address and the page.
 */
export function cspReports(body: unknown): Report[] {
  const found: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const r of body.slice(0, MAX_CSP))
      if (r && typeof r === 'object' && (r as { type?: unknown }).type === 'csp-violation') {
        const b = (r as { body?: unknown }).body;
        if (b && typeof b === 'object') found.push(b as Record<string, unknown>);
      }
  } else if (body && typeof body === 'object') {
    const r = (body as Record<string, unknown>)['csp-report'];
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const o = r as Record<string, unknown>;
      // The old form, in the new form's names.
      found.push({
        documentURL: o['document-uri'],
        effectiveDirective: o['effective-directive'] ?? o['violated-directive'],
        blockedURL: o['blocked-uri'],
        sourceFile: o['source-file'],
        lineNumber: o['line-number'],
      });
    }
  }
  const out: Report[] = [];
  for (const v of found) {
    const directive = text(v.effectiveDirective, 200);
    if (!directive) continue;
    const blocked = text(v.blockedURL, 1000) ?? '';
    const page = text(v.documentURL, 1000) ?? '';
    const source = text(v.sourceFile, 1000);
    const line = typeof v.lineNumber === 'number' ? `:${v.lineNumber}` : '';
    out.push({
      kind: 'csp',
      message: `${directive} blocked ${blocked || '(inline)'}`,
      detail: source ? `${source}${line}` : null,
      url: page || null,
      release: null,
      key: [directive, blocked, page],
    });
  }
  return out;
}
