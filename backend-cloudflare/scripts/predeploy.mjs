#!/usr/bin/env node
// Run by `npm run deploy` before anything reaches Cloudflare: refuses to deploy wrangler.toml as
// the template left it, which would give the world an API that only localhost may call, passkeys
// for localhost, and no database; and refuses what can't be put right once people sign up: the
// template's password salt (APP_NAME), mail from example.com, no CAPTCHA, no CODE_PEPPER.
//
// PREDEPLOY_SKIP_SECRETS=1 skips checking the secrets (when `wrangler secret list` can't run).
// `--config wrangler.staging.toml` checks staging's, and that it has the same settings and
// bindings as wrangler.toml (values may differ), so staging tests what production will run.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const configArg = process.argv.indexOf('--config');
const CONFIG = configArg > 0 ? process.argv[configArg + 1] : 'wrangler.toml';
const fileOf = (name) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
const toml = fileOf(CONFIG);
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

const app = value('APP_NAME') ?? '';
if (!/^[a-z0-9-]{1,40}$/.test(app) || app === 'starter')
  problems.push(
    'APP_NAME is the template\'s ("starter") or not lower case letters, digits and dashes: give the app its own name. It salts every password, so it can never change once people sign up.',
  );

const from = value('MAIL_FROM') ?? '';
if (!/<[^@\s>]+@[^@\s>]+\.[^@\s>]+>$|^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from) || /@example\.(com|org|net)\b/i.test(from))
  problems.push('MAIL_FROM is the template\'s example.com: put an address on a domain Resend has verified for this app.');

const site = value('TURNSTILE_SITE_KEY') ?? '';
if (!site || /^[123]x0{10,}/.test(site))
  problems.push(
    'TURNSTILE_SITE_KEY is empty or one of Turnstile\'s test keys: the CAPTCHA guards sign-up, sign-in and every route that sends mail; make a widget for the domain.',
  );

// The core's migrations are 0001 to 0999; an app's start at 1000, so a later release's never collide.
const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const n = Number(f.match(/^(\d+)_/)?.[1] ?? NaN);
  if (Number.isNaN(n)) problems.push(`migrations/${f} isn't numbered: name it NNNN_what.sql (an app's from 1000).`);
}

// Staging must run what production runs: the same vars, bindings, migrations and crons.
if (CONFIG !== 'wrangler.toml') {
  const shape = (t) => ({
    vars: [...(t.split(/^\[/m).find((s) => s.startsWith('vars]')) ?? '').matchAll(/^([A-Z_]+)\s*=/gm)].map((m) => m[1]).sort(),
    bindings: [...t.matchAll(/^(?:binding|name) = "([A-Z_]+)"/gm)].map((m) => m[1]).sort(),
    rest: [...t.matchAll(/^(compatibility_date|main|migrations_dir|new_sqlite_classes|tag|crons) = (.*)$/gm)].map((m) => m[0]).sort(),
  });
  const [a, b] = [shape(fileOf('wrangler.toml')), shape(toml)];
  for (const k of Object.keys(a))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      problems.push(`${CONFIG} differs from wrangler.toml in its ${k}: ${JSON.stringify(b[k])} vs ${JSON.stringify(a[k])}. Keep the two alike but for names and values.`);
}

if (process.env.PREDEPLOY_SKIP_SECRETS !== '1') {
  let names = null;
  try {
    const out = execFileSync('npx', ['wrangler', 'secret', 'list', '--format', 'json', '-c', CONFIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    names = new Set(JSON.parse(out).map((s) => s.name));
  } catch {
    problems.push("Couldn't list the Worker's secrets (`npx wrangler login`?). PREDEPLOY_SKIP_SECRETS=1 skips this check.");
  }
  if (names) {
    for (const [name, why] of [
      ['CODE_PEPPER', 'emailed codes are refused without it (npm run setup makes it)'],
      ['TURNSTILE_SECRET', 'the CAPTCHA is off without it'],
      ['RESEND_API_KEY', 'no email goes out without it: forgot password, confirming addresses'],
    ])
      if (!names.has(name)) problems.push(`The secret ${name} isn't set: ${why}. \`npx wrangler secret put ${name}\`.`);
  }
}

if (problems.length) {
  console.error(`Not deploying; ${CONFIG} isn't ready:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`${CONFIG} looks ready to deploy.`);
