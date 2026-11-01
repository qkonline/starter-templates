# First deploy: a dry run on a throwaway Cloudflare account

Everything here is tested locally and in CI, but only a real deploy proves the parts that need
Cloudflare: the setup and deploy scripts, D1 migrations remotely, the Durable Object classes, R2
multipart uploads, the cron triggers, Pages headers, and the backup and restore commands. Do this
once on a throwaway account (and again for each new app, on its own account), ticking each box.
It takes about an hour. Nothing here costs money on the free plans.

Names used below: the Worker is `starter-api` at `https://starter-api.<you>.workers.dev`, the
Pages project is `starter-frontend` at `https://starter-frontend.pages.dev`. Use your own.

## 1. Accounts and tools

- [ ] A new Cloudflare account (free). In it, Workers & Pages once, so it has a
      `<you>.workers.dev` subdomain.
- [ ] `cd backend-cloudflare && npx wrangler login`, then `npx wrangler whoami` shows the new
      account (not your main one).
- [ ] A Resend account. For the dry run its test sender works without a domain:
      `MAIL_FROM = "Starter <onboarding@resend.dev>"` (it only delivers to the Resend account's
      own address; use that address to sign up below).
- [ ] A Turnstile widget (Cloudflare dashboard → Turnstile → Add widget) for the hostname
      `starter-frontend.pages.dev`. Keep the site key and the secret.

## 2. The backend

In `backend-cloudflare/wrangler.toml`:

- [ ] `APP_NAME = "dryrun"` (anything but `starter`), `APP_TITLE`.
- [ ] `ALLOWED_ORIGINS = "https://starter-frontend.pages.dev"`, `RP_ID = "starter-frontend.pages.dev"`.
- [ ] `MAIL_FROM` as above, `TURNSTILE_SITE_KEY` = the site key.
- [ ] Every switch on, to try every part: `TEAMS`, `SYNC`, `ADMIN = "true"`,
      `ADMIN_EMAILS` = your Resend address, `EMAIL_CODE = "true"`.

Then:

- [ ] `npm run setup`. It makes the D1 database and the R2 bucket, writes the database id, makes
      the push keys and `CODE_PEPPER`, and asks for the secrets: paste the Resend API key and the
      Turnstile secret, skip Google. It applies the migrations remotely.
- [ ] `npx wrangler secret put ALERT_WEBHOOK`: a webhook from a scratch Slack or Discord
      channel.
- [ ] `npm run deploy`. `predeploy` must say `wrangler.toml looks ready to deploy.` If it
      refuses, it says what's wrong; fix that, not the check.
- [ ] `curl https://starter-api.<you>.workers.dev/api/health` → `{"status":"ok"}`.
- [ ] `curl https://starter-api.<you>.workers.dev/api/features` → teams, admin, sync true, push
      with a key, `minClient` null.

## 3. The frontend

- [ ] `cd frontend-sveltekit`; `frontend-sveltekit/wrangler.toml`: `name = "starter-frontend"`.
- [ ] `PUBLIC_API_URL=https://starter-api.<you>.workers.dev/api npm run deploy` (the first one
      creates the Pages project). Open `https://starter-frontend.pages.dev`.
- [ ] `curl -sI https://starter-frontend.pages.dev/ | grep -i content-security-policy`: the
      header is there, and the page source starts its `<head>` with its own CSP `<meta>`.

## 4. Try every part, in the browser

Use a private window, with the developer tools' console open: any CSP block shows there.

- [ ] Sign up with your Resend address and a password; the confirmation code arrives; confirm.
- [ ] Sign out, sign in again; a wrong password says so.
- [ ] Forgot password: the code arrives; set a new one.
- [ ] Account → add a passkey; sign out; sign in with the passkey.
- [ ] Account → Profile: upload a photo; it shows.
- [ ] Account → Download my data: the file has the account in it.
- [ ] Teams: make one; invite a second address (another of yours, if Resend lets you; otherwise
      skip the email and check the invite shows in the list).
- [ ] Admin appears in the header (your address is in `ADMIN_EMAILS` and confirmed); the Overview
      shows 1 person; Errors is empty.
- [ ] Push: Account → Notifications → turn on → Send a test; it arrives.
- [ ] Install the app (the browser's install button), go offline (developer tools → Network →
      Offline), reload: the signed-in app opens. Back online.

## 5. Offline data, files and the sync objects

The template has no page that writes synced data (that's the app's), so before deploying the
frontend, add a throwaway page, `src/routes/(app)/try/+page.svelte`, with a button that runs
`data.put(ME, 'notes', data.newId(), { text: 'hello' })` and a file input whose file goes to
`data.saveFile(ME, file)` (`data` and `ME` from `#lib/db/index.svelte.ts`). Then:

- [ ] Write a few records offline; "N changes waiting" shows; go online; it goes to zero.
- [ ] In a second browser, sign in as the same person: the records arrive.
- [ ] Save a 20 MB file: it uploads in parts (Network tab: several `parts/N` requests); open it on
      the second browser.
- [ ] `npx wrangler tail` in `backend-cloudflare/` while doing this shows no errors.

## 6. Crons, jobs and alerts

- [ ] `npx wrangler tail`: within a minute a `scheduled` event appears (the jobs cron), with no
      error. The daily one runs at 03:17 UTC; check the next day that it ran (dashboard → the
      Worker → Logs).
- [ ] Alerts: ask for a forgot-password code for an address Resend's test sender can't deliver
      to. The app says the email couldn't be sent, the webhook channel gets "Email couldn't be
      sent", and the admin area's Errors shows it. A second try within the hour posts nothing
      more.

## 7. Deleting

- [ ] Delete the second account (or your own, last): it's gone at once; the next day's sweep log
      shows nothing failing. In R2 (dashboard → the bucket), its `photos/<id>/` and
      `sync/user/<id>/` are gone.

## 8. Backups and restoring

- [ ] `npm run backup`: a `backups/*.sql` file with the tables in it.
- [ ] `npx wrangler d1 time-travel info DB`: shows a bookmark.
- [ ] Restore for real, once: note the time, sign up a throwaway account, then
      `npx wrangler d1 time-travel restore DB --timestamp=<the time>`: that account is gone.

## 9. Staging and releases

- [ ] `wrangler.staging.toml`: names, `ALLOWED_ORIGINS`/`RP_ID` for the staging frontend
      (`staging.starter-frontend.pages.dev`), the same `APP_NAME`. `npm run setup:staging`,
      `npm run deploy:staging`.
- [ ] `frontend-sveltekit/.env.staging`: `PUBLIC_API_URL` = the staging Worker;
      `npm run deploy:staging`. The staging site works on its own data.
- [ ] Add a var to `wrangler.toml` only: `npm run deploy:staging` refuses (drift). Remove it.
- [ ] Forced updates: set `MIN_CLIENT` to now (ISO time) in staging's config and deploy it; an
      open staging tab shows "Update needed". Redeploy the frontend; "Update now" loads it.
      Remove `MIN_CLIENT` again.
- [ ] Roll back: `npx wrangler rollback` in `backend-cloudflare/` brings the previous Worker back.

## 10. Done

- [ ] Note anything that didn't go as written here, and fix this file or the scripts.
- [ ] Delete the throwaway account's resources, or the account.
