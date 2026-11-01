// The whole app's daily totals for synced data: changes, and file bytes started (PRD R11.4).
// One small Durable Object per UTC day (`meter:<day>`); each space's object adds what it took in
// about once a minute (space.ts, `metered`) and remembers the answer, so the meter sees a request
// a minute per busy space, never one per change, and nothing queues behind it.
//
// The caps are SYNC_APP_CHANGES_PER_DAY and SYNC_APP_FILE_BYTES_PER_DAY. They're there for what
// the plan costs: R2 holds 10 GB free and bills beyond it, and Durable Object storage is billed
// too. Over either, spaces answer `rate_limited` until the next UTC day.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

export interface Totals {
  changes: number;
  bytes: number;
}

export class SyncMeter extends DurableObject<Env> {
  /** Adds to today's totals; whether either is now over its cap. */
  async add(changes: number, bytes: number, caps: Totals): Promise<{ over: boolean; totals: Totals }> {
    const totals = (await this.ctx.storage.get<Totals>('totals')) ?? { changes: 0, bytes: 0 };
    totals.changes += changes;
    totals.bytes += bytes;
    await this.ctx.storage.put('totals', totals);
    return { over: totals.changes >= caps.changes || totals.bytes >= caps.bytes, totals };
  }
}
