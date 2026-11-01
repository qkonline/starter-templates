// A D1 database on node:sqlite with the Worker's migrations applied, for unit tests of the parts
// that only need the data layer. As in boardo; no extra dependency.

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { d1 } from '../src/db';
import { config, type Ctx, type Env } from '../src/env';
import { Refusal } from '../src/errors';
import type { AppEnv } from '../src/middleware';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url).href);

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(dir + f, 'utf8'));
  const statement = (query: string, args: unknown[] = []) => ({
    query,
    bind: (...b: unknown[]) => {
      // As D1 does: at most 100 bound values in one statement.
      if (b.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${b.length})`);
      return statement(query, b);
    },
    async first<T>() {
      const row = db.prepare(query).get(...(args as never[]));
      return (row ? { ...row } : null) as T | null;
    },
    async all<T>() {
      return { results: db.prepare(query).all(...(args as never[])).map((r) => ({ ...r })) as T[] };
    },
    async run() {
      const r = db.prepare(query).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  type Statement = ReturnType<typeof statement>;
  // One transaction, as D1's is; statements with RETURNING give their rows.
  const batch = async (list: Statement[]) => {
    const out = [];
    db.exec('BEGIN');
    try {
      for (const st of list)
        if (/\bRETURNING\b/i.test(st.query)) {
          const { results } = await st.all();
          out.push({ results, meta: { changes: results.length } });
        } else out.push(await st.run());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return out;
  };
  return { db, d1: { prepare: (q: string) => statement(q), batch } as unknown as D1Database };
}

/** A request context on a fresh fake database, with these settings; `api` is local unless given. */
export function fakeCtx(vars: Partial<Env> = {}, opts: { api?: string } = {}) {
  const f = fakeD1();
  const env = { DB: f.d1, APP_NAME: 'test', ALLOWED_ORIGINS: 'http://localhost:5173', ...vars } as Env;
  const api = opts.api ?? 'http://localhost:8787/api';
  const ctx: Ctx = { env, cfg: config(env, api), db: d1(f.d1), ip: '192.0.2.1', network: '192.0.2.1', api };
  return { ...f, env, ctx };
}

/** Route files mounted on `ctx`, as index.ts mounts them, with refusals answered as the contract's errors. */
export function fakeApp(ctx: Ctx, ...routes: Hono<AppEnv>[]) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('ctx', ctx);
    await next();
  });
  for (const r of routes) app.route('/', r);
  app.onError((e, c) => (e instanceof Refusal ? c.json({ code: e.code, message: e.message }, e.status) : c.json({ code: 'server_error', message: String(e) }, 500)));
  return app;
}
