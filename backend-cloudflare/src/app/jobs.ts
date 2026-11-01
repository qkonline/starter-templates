// THE APP'S OWN FILE: its background jobs, by kind. The core reads this and never changes it.
//
// Enqueue from a route with `enqueue(ctx.env, 'kind', payload, { at, key })` (src/jobs.ts); the
// cron that runs every minute does what's due, and tries a failed one again later (after 1, 2,
// 4… minutes, up to 8 tries, then it's kept as dead and reported to the admin area's errors).
// A handler must be safe to run twice: a Worker can stop after the work and before it's marked
// done. Each run has the Worker's limits (Workers Free: 10 ms of CPU, 50 subrequests).
//
//   export const appJobs: Jobs = {
//     'remind-appointment': async (env, payload) => {
//       const { userId, at } = payload as { userId: string; at: string };
//       ...
//     },
//   };

import type { Jobs } from '../jobs';

export const appJobs: Jobs = {};
