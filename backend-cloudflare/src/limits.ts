// Rate limits kept in D1: a count per key (an address or a network) in a fixed window. Counting
// and reading the count are one statement (Db.countUse), so many requests at once can't all slip
// under the limit; once a key is at its limit, further tries write nothing until the window ends.

import type { Ctx } from './env';
import { tooMany } from './errors';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** `limit` that answers instead of refusing: false when over, for what's dropped quietly. */
export async function underLimit(ctx: Ctx, key: string, max: number, windowMs: number): Promise<boolean> {
  return (await ctx.db.countUse(key, windowMs, Date.now(), max)).count <= max;
}

/** The same per network; always true in local development. */
export async function underNetworkLimit(ctx: Ctx, key: string, max: number, windowMs: number): Promise<boolean> {
  return ctx.cfg.devMail || underLimit(ctx, `${key}:${ctx.network}`, max, windowMs);
}

/** Counts one use of `key`; refuses with rate_limited once there have been more than `max` in `windowMs`. */
export async function limit(ctx: Ctx, key: string, max: number, windowMs: number, message?: string, now = Date.now()): Promise<void> {
  const { count, start } = await ctx.db.countUse(key, windowMs, now, max);
  if (count > max) throw tooMany(Math.max(1, Math.ceil((start + windowMs - now) / 1000)), message);
}

/**
 * The same per network. Off in local development (dev mail on, no mail provider), where every
 * request comes from one address and a test run would lock itself out.
 */
export async function networkLimit(ctx: Ctx, key: string, max: number, windowMs: number, message?: string): Promise<void> {
  if (ctx.cfg.devMail) return;
  await limit(ctx, `${key}:${ctx.network}`, max, windowMs, message);
}

/** Takes back one use counted by `limit`, for a try that turned out fine (a right password). */
export const uncount = (ctx: Ctx, key: string) => ctx.db.uncountUse(key);

/** The same for `networkLimit`. */
export async function uncountNetwork(ctx: Ctx, key: string): Promise<void> {
  if (!ctx.cfg.devMail) await ctx.db.uncountUse(`${key}:${ctx.network}`);
}
