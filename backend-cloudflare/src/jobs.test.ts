import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { alert } from './alerts';
import { enqueue, runDueJobs, whenJobDies } from './jobs';

afterEach(() => vi.unstubAllGlobals());

describe('background jobs', () => {
  it('runs what is due, once, and leaves what is later', async () => {
    const { env, db } = fakeCtx();
    const done: unknown[] = [];
    const jobs = { hello: async (_: unknown, p: unknown) => void done.push(p) };
    const now = 1_800_000_000_000;
    await enqueue(env, 'hello', { n: 1 }, { at: now - 1 });
    await enqueue(env, 'hello', { n: 2 }, { at: now + 60_000 });
    // The same key twice is one job.
    await enqueue(env, 'hello', { n: 3 }, { at: now - 1, key: 'k' });
    await enqueue(env, 'hello', { n: 4 }, { at: now - 1, key: 'k' });
    expect(await runDueJobs(env, jobs, now)).toBe(2);
    expect(done).toEqual([{ n: 1 }, { n: 3 }]);
    expect(await runDueJobs(env, jobs, now)).toBe(0);
    expect(await runDueJobs(env, jobs, now + 60_000)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM core_jobs').get()).toEqual({ n: 0 });
  });

  it('a failing job waits longer each time, then is kept as dead and said', async () => {
    const { env, db } = fakeCtx();
    const died: string[] = [];
    whenJobDies(async (_, kind) => void died.push(kind));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    let now = 1_800_000_000_000;
    await enqueue(env, 'flaky', null, { at: now });
    const jobs = { flaky: async () => Promise.reject(new Error('down')) };
    for (let i = 0; i < 8; i++) {
      expect(await runDueJobs(env, jobs, now)).toBe(1);
      const row = db.prepare('SELECT run_at, tries, dead FROM core_jobs').get() as { run_at: number; tries: number; dead: number };
      expect(row.run_at - now).toBe(60_000 * 2 ** i);
      now = row.run_at;
    }
    expect(db.prepare('SELECT dead, last_error FROM core_jobs').get()).toMatchObject({ dead: 1, last_error: expect.stringContaining('down') });
    expect(died).toEqual(['flaky']);
    expect(await runDueJobs(env, jobs, now + 1e9)).toBe(0);
    whenJobDies(null);
    quiet.mockRestore();
  });
});

describe('alerts', () => {
  it('kept with the error reports; posted to the webhook at most once an hour for the same problem', async () => {
    const { env, ctx } = fakeCtx({ ALERT_WEBHOOK: 'https://hooks.example.com/x' });
    const fetch = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    const now = 1_800_000_000_000;
    await alert(env, 'Mail is down', 'Resend 500', 'Resend', now);
    await alert(env, 'Mail is down', 'Resend 500', 'Resend', now + 1000);
    await alert(env, 'Mail is down', 'Resend 500', 'Resend', now + 3_600_000 + 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body).text).toContain('Mail is down');
    expect((await ctx.db.reports(null, 10)).map((r) => [r.message, r.count])).toEqual([['Mail is down', 3]]);
  });

  it('never posts to anything but https elsewhere', async () => {
    const { env } = fakeCtx({ ALERT_WEBHOOK: 'http://localhost/x' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await alert(env, 'x', 'y', 'z');
    expect(fetch).not.toHaveBeenCalled();
  });
});
