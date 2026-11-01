# Running an app built from these templates

What to set up before people depend on the app, and what to do when something goes wrong. The
commands are run in `backend-cloudflare/` or `frontend-sveltekit/` as marked.

## Before going live

The first time on Cloudflare at all, do the dry run in [`first-deploy.md`](first-deploy.md).

- [ ] Its own Cloudflare account for the domain, and `npx wrangler login` with it.
- [ ] `wrangler.toml`: `name`, `APP_NAME` (never changed once people have passwords), `APP_TITLE`,
      `ALLOWED_ORIGINS`, `RP_ID`, `MAIL_FROM`, the switches. `npm run setup`, then
      `npm run deploy` (it refuses what can't be put right later: see `scripts/predeploy.mjs`).
- [ ] Staging set up the same way (below), and the release tried there first.
- [ ] `ALERT_WEBHOOK` set (below), and a test alert seen in the channel.
- [ ] Cloudflare Notifications on for the account (below).
- [ ] An uptime check on `https://<api>/api/health` (below).
- [ ] A first backup taken (`npm run backup`), and the restore steps read once.
- [ ] `MIN_CLIENT` understood: raised only when a change would break copies installed before it.

## Staging

A second deployment of the same code, with its own Worker, database, bucket and sync objects, to
try a release on real Cloudflare before production.

```sh
# backend-cloudflare/
#   wrangler.staging.toml: set name, database/bucket names, ALLOWED_ORIGINS (the staging
#   frontend), RP_ID, MAIL_FROM. Same vars and bindings as wrangler.toml (deploy:staging checks).
npm run setup:staging
npm run deploy:staging

# frontend-sveltekit/
#   .env.staging: PUBLIC_API_URL=https://<staging api>/api
npm run deploy:staging     # a Pages deployment on the `staging` branch: staging.<project>.pages.dev
```

Use staging's own Turnstile widget (or add the staging host to production's) and allow its
origin in its backend's `ALLOWED_ORIGINS`. Its data is throwaway: never copy production's
people into it.

**A release** goes: CI green on `main`, then `deploy:staging` (backend first, then frontend),
try it, then `npm run deploy` (backend first, then frontend). Backend first, because a frontend
may call what only the new backend has; a backend change that the old frontend can't use is
the case for raising `MIN_CLIENT`.

## Database changes

D1 migrations run before the new Worker starts (`npm run deploy`), so for a moment the old Worker
runs on the new tables, and a rollback runs the old Worker on them for good. So each migration
must work with the code before it and the code after it:

- **Adding** a table or a column with a default: one release.
- **Renaming or removing** something in use: two or three releases. Add the new, write both, read
  the new; then, a release later, stop writing the old; then remove it.
- Never edit a migration that has run anywhere; add another. The core's are numbered 0001 to
  0999, the app's from 1000.

The same goes for the sync objects' tables (`MIGRATIONS` in `src/sync/store.ts`) and the
device's database (`UPGRADES` in `src/lib/db/local.ts`): steps are only added at the end.

## Backups and restoring

**D1 (accounts, teams, everything but synced data).** Time Travel keeps every minute of the last
30 days (7 on Workers Free), with nothing to set up:

```sh
npx wrangler d1 time-travel info DB                                  # where it is now
npx wrangler d1 time-travel restore DB --timestamp=2026-11-01T09:00:00Z
```

A restore replaces the whole database; anything written since is lost, so note what happened in
between first. For longer than Time Travel keeps, and to have a copy outside Cloudflare,
`npm run backup` exports it as SQL into `backups/` (not in git): run it weekly and keep the files
elsewhere. To load one into an empty database: `npx wrangler d1 execute DB --remote --file
backups/<file>.sql`.

**R2 (photos, synced files).** R2 keeps no history of its own. Copy the bucket elsewhere on a
schedule, e.g. with rclone (R2 is S3-compatible; make an API token for it in the dashboard):

```sh
rclone sync r2:<bucket> backup:<somewhere>/<bucket>
```

**Synced data (the Durable Objects).** Each space's SQLite storage keeps 30 days of history. To
put one space back to a time, add this method to `SyncSpace` (`src/sync/space.ts`) for the
occasion, call it once for that space (say from a temporary admin-only route), and remove it:

```ts
async restoreTo(ms: number) {
  const bookmark = await this.ctx.storage.getBookmarkForTime(ms);
  await this.ctx.storage.onNextSessionRestoreBookmark(bookmark);
  this.ctx.abort(); // restarts on the restored storage
}
```

Devices then pull from their cursors; a change made after the restore point on a device that
already sent it isn't sent again, so tell the people concerned what to re-enter.

## Alerting

- **`ALERT_WEBHOOK`** (a secret: `npx wrangler secret put ALERT_WEBHOOK`): a Slack, Discord or
  Google Chat incoming webhook. The backend posts there when a request fails on the server, mail
  can't be sent (Resend down, the daily limit reached, the domain unverified), a deletion's
  cleanup fails three times, a background job gives up, or a cron run fails: at most once an
  hour for the same problem. Everything also lands in the admin area under Errors.
- **Cloudflare Notifications** (dashboard → Notifications): add "Workers usage" or the plan's
  usage notifications, and "Health check" on the API, so running into a free-plan limit is
  told rather than found.
- **An uptime check** from outside (Cloudflare Health Checks, or any uptime service) on
  `/api/health` every few minutes.

## When something goes wrong

**Sign-in or sign-up fails for everyone, "Too many…" or 500s.** Workers Free has daily limits:
100,000 requests, 100,000 rows written in D1, 5 million rows read. The dashboard (Workers → the
Worker → Metrics, and D1 → the database → Metrics) shows which. They reset at 00:00 UTC; the
paid plan ($5 a month) removes the problem. If it's an attack, Security → WAF → rate limiting
rules on `/api/auth/*` stop it before the Worker.

**No email arrives.** Resend's free plan sends 100 a day and 3,000 a month; its dashboard shows
the errors. The alert says what Resend answered: 429 is the limit, 403 the domain or key.

**A release broke something.** Roll the Worker back (`npx wrangler rollback` in
`backend-cloudflare/`, or the dashboard's Deployments) and the frontend (Pages → the project →
Deployments → an earlier one → Rollback). A migration isn't undone by a rollback; that's why
each must work with the code before it.

**Old installed copies call something that's gone.** Set `MIN_CLIENT` in `wrangler.toml` to the
time the fixed frontend was built and deploy: older copies show "Update needed" and update.

**Someone is abusing the app.** Admin area → People → suspend (all their sessions end). Their
content stays until you delete the account.

**A secret leaked.** Put a new one (`npx wrangler secret put NAME`) and deploy. `CODE_PEPPER`:
only codes sent in the last 10 minutes stop working. `RESEND_API_KEY`, `TURNSTILE_SECRET`,
`GOOGLE_CLIENT_SECRET`: revoke the old one where it was made. `VAPID_PRIVATE_KEY`: a new pair
ends every push subscription; people turn push on again.

**Someone asks for their data, or for it to be deleted.** Account → Download my data, and
Account → Delete account do both, for the core and (through `src/app/account.ts`) the app's own
records. An admin can delete an account from the admin area.

**The CSP blocks something new.** The admin area's Errors (kind CSP) shows what and where; add
the host to `frontend-sveltekit/src/lib/app/csp.ts`.

**Synced data waits on everyone's devices.** Over the app's daily caps
(`SYNC_APP_CHANGES_PER_DAY`, `SYNC_APP_FILE_BYTES_PER_DAY`), syncing waits until 00:00 UTC;
nothing is lost. Raise them if the plan allows.
