# backend-cloudflare

The starter API on Cloudflare Workers: [Hono](https://hono.dev) for routing, D1 for data, R2 for
photos. Beside signing in and the account, it has the optional parts an app switches on
(`/features`): notifications and push, teams, the admin area, contact and feedback, and error
reports. It implements `../contract/openapi.yaml` and is held to it by the tests in
`../contract/tests/`. The requirements behind it are in `../docs/PRD.md`.

## Setup

```bash
npm install
npm run db:migrate          # make the local D1 tables (.wrangler/state)
npm run dev                 # http://localhost:8787/api, dev mail on, everything optional off
```

Node 24 (`.node-version`; the unit tests use `node:sqlite`).

## Commands

```bash
npm run dev        # the Worker locally, with the settings in wrangler.toml and dev mail on
npm run dev:all    # the same with every option on: email codes, Turnstile test keys, Google with
                   # a dummy client, confirmed email required, teams, the admin area
                   # (ADMIN_EMAILS=admin@example.test) and push with dev VAPID keys
                   # (scripts/dev-all.mjs, DEV ONLY; extra args go to wrangler dev)
npm run db:migrate # apply migrations/ to the local database
npm run check      # tsc
npm test           # unit tests (password hash, limits, codes, push encryption, reports, sessions, teams)
npm run vapid      # print a new VAPID key pair
npm run setup      # a new project on Cloudflare (see "Deploying"); needs `wrangler login`
npm run deploy     # scripts/predeploy.mjs (refuses a wrangler.toml still set for localhost, the
                   # template's APP_NAME, example.com mail, no Turnstile, missing secrets),
                   # then remote migrations, then wrangler deploy
```

## Running the contract tests

With the Worker running (`npm run dev` or `npm run dev:all`), in another shell:

```bash
cd ../contract
npm install
API_URL=http://localhost:8787/api npm test
```

The tests read `/auth/methods` and `/features` and run or skip the optional parts to match, so run
them against both `npm run dev` and `npm run dev:all`. The admin tests sign in as
`admin@example.test` (contract `ADMIN_EMAIL`), which `dev:all` lists in `ADMIN_EMAILS`; the
account is made on the first run and kept. `dev:all` shortens the gap between resends of an
invite to 2 seconds (`INVITE_RESEND_GAP_S`), so the teams test that resends one waits only that. They need `/api/dev/mail`, which is there only with
`DEV_MAIL` on and no `RESEND_API_KEY`. The local database keeps what earlier runs made; the tests
use fresh addresses each time, so it never needs clearing (delete `.wrangler/state` if you want
to start empty, then `npm run db:migrate`). To run on a throwaway database instead:
`npx wrangler d1 migrations apply DB --local --persist-to /tmp/x` and `npm run dev -- --persist-to /tmp/x`.

## Settings

Plain settings are `[vars]` in `wrangler.toml`. Secrets go in with `npx wrangler secret put NAME`
for a deployed Worker, and in `.dev.vars` (never committed) locally. `npm run dev` and
`npm run dev:all` set their extras with `--var` flags instead.

| Setting | Kind | What it does |
| --- | --- | --- |
| `APP_NAME` | var | The app's own name, lower case, digits and dashes. It's the `saltPrefix` in `/auth/methods`, which salts every password key, so **never change it once people have passwords**. |
| `APP_TITLE` | var | The name people see: email subjects, the passkey's site name. Defaults to `APP_NAME`. |
| `ALLOWED_ORIGINS` | var | Comma-separated frontend origins. Browsers from these may call the API (CORS), Google may return to them, and passkeys are checked against them. |
| `RP_ID` | var | The passkey site: a domain whose subdomains share passkeys (`example.com`). `localhost` locally. |
| `EMAIL_CODE` | var | `true` turns on signing in by emailed code. Off by default: each one is an email from the quota. Off, `/auth/code/*` is 404. |
| `REQUIRE_VERIFIED_EMAIL` | var | `true` sends a confirmation code at sign-up and makes `requireVerifiedEmail` answer `email_unverified` on the app's own routes until the email is confirmed. Off by default. |
| `TURNSTILE_SITE_KEY` | var | Cloudflare Turnstile's public key. With `TURNSTILE_SECRET`, the CAPTCHA is on for sign-up, sign-in, forgot password and sending codes (the email-change code too). A token passes only if it was made on one of `ALLOWED_ORIGINS`' hosts. |
| `TURNSTILE_SECRET` | secret | Turnstile's secret key. The test secrets work only on a local API. |
| `GOOGLE_CLIENT_ID` | var | With `GOOGLE_CLIENT_SECRET`, signing in with Google is on. Off, `/auth/oauth/google/*` is 404. |
| `GOOGLE_CLIENT_SECRET` | secret | Google's client secret. |
| `RESEND_API_KEY` | secret | Sends mail through Resend. Set, `/dev/mail` is 404 whatever `DEV_MAIL` says. |
| `MAIL_FROM` | var | Who mail comes from, e.g. `Starter <hello@example.com>`, on a domain verified at Resend. |
| `DEV_MAIL` | dev flag | Local development only (the API on localhost): with no `RESEND_API_KEY`, mail is kept at `/api/dev/mail` (newest last, at most 500) instead of sent, and every per-network limit is off so test runs don't lock themselves out. Never in `wrangler.toml`: `npm run dev` and `dev:all` pass it with `--var`, so a deploy can't carry it. |
| `APP_URL` | var | The frontend's address, for links in emails (invites go to `<APP_URL>/invite?token=…`). Empty: the first of `ALLOWED_ORIGINS`. |
| `TEAMS` | var | `true` turns on teams (`/teams`, `/invites`). Off, they're 404. |
| `SYNC` | var | `true` turns on offline data (`/sync/*`, [Sync](#sync)). Off, it's 404. |
| `MIN_CLIENT` | var | The oldest frontend build still served (ISO 8601). Older copies of the app get `client_outdated` and are asked to update; raise it when a change would break copies installed before it. Unset, all are served. |
| `ADMIN` | var | `true` turns on the admin area (`/admin/*`, `/auth/support/exchange`). Off, they're 404 and nobody is `isAdmin`. |
| `ADMIN_EMAILS` | var | Comma-separated emails of the app's admins. An account is an admin only once its email is confirmed. |
| `VAPID_PUBLIC_KEY` | var | With `VAPID_PRIVATE_KEY`, push is on; `/features` gives this key to browsers. Make the pair once with `npm run vapid` (setup does it). A new pair ends every subscription. |
| `VAPID_PRIVATE_KEY` | secret | The private half (the P-256 scalar `d`, base64url). |
| `VAPID_SUBJECT` | var | The contact push services see: `mailto:` or `https:`. Empty: `mailto:<CONTACT_EMAIL>`, else `APP_URL`. Apple refuses pushes without a real one. |
| `CODE_PEPPER` | secret | The key emailed codes are stored HMAC'd with, so a leaked database doesn't give codes away. `npm run setup` makes a random one. Without it a local API uses a fixed dev value and a deployed one can't send codes. |
| `PUSH_EXTRA_HOSTS` | dev flag | Local only: extra push hosts besides the browsers' push services (`dev:all`: `push.invalid`, for the contract tests). Ignored by a deployed Worker. |
| `INVITE_RESEND_GAP_S` | dev flag | Local only: seconds between sends of one invite (60 otherwise; `dev:all`: 2). |
| `CONTACT_EMAIL` | var | Contact messages and feedback are also emailed here (each one an email from the quota). Empty: kept for the admin area only. |

Bindings (`wrangler.toml`): `DB` (D1), `PHOTOS` and `FILES` (the same R2 bucket: photos under
`photos/`, synced files under `sync/`), `SPACES` (the sync's Durable Objects), `LIMITER` (Cloudflare's rate limiting, 60
requests a minute per network on the routes anyone can call; off with `DEV_MAIL`). Workers logs
(`[observability]`) are on: Cloudflare keeps console output and uncaught errors.

### Sync

Offline data (PRD section 11; the rules every table follows are in `../docs/offline-data.md`).
Each space, a person's own data or a team's, is one Durable Object (`src/sync/space.ts`) with
its own SQLite storage. Cloudflare runs each object on its own and gives it one request at a
time, so a space's changes apply strictly in the order they arrive while every other space
carries on beside it: no shared queue, and no single database every device writes to. D1 keeps
the accounts; the synced records never touch it.

- `POST /sync/push`: at most 100 changes and 256 KB a batch, applied in order in one
  transaction. Ids come from the device and are kept. Each change id is remembered for 31 days,
  so a batch sent again after a lost reply is applied once. `put` merges fields, the later one
  winning (by arrival, never the devices' clocks); `delete` leaves a marker (the last fields are
  kept in the object, so a record can be restored); a `put` to a marker is refused with
  `conflict`. Each record has a `version`; a change says which it was made on (`base`).
- **The app's rules** are in `src/app/sync.ts`, the app's own file (the core never changes it):
  per table, `guard` lists fields where a stale edit is refused with `conflict` instead of
  merged (a dose, an amount), and `check` refuses a change with the app's own message (a
  missing field; only a team admin deletes). `onlyListed` refuses unknown tables, and
  `afterApply` copies what went in elsewhere (a D1 table for reports). Each record keeps who
  made and last changed it and the session (device) it came through.
- **The object's tables are versioned** (`MIGRATIONS` in `src/sync/store.ts`): each object
  brings itself up to date the first time it wakes after a release. Add steps at the end; never
  edit one.
- `GET /sync/pull?since=`: pages of up to 200 records or about 256 KB, in the order they last
  changed, with the cursor to come back with.
- Files: `POST /sync/files` starts an R2 multipart upload; parts of 8 MiB go through the Worker
  (`PUT /sync/files/{id}/parts/{n}`), then `POST .../complete`. At most 1 GiB a file.
- Limits, per person in a space: 60 pushes, 300 pulls and 600 file calls a minute (counted in
  the object's memory, so they cost no writes); 10,000 changes and 2 GiB of files a day (kept in
  its storage). Over any, or when the object is overloaded, `rate_limited` with `Retry-After`,
  and nothing is applied. Workers Free allows 100,000 rows written a day across the app (each
  change is about three) and 10 ms of CPU a request, which is why batches are small: raise the
  limits in `src/sync/store.ts` and `space.ts` with the plan.
- Deleting an account wipes its space and those of the teams it was alone in; deleting a team
  wipes the team's. A wiped space keeps a mark and refuses everything after, so a request that
  was already on its way can't start it again. If R2 drops an unfinished upload, the next part
  starts a new one and the device sends the parts again. The synced data isn't in `/me/export`: it can be large, and the app reads it
  through `/sync/pull`.

### Push

Web Push with no third party and no SDK (`src/push.ts`, `src/vapid.ts`): each notification's
title, text and link are encrypted for the one browser (RFC 8291, aes128gcm) and signed with the
app's VAPID key (RFC 8292), then sent straight to the browser's push service. A 404 or 410 from
the service forgets that browser. Only the browsers' push services (Google, Mozilla, Microsoft,
Apple) are accepted as endpoints. Push never replaces the in-app list: every notification is kept
there (90 days) whether or not it was pushed. `POST /me/push/test` waits for delivery; other
pushes (an invite) finish after the reply. A subscription belongs to the session that turned it
on: once that device is signed out (or ended from another device), it gets nothing more.

### Admins and support sessions

Admins are the confirmed accounts in `ADMIN_EMAILS` (with `ADMIN = "true"`). They find people,
suspend them (every session ends; every way of signing in answers `account_suspended`), delete
them, and open support sessions: `POST /admin/users/{id}/support` gives a code good once for 60
seconds, which the frontend trades at `/auth/support/exchange` in a tab of its own for an hour-long
session as that person. A support session can use the app but gets `forbidden` on every account and
security path and on `/admin`. Admins never act on another admin. Each support session,
suspension, unsuspension and deletion is in the audit log, kept a year.

### Error reports

`/telemetry/errors` (the frontend's uncaught errors), `/telemetry/csp` (CSP violation reports) and
the Worker's own 500s go to one table, a row per signature with a count, trimmed daily to the 500 most
recently seen. At most 5 CSP reports are kept from one request; reports are limited to 120 an
hour per network and 2,000 requests a day for the app, and over either nothing is written. The
admin area reads them at `/admin/errors`.

### Turnstile locally

Turnstile's always-pass test keys: site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`. With them, any token passes, including the dummy
`XXXX.DUMMY.TOKEN.XXXX` the contract tests send; a missing token is still `captcha_failed`. The
Worker calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` even locally, so it needs
the internet. They report the hostname `example.com`, so only a local API (http://localhost or
127.0.0.1) takes them, without the hostname check; a deployed one refuses them.

### Google

Make an OAuth client (Web application) in the Google Cloud console with the redirect URI
`https://<api host>/api/auth/oauth/google/callback` (locally
`http://localhost:8787/api/auth/oauth/google/callback`). The frontend links to
`/api/auth/oauth/google/start?return=<its callback page>`; that page's origin must be in
`ALLOWED_ORIGINS`. It comes back with `?code=` (trade it at `/auth/oauth/exchange` within 60
seconds) or `?error=oauth_denied | oauth_no_email | oauth_failed`. Only an email Google has
verified signs in. No SDK: two fetches, in `src/routes/oauth.ts`.

## Passwords

The browser sends a `passwordKey`, 600,000 rounds of PBKDF2 made on the device
(`../contract/password.ts`). The Worker stores a salted hash of it, never the key:
`pbkdf2-sha256$10$<16-byte salt>$<hash>` (`src/password.ts`). Ten rounds are enough because
guessing has to go through the browser's 600,000 first; the string names its algorithm and
rounds, so they can be raised later, and a sign-in with an older setting stores a new hash.
Compared in constant time.

Measured cost of checking one: about **0.03 to 0.04 ms of CPU** (Node 24 on Apple silicon, Web
Crypto; `npm test` prints it), against the 10 ms per request Workers Free allows. 1,000 rounds
would still be only 0.15 ms.

## Building on it

The core is fixed; an app adds beside it, in files that are its own. A later release of the
template replaces the core's files and never touches these, so its fixes merge without hand
work:

| File                  | What goes in it                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `src/app/routes.ts`   | the app's paths (written in `../contract/app.yaml` first), mounted after the core's               |
| `src/app/account.ts`  | the app's rows in `/me/export`, and deleting them with an account or a team                       |
| `src/app/sync.ts`     | checks and guarded fields for synced tables ([Sync](#sync))                                       |
| `migrations/1000_…`   | the app's tables, numbered from 1000; 0001 to 0999 are the core's                                 |

The core's D1 tables are all named `core_…` (`core_users`, `core_sessions`, `core_teams`…), so
the app's can have the plain names it wants (`messages`, `members`, `notes`).

`requireUser` gives a route the signed-in person; `requireVerifiedEmail` after it holds back
anyone who hasn't confirmed their email when `REQUIRE_VERIFIED_EMAIL` is on (403
`email_unverified`, which the frontend answers by offering a code). The core routes never use
it, so people can always confirm, change their address, or leave.

```ts
// src/app/routes.ts
import { requireUser, requireVerifiedEmail } from '../middleware';

appRoutes.get('/notes', requireUser, requireVerifiedEmail, async (c) => {
  const { ctx, user } = c.var; // ctx.db, ctx.env, ctx.cfg; user is the D1 row
  const notes = await ctx.env.DB.prepare('SELECT id, text FROM notes WHERE user_id = ?').bind(user.id).all();
  return c.json({ notes: notes.results });
});
```

**Deleting and exporting.** Whatever the app keeps of a person goes in `src/app/account.ts`:
`deleteUserStatements` (D1 statements run in the same batch as the core's deletion, so it's all
or none), `afterDeleteUser` for anything outside D1, and `exportUser` for `/me/export`; the
same for teams. What's outside D1 (photos, synced data, the app's own) is written down in
`core_cleanups` with the deletion, done straight after, and finished by the daily sweep if
anything failed on the way.

Throw a `Refusal` (`src/errors.ts`) for anything the person should see; it becomes the contract's
`{ code, message }`. Put the app's queries in `src/db/` too if it might move to another cloud.

Tables whose records can be made offline (on several devices at once) follow
[`docs/offline-data.md`](../docs/offline-data.md): keep the `TEXT` id the device sent, never
replace it with an auto-increment, give readable numbers in their own column, and flag clashes
such as a slot booked twice instead of refusing the second.

## Deploying

Not done from this template. For a new project, in its own Cloudflare account:

1. In `wrangler.toml`: `name`, `APP_NAME`, `APP_TITLE`, `ALLOWED_ORIGINS`, `RP_ID`, `MAIL_FROM`,
   the database and bucket names, and the switches (`TEAMS`, `ADMIN`, `ADMIN_EMAILS`, …).
2. `npx wrangler login`, then `npm run setup` (`scripts/setup.mjs`). It makes the D1 database and
   R2 bucket (or finds them), writes the database id into `wrangler.toml`, makes the VAPID pair
   once (public key into `wrangler.toml`, private key as a secret), asks for the Resend, Turnstile
   and Google secrets (Enter skips one) and puts them, applies the migrations remotely, and prints
   what's left by hand: the Turnstile widget, the Resend domain, the Google OAuth client, the
   admin emails. Safe to run again.
3. `npm run deploy`: checks wrangler.toml (no localhost origins or RP_ID, a real database id),
   then remote migrations, then the Worker.
