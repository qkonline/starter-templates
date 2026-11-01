// Background jobs: work done later, or again until it succeeds (src/app/jobs.ts has the app's).
// Kept in D1 (`core_jobs`), done by the cron that runs every minute (wrangler.toml, [triggers]),
// a few at a time. A job is claimed for 5 minutes, so two runs never do the same one at once; one
// that fails waits 1, 2, 4… minutes and tries again, and after 8 tries it's kept as dead and
// reported (the admin area's errors). Nothing due: one index read, nothing written.

import { appJobs } from './app/jobs';
import type { Env } from './env';

export type Jobs = Record<string, (env: Env, payload: unknown) => Promise<void>>;

const CLAIM_MS = 5 * 60_000;
const MAX_TRIES = 8;
const BATCH = 10;

interface JobRow {
  id: number;
  kind: string;
  payload: string;
  tries: number;
}

/**
 * Queue `kind` with `payload` (JSON), due `at` (ms; now when not given). With `key`, a job
 * already queued under it is kept and this one dropped, so enqueueing twice is one job.
 */
export async function enqueue(env: Env, kind: string, payload: unknown, opts: { at?: number; key?: string } = {}): Promise<void> {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO core_jobs (kind, payload, key, run_at, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING')
    .bind(kind, JSON.stringify(payload ?? null), opts.key ?? null, opts.at ?? now, now)
    .run();
}

/** Does what's due, a batch at a time; returns how many ran. `jobs` is the handlers (tests give their own). */
export async function runDueJobs(env: Env, jobs: Jobs = appJobs, now = Date.now()): Promise<number> {
  const claimed = await env.DB.prepare(
    `UPDATE core_jobs SET locked_until = ?1, tries = tries + 1
     WHERE id IN (SELECT id FROM core_jobs WHERE dead = 0 AND run_at <= ?2 AND (locked_until IS NULL OR locked_until < ?2) ORDER BY run_at LIMIT ?3)
     RETURNING id, kind, payload, tries`,
  )
    .bind(now + CLAIM_MS, now, BATCH)
    .all<JobRow>();
  for (const job of claimed.results) {
    const handler = jobs[job.kind];
    try {
      if (!handler) throw new Error(`No handler for job kind "${job.kind}" (src/app/jobs.ts).`);
      await handler(env, JSON.parse(job.payload));
      await env.DB.prepare('DELETE FROM core_jobs WHERE id = ?').bind(job.id).run();
    } catch (e) {
      const message = String((e as Error)?.stack ?? e).slice(0, 2000);
      const dead = job.tries >= MAX_TRIES;
      if (dead) console.error(`Job ${job.kind} (${job.id}) failed ${job.tries} times; kept as dead.`, e);
      await env.DB.prepare('UPDATE core_jobs SET run_at = ?, locked_until = NULL, last_error = ?, dead = ? WHERE id = ?')
        .bind(now + 60_000 * 2 ** (job.tries - 1), message, dead ? 1 : 0, job.id)
        .run();
      if (dead) await onDeadJob?.(env, job.kind, message);
    }
  }
  return claimed.results.length;
}

/** Told when a job gives up (set by the alerting in src/alerts.ts). */
let onDeadJob: ((env: Env, kind: string, message: string) => Promise<void>) | null = null;
export const whenJobDies = (fn: typeof onDeadJob) => void (onDeadJob = fn);
