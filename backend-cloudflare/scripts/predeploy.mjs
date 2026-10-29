#!/usr/bin/env node
// Run by `npm run deploy` before anything reaches Cloudflare: refuses to deploy wrangler.toml as
// the template left it, which would give the world an API that only localhost may call, passkeys
// for localhost, and no database.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const toml = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8');
const value = (name) => toml.match(new RegExp(`^${name}\\s*=\\s*"(.*)"`, 'm'))?.[1];
const problems = [];

const origins = (value('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const deployable = origins.filter((o) => {
  try {
    const url = new URL(o);
    return url.protocol === 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  } catch {
    return false;
  }
});
if (!deployable.length) problems.push('ALLOWED_ORIGINS has no https origin that isn\'t localhost: put the frontend\'s address(es).');

const rp = value('RP_ID') ?? '';
if (!rp || rp === 'localhost' || rp === '127.0.0.1') problems.push('RP_ID is localhost: put the frontend\'s domain (passkeys belong to it).');

const dbId = value('database_id') ?? '';
if (!dbId || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(dbId)) problems.push('database_id is the placeholder: run `npm run setup` first.');

if (problems.length) {
  console.error(`Not deploying; wrangler.toml isn't ready:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('wrangler.toml looks ready to deploy.');
