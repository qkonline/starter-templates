#!/usr/bin/env node
// `npm run backup` (or `npm run backup -- --config wrangler.staging.toml`): the deployed D1
// database, exported as SQL to backups/<database>-<time>.sql (kept out of git). Keep these
// somewhere other than this laptop. D1 Time Travel already lets you go back to any minute of
// the last 30 days (7 on Workers Free) without one; this is for longer, and for leaving
// Cloudflare. docs/operations.md has the restore steps for D1, R2 and the sync objects.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const configArg = process.argv.indexOf('--config');
const config = configArg > 0 ? process.argv[configArg + 1] : 'wrangler.toml';
const db = readFileSync(new URL(`../${config}`, import.meta.url), 'utf8').match(/database_name = "(.+)"/)?.[1];
if (!db) {
  console.error(`No database_name in ${config}.`);
  process.exit(1);
}
mkdirSync(new URL('../backups/', import.meta.url), { recursive: true });
const file = `backups/${db}-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
const r = spawnSync('npx', ['wrangler', 'd1', 'export', 'DB', '--remote', '--output', file, '-c', config], { cwd, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Saved ${file} (${Math.round(statSync(new URL(`../${file}`, import.meta.url)).size / 1024)} KB).`);
