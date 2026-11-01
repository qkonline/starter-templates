// Deleting an account or a team, everywhere it is: D1 (the core's rows and the app's, in one
// batch), and then what's outside D1: photos in R2, synced data in its Durable Object, and
// whatever the app keeps elsewhere (src/app/account.ts). Those later steps are written down in
// the same batch (`core_cleanups`), done straight after, and finished by the daily sweep if any
// failed on the way, so a timeout never leaves part of a deleted account behind.

import { appAccount } from './app/account';
import type { CleanupKind, CleanupRow } from './db';
import { d1 } from './db';
import type { Ctx, Env } from './env';
import { alert } from './alerts';
import { clearPhotos } from './photos';

type Job = { kind: CleanupKind; target: string };

/** The account, everything kept with it, and the teams it was alone in. */
export async function deleteAccount(ctx: Ctx, userId: string): Promise<void> {
  const { db, env } = ctx;
  // Teams it's alone in go with it (Db.deleteUser), whatever the switches say now.
  const solo = (await db.teamsOf(userId)).filter((t) => t.member_count === 1).map((t) => t.id);
  const jobs: Job[] = [
    { kind: 'photos', target: userId },
    { kind: 'app-user', target: userId },
    ...solo.map((id) => ({ kind: 'app-team' as const, target: id })),
    ...(ctx.cfg.sync ? [`user:${userId}`, ...solo.map((id) => `team:${id}`)].map((s) => ({ kind: 'space' as const, target: s })) : []),
  ];
  await db.deleteUser(userId, [
    ...appAccount.deleteUserStatements(env.DB, userId),
    ...solo.flatMap((id) => appAccount.deleteTeamStatements(env.DB, id)),
    ...db.cleanupStatements(jobs, Date.now()),
  ]);
  await runCleanups(env, await db.cleanups({ targets: jobs.map((j) => j.target) }));
}

/** The team, its members and invites, the app's rows for it, and its synced data. */
export async function deleteTeam(ctx: Ctx, teamId: string): Promise<void> {
  const { db, env } = ctx;
  const jobs: Job[] = [{ kind: 'app-team', target: teamId }, ...(ctx.cfg.sync ? [{ kind: 'space' as const, target: `team:${teamId}` }] : [])];
  await db.deleteTeam(teamId, [...appAccount.deleteTeamStatements(env.DB, teamId), ...db.cleanupStatements(jobs, Date.now())]);
  await runCleanups(env, await db.cleanups({ targets: jobs.map((j) => j.target) }));
}

async function cleanUp(env: Env, job: CleanupRow): Promise<void> {
  if (job.kind === 'photos') await clearPhotos(env.PHOTOS, job.target);
  else if (job.kind === 'space') await env.SPACES.get(env.SPACES.idFromName(job.target)).wipe(job.target);
  else if (job.kind === 'app-user') await appAccount.afterDeleteUser(env, job.target);
  else if (job.kind === 'app-team') await appAccount.afterDeleteTeam(env, job.target);
}

/** Does each; one that fails stays for the next sweep (and is logged). */
export async function runCleanups(env: Env, jobs: CleanupRow[]): Promise<void> {
  const db = d1(env.DB);
  for (const job of jobs) {
    try {
      await cleanUp(env, job);
      await db.cleanupDone(job.id);
    } catch (e) {
      console.error('cleanup failed; the daily sweep tries again', job.kind, job.target, e);
      await db.cleanupFailed(job.id).catch(() => {});
      // Third time: something is wrong that waiting won't fix.
      if (job.tries + 1 >= 3)
        await alert(env, `Deleting ${job.kind} keeps failing`, String((e as Error)?.stack ?? e), `cleanup ${job.kind} ${job.target}`);
    }
  }
}

/** The daily sweep's share: what earlier deletions didn't finish. */
export async function finishCleanups(env: Env): Promise<void> {
  await runCleanups(env, await d1(env.DB).cleanups({ limit: 50 }));
}
