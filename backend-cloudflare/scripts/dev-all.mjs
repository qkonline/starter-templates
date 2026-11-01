#!/usr/bin/env node
// DEV ONLY. `npm run dev:all`: the Worker locally with every optional part on, for the contract
// tests and the frontend's own tests. Extra arguments go on to `wrangler dev` (e.g.
// `npm run dev:all -- --persist-to /tmp/x`).
//
// Everything below is a throwaway value for this machine: Turnstile's public always-pass test
// keys, a dummy Google client, and a VAPID pair made for local use only. None of it is a secret
// anyone relies on, and a deployed Worker refuses or ignores each: the Turnstile test secret
// (captcha.ts), DEV_MAIL, PUSH_EXTRA_HOSTS and INVITE_RESEND_GAP_S (env.ts: local API only).
// `npm run setup` makes the real VAPID pair and puts the real secrets.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vars = {
  DEV_MAIL: 'true',
  EMAIL_CODE: 'true',
  REQUIRE_VERIFIED_EMAIL: 'true',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
  GOOGLE_CLIENT_ID: 'dummy.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'dummy',
  TEAMS: 'true',
  SYNC: 'true',
  ADMIN: 'true',
  ADMIN_EMAILS: 'admin@example.test',
  VAPID_PUBLIC_KEY: 'BJOPnpXUDfLR_LsgcIk1lQWFHwFUbp8XpB5qPExUQbB8FQg4KoVlK75UXLaN28VU3fIGH1bnrFRelGvc1l0LEWg',
  VAPID_PRIVATE_KEY: 'MOWf_qvddYmEA1R5M2Ns84NKXF5-mJesUmmCD_9xSuo',
  VAPID_SUBJECT: 'mailto:dev@example.test',
  // The contract tests subscribe push to https://push.invalid/…, which never resolves.
  PUSH_EXTRA_HOSTS: 'push.invalid',
  // So the teams test waits 2 seconds to resend an invite, not a minute.
  INVITE_RESEND_GAP_S: '2',
  // So the contract tests can check an outdated copy of the app is told to update.
  MIN_CLIENT: '2026-01-01T00:00:00.000Z',
};

const args = ['wrangler', 'dev', ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`]), ...process.argv.slice(2)];
const child = spawn('npx', args, { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
