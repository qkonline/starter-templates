#!/usr/bin/env node
// Sets up a new project on Cloudflare (PRD R8.1), from a fresh account where `npx wrangler login`
// has been done. Safe to run again: what exists is found and kept.
//
//   1. makes the D1 database and the R2 bucket named in wrangler.toml, and writes the database's
//      id into wrangler.toml;
//   2. makes the VAPID key pair for push (once: a new pair would end every browser's
//      subscription), the public key into wrangler.toml, the private key as a secret; and
//      CODE_PEPPER, the random secret emailed codes are stored keyed with (once);
//   3. asks for the other secrets (Resend, Turnstile, Google), blank to skip, typed unseen, and
//      puts them;
//   4. applies the migrations to the remote database;
//   5. says what has to be done by hand.
//
// Before running it, set in wrangler.toml: `name`, APP_NAME (never changed once people have
// passwords), APP_TITLE, ALLOWED_ORIGINS, RP_ID, MAIL_FROM, the database and bucket names, and the
// switches. Then `npm run setup`, and `npm run deploy`.
//
// Staging: `npm run setup:staging` does the same for wrangler.staging.toml (its own Worker,
// database and bucket), then `npm run deploy:staging`.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vapidKeys } from './vapid.mjs';

// `--config wrangler.staging.toml` sets up staging instead.
const configArg = process.argv.indexOf('--config');
const CONFIG = configArg > 0 ? process.argv[configArg + 1] : 'wrangler.toml';
const TOML = fileURLToPath(new URL(`../${CONFIG}`, import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));

const say = (s = '') => console.log(s);
const fail = (s) => {
  console.error(`\n${s}`);
  process.exit(1);
};

