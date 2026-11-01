// The shape of an app's rules for its synced tables; the app's own values are in src/app/sync.ts.

import type { Env } from '../env';
import type { Change } from './store';

/** Who sent a change: the account, the session it came through (one per device), and their role in the team. */
export interface SyncWho {
  user: string;
  session: string;
  /** In a team's space, the person's role; null in their own. */
  role: 'admin' | 'member' | null;
  /** `user:<id>` or `team:<id>`. */
  space: string;
}

export interface SyncRefusal {
  code: 'invalid_input' | 'forbidden';
  message: string;
}

export const refusal = (code: SyncRefusal['code'], message: string): SyncRefusal => ({ code, message });

export interface TableRules {
  /** Fields where a stale edit is refused with `conflict` rather than merged; '*' for all. */
  guard?: readonly string[] | '*';
  /** Before each change to this table: a refusal, or null to apply it. Synchronous, no I/O. */
  check?: (change: Change, current: { fields: Record<string, unknown>; deleted: boolean } | null, who: SyncWho) => SyncRefusal | null;
}

export interface SyncRules {
  /** Refuse changes to tables not in `tables`. */
  onlyListed: boolean;
  tables: Record<string, TableRules>;
  /** After a batch is applied, with what went in. Failures are logged, never undo the batch. */
  afterApply?: (env: Env, space: string, applied: { change: Change; who: SyncWho }[]) => Promise<void>;
}

export const noRules: SyncRules = { onlyListed: false, tables: {} };