/** Runs wrangler; its output, or exits with what it said, unless `allowFail`. */
function wrangler(args, { input, allowFail = false } = {}) {
  const r = spawnSync('npx', ['wrangler', ...args, '-c', CONFIG], { cwd, encoding: 'utf8', input, stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'] });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0 && !allowFail) fail(`wrangler ${args.join(' ')} failed:\n${out}`);
  return { ok: r.status === 0, out };
}

/** Asks for a secret without showing what's typed (or pasted). Enter ends it; Ctrl-C stops setup. */
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') return finish();
        if (c === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

let toml = readFileSync(TOML, 'utf8');
const read = (re) => toml.match(re)?.[1];
const save = () => writeFileSync(TOML, toml);

/** Sets a [vars] value in wrangler.toml. */
function setVar(name, value) {
  const re = new RegExp(`^${name} = ".*"$`, 'm');
  if (!re.test(toml)) fail(`${CONFIG} has no ${name} line under [vars].`);
  toml = toml.replace(re, `${name} = "${value}"`);
  save();
}

// 0. Signed in, and the settings that must not stay as the template's.
say('Checking the Cloudflare login…');
const who = wrangler(['whoami'], { allowFail: true });
if (!who.ok || /not authenticated|You are not/i.test(who.out)) fail('Not signed in to Cloudflare. Run `npx wrangler login` first.');

const worker = read(/^name = "(.+)"$/m);
const dbName = read(/database_name = "(.+)"/);
const bucket = read(/bucket_name = "(.+)"/);
if (!worker || !dbName || !bucket) fail('wrangler.toml needs name, database_name and bucket_name.');
for (const [name, template] of [
  ['APP_NAME', 'starter'],
  ['ALLOWED_ORIGINS', 'http://localhost:5180,http://localhost:4180,http://localhost:5173,http://localhost:4173'],
  ['RP_ID', 'localhost'],
]) {
  if (read(new RegExp(`^${name} = "(.*)"$`, 'm')) === template) say(`Note: ${name} is still the template's value; set it before deploying.`);
}

// 1. D1 and R2.
say(`\nThe D1 database "${dbName}"…`);
let dbId = read(/database_id = "(.+)"/);
if (!dbId || /^0{8}-/.test(dbId)) {
  const made = wrangler(['d1', 'create', dbName], { allowFail: true });
  dbId = made.out.match(/database_id["\s:=]+"([0-9a-f-]{36})"/)?.[1];
  if (!dbId) {
    // It exists already: find its id.
    const list = wrangler(['d1', 'list', '--json']).out;
    const found = JSON.parse(list.slice(list.indexOf('['))).find((d) => d.name === dbName);
    dbId = found?.uuid;
  }
  if (!dbId) fail(`Couldn't make or find the D1 database "${dbName}".`);
  toml = toml.replace(/database_id = ".*"/, `database_id = "${dbId}"`);
  save();
  say(`  ${dbId}, written to wrangler.toml`);
} else say(`  already in wrangler.toml (${dbId})`);

say(`The R2 bucket "${bucket}"…`);
const r2 = wrangler(['r2', 'bucket', 'create', bucket], { allowFail: true });
if (!r2.ok && !/already exists|already own/i.test(r2.out)) fail(`Couldn't make the R2 bucket:\n${r2.out}`);
say(r2.ok ? '  made' : '  already there');

// 2. Push keys, once.
say('\nPush (VAPID) keys…');
if (read(/^VAPID_PUBLIC_KEY = "(.*)"$/m)) say('  already made; kept (a new pair would end every subscription)');
else {
  const keys = await vapidKeys();
  wrangler(['secret', 'put', 'VAPID_PRIVATE_KEY'], { input: keys.privateKey });
  setVar('VAPID_PUBLIC_KEY', keys.publicKey);
  say('  made: public key in wrangler.toml, private key as the secret VAPID_PRIVATE_KEY');
}

// The pepper for emailed codes, once: a new one only voids the codes sent in the last 10 minutes,
// but there's no reason to change it.
say('The code pepper (CODE_PEPPER)…');
const secrets = wrangler(['secret', 'list'], { allowFail: true });
if (secrets.ok && /"CODE_PEPPER"/.test(secrets.out)) say('  already put; kept');
else {
  wrangler(['secret', 'put', 'CODE_PEPPER'], { input: randomBytes(32).toString('base64url') });
  say('  made and put as the secret CODE_PEPPER');
}

// 3. The other secrets.
if (process.stdin.isTTY) {
  say('\nSecrets (Enter to skip one; they can be put later with `npx wrangler secret put NAME`).');
  say('What you type or paste is not shown.');
  for (const [name, what] of [
    ['RESEND_API_KEY', 'Resend API key (mail: codes, invites)'],
    ['TURNSTILE_SECRET', 'Turnstile secret key (with TURNSTILE_SITE_KEY in wrangler.toml)'],
    ['GOOGLE_CLIENT_SECRET', 'Google OAuth client secret (with GOOGLE_CLIENT_ID in wrangler.toml)'],
  ]) {
    const value = (await askHidden(`  ${what}: `)).trim();
    if (value) {
      wrangler(['secret', 'put', name], { input: value });
      say(`  ${name} put`);
    }
  }
} else say('\nNot a terminal: skipping the questions for RESEND_API_KEY, TURNSTILE_SECRET and GOOGLE_CLIENT_SECRET.');

// 4. The tables.
say('\nApplying migrations to the remote database…');
wrangler(['d1', 'migrations', 'apply', 'DB', '--remote'], { input: 'y\n' });
say('  done');

// 5. By hand.
say(`
Done. What's left by hand:

  1. Turnstile: Cloudflare dashboard > Turnstile > Add widget for the frontend's domain. Put the
     site key in wrangler.toml (TURNSTILE_SITE_KEY) and the secret with
     \`npx wrangler secret put TURNSTILE_SECRET\`.
  2. Resend: add and verify the sending domain (DNS records), make an API key, put it with
     \`npx wrangler secret put RESEND_API_KEY\`, and set MAIL_FROM on that domain.
  3. Google (if used): Google Cloud console > APIs & Services > Credentials > OAuth client ID
     (Web application), redirect URI https://<api host>/api/auth/oauth/google/callback. Client ID
     in wrangler.toml (GOOGLE_CLIENT_ID), secret with \`npx wrangler secret put GOOGLE_CLIENT_SECRET\`.
  4. Admins (if ADMIN = "true"): put their emails in ADMIN_EMAILS. They must confirm their address
     in the app before they're admins.
  5. CONTACT_EMAIL (optional), APP_URL if links in emails should go somewhere other than the
     first allowed origin, and VAPID_SUBJECT (a mailto: or https: contact for push services).
  6. \`npm run deploy\`: checks wrangler.toml is ready (scripts/predeploy.mjs), then migrations,
     then the Worker.
`);
