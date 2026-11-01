# Starter templates: PRD

What the core of every app does, whichever frontend and backend it's built from. Requirements
are numbered so code, tests and commits can name them. The API that carries them is
`contract/openapi.yaml`; where the two disagree, fix whichever is wrong, don't leave them apart.

Where each requirement comes from is noted, so it's clear what has already been proven in a real
app: **boardo** and **planner** (Svelte + Cloudflare Worker + D1), **high-yield-prep** (HYP) and
**jurist-journey** (Laravel API + SvelteKit PWA).

## 1. Signing in

Email and password is the default, because every email costs: the person leaves the app for
their inbox, mail can arrive late on a poor connection, and Resend's free plan sends 100 a day
(Kaiser, 28 Oct 2026). Email is kept for what only email can do: forgetting the password and
confirming the address. Each app reads its settings from `/auth/methods`.

- **R1.1 Email and password.** Signing up makes the account and signs in at once, with no email
  (unless the app requires confirmation, R1.7). Signing in with a wrong password or an unknown
  address gets the same answer. At most 10 wrong tries per address and 100 per network in
  15 minutes; 30 sign-ups per network an hour. *(HYP)*
- **R1.2 The password never leaves the device.** The browser turns it into a `passwordKey` with
  PBKDF2-SHA-256, 600,000 rounds, salted with the app's name and the email
  (`contract/password.ts`). The backend stores only a salted hash of the key. Why: Workers Free
  allows 10 ms of CPU per request, and 600,000 rounds take about 72 ms (measured on an M1 Pro), so
  the slow part runs on the person's device, free, and a stolen database still costs an attacker
  the full 600,000 rounds per guess. Bitwarden works the same way. Since the email is part of the
  salt, changing it needs the current password (R2.2). Passwords must be at least 8 characters,
  checked by the frontend.
- **R1.3 Forgot password.** A code by email sets a new password and signs in; it confirms the
    address and ends every other session. The reply is the same whether or not the address has an
  account, in what it says and how long it takes (the mail goes after the reply). *(HYP has reset
  by email)*
- **R1.4 Codes.** Every emailed code works for 10 minutes and 5 tries, then is gone, even under
  many tries at once. 60 seconds between codes to one address; at most 6 per address and 30 per
  network an hour. Codes for different purposes (sign-in, reset, confirm, change email) are kept
    apart and can't stand in for each other. Codes are stored only as an HMAC keyed with a secret
  kept outside the database. *(boardo; HYP has the same five-guess lock)*
- **R1.5 CAPTCHA.** Cloudflare Turnstile guards sign-up, sign-in, forgot password, email-code
  sending and the email-change code, so nobody can spend the day's email quota or try passwords
  by machine. A token counts only if it was made on one of the app's own sites. The backend
  names the CAPTCHA and its public key in `/auth/methods`; any backend on any cloud can verify
  Turnstile tokens, so the frontend stays the same everywhere.
- **R1.6 Passkeys.** A signed-in person with a confirmed email adds a passkey on each device (at
  most 20) and from then on signs in with Face ID, Touch ID or a security key; signing in needs
  that verification, not just the device. *(boardo, planner)*
- **R1.7 Confirming the address, optional per app.** Accounts start unconfirmed. Some apps hold
  people back until they confirm (`requireVerifiedEmail`: the app's own routes answer
  `email_unverified`), others only show a reminder. Confirming is a code sent on request.
- **R1.8 Nobody keeps an address they don't own.** If someone signs up with another person's
  address, the owner takes it back by forgot password, an email code or Google: the password is
    cleared or replaced and every session the squatter had ends, with the push subscriptions and
  pending codes they set up; they could add no passkey, since that needs a confirmed email. A
  sign-in already under way when that happens can't still make a session. *(HYP's rule)*
- **R1.9 Google, optional per app.** Shown only when `/auth/methods` lists it; off, it's 404. It
  signs in by the email Google has verified: an account with that email is the same account,
  otherwise one is made. *(HYP, which also offers Facebook)*
  - The browser goes frontend → backend `/auth/oauth/google/start` → Google → backend
    `/callback` → back to the frontend with a one-time code good for 60 seconds, which the
    frontend trades for a session at `/auth/oauth/exchange`. The token never appears in an
    address. *(HYP's design)*
  - The backend checks a nonce, kept in an HttpOnly cookie on its own domain for the round trip,
    against `state`, so a sign-in can't be started by someone else's link. It only returns to
    frontend origins it allows. *(HYP)*
- **R1.10 Email-code sign-in, optional per app.** Typing an address emails a code that signs in
  and makes the account if new. Off by default, since each one is an email. *(boardo, planner)*
- **R1.11 Sessions.** Signing in gives the device a bearer token. Only its SHA-256 hash is stored.
  It lasts until it goes a year unused. *(boardo)*
- **R1.12 Not in the core yet:** Facebook (HYP).

## 2. The account

- **R2.1 Name.** Optional, 1 to 60 characters, spaces tidied. *(boardo)*
- **R2.2 Changing email.** Confirmed by a code sent to the new address, which works only for that
  account and can't sign anyone in. At most 5 asked for an hour per account, behind the CAPTCHA.
  An address another account has gets the same answer and no mail, and is refused once a right
  code is given, so the change can't be used to find out who has an account. An account with a
  password also gives the current password, since the new address re-salts it. *(boardo)*
- **R2.7 Changing the password** needs the current one and ends every other session. An account
  without one (made with Google or a code) sets its first through forgot password.
- **R2.3 Photo.** PNG, JPEG or WebP up to 2 MB, cropped on the device; its address changes with
  each photo, and only the latest is kept. At most 20 uploads an hour. *(boardo)*
- **R2.4 Devices.** A list of signed-in devices; sign out one, or every other. *(HYP manages
  sessions and devices)*
- **R2.5 Export.** Everything stored about the person, as a download: the account, devices,
  passkeys, team memberships with roles, notifications, push subscriptions (by host), contact
  messages sent, invites sent and received, and the app's own records (each app adds its own
  through its export hook).
- **R2.6 Deleting the account** removes it with its sessions, passkeys, push subscriptions,
  notifications, contact messages and photo, its synced data and the app's own records, at once;
  error reports it sent stay, without it. What's kept outside the database is written down with
  the deletion and finished by the daily sweep if anything failed. *(boardo)*

## 3. The app shell (frontend)

- **R3.1 Installable and offline.** A web app manifest, icons, and a service worker that caches
  the app shell so it opens offline with a clear "you're offline" state; a prompt when a new
  version is ready, applied on the person's tap, never mid-task. *(both exam apps, boardo)*
- **R3.2 Display preferences.** Theme (one of the looks the app offers, when it offers more than
  one), mode (light, dark, or the device's) and text size, per device, applied before first
  paint so nothing flashes. *(both exam apps: `theme`, `fontScale`)*
- **R3.3 Security headers.** A Content-Security-Policy, enforced, reporting what it blocks to
  `/telemetry/csp`; each page's inline scripts are allowed by hash in that page's own policy, so
  the header stays short however many pages there are. Plus the usual headers (HSTS, frame,
  referrer, content type, permissions), in Cloudflare Pages' `_headers`. *(high-yield-prep)*
- **R3.4 Analytics, optional.** PostHog, Google Analytics 4, both, or neither, each switched on by
  its key at build time; nothing loads without a key. Neither loads, stores or sends anything
  until the person agrees in a small banner, and saying no later stops both. Only the account id
  is sent, never an email; addresses are sent without their query, and PostHog masks page text
  and attributes. Page views are sent on every client-side navigation. *(PostHog in both exam apps)*
- **R3.5 Hosting.** The frontend builds to static files and deploys to Cloudflare Pages
  (`_headers`, SPA fallback); any static host works the same way.
- **R3.6 Old copies told to update.** Every request carries when the frontend was built; a
  backend can set the oldest build it serves, and an older copy is told `client_outdated`,
  shows "Update needed" in place of its pages, and updates. Signed in, the app opens without a
  connection from what the device kept from the last start.

## 4. Notifications

- **R4.1 In-app notifications.** A bell with an unread count and a list; mark one or all read.
  Kept 90 days. *(boardo's bell)*
- **R4.2 Push, optional.** On when the backend has VAPID keys (generated once by the setup script;
  free, no third party). The person turns it on per device from the account page and can send
  themselves a test. Push never replaces the in-app list, and goes only to the browsers'
  known push services. A device's subscription ends with its session: signed out, it gets no
  more. *(boardo, planner, both exam apps)*

## 5. Teams (optional per app)

- **R5.1** People make teams; the maker is the first admin. Admins rename and delete the team,
  invite, remove members and change roles; members use it. *(boardo's boards)*
- **R5.2 Invites by email,** good for 7 days, withdrawable, resendable (60 s apart). The emailed
  link proves the address; without it, invites show in the app only to confirmed emails. Each
  invite is an email from the quota, so only a confirmed email may invite, at most 50 a day per
  team and per inviter (resends count), and the whole app stops invites at 80 a day to leave
  Resend's free 100 room for sign-in codes.
- **R5.3 Never without an admin.** Demoting or removing the last admin is refused, even under
  concurrent changes; deleting an account hands its teams on instead of getting stuck.
  *(boardo's last-admin rule)*

## 6. Admin area (optional per app)

- **R6.1** Admins are the confirmed accounts whose emails the app lists in its settings.
- **R6.2** Counts, finding people, suspending (all their sessions end; sign-in refused) and
  unsuspending, deleting; never another admin.
- **R6.3 Support sign-in.** A one-time code opens the person's account in a separate tab for an
  hour, unable to touch passwords, email, sessions, passkeys, push, export or deletion.
  *(high-yield-prep and jurist-journey's impersonation)*
- **R6.4** Contact messages and feedback (open or done), error and CSP reports, and an audit log
  of every support session, suspension and deletion; messages and the log are kept a year.

## 7. Contact, feedback and errors

- **R7.1 Contact and feedback forms,** signed in or out, behind the CAPTCHA, stored for the admin
  area; emailed to the app's contact address only if it has one. *(high-yield-prep's website)*
- **R7.2 Error tracking without a third party.** The frontend reports uncaught errors and
  unhandled rejections; the backend records its own 500s; both and CSP reports go to one table,
  deduplicated with counts and trimmed daily to the 500 most recent. Reports are limited per
  network and app-wide per day, and over a limit nothing is written; at most 5 CSP reports are
  kept from one request. Cloudflare's Workers logs keep the rest.

## 8. Setup and deploy

- **R8.1** One setup script per backend creates what the app needs on Cloudflare (D1, R2, VAPID
  keys, secrets) from a fresh account, and says what must be done by hand (Turnstile widget,
  Resend domain, Google client).
- **R8.2** One deploy command each for backend and frontend; migrations run before the Worker. The
  backend's refuses to deploy settings still pointing at localhost or a placeholder database.

## 9. Errors

- **R9.1** Every refusal carries a fixed code the app acts on and a message in plain words, shown
  to the person as it is.

## 10. Development

- **R10.1** Run locally without a mail provider, a backend keeps the mail it would have sent at
  `/dev/mail`, so tests read codes from it; only on localhost. *(boardo)*
- **R10.2** A backend is finished when the tests in `contract/` pass against it.

## 11. Offline data (optional per app)

- **R11.1** An app whose own data can be changed offline follows
  [`offline-data.md`](offline-data.md): ids made on the device (UUIDs), never a server counter as
  the key; numbers people read given by the server or per device; changes safe to send twice;
  clashes between different records (the same patient entered twice, one slot booked twice)
  kept and flagged for a person, never refused or dropped. Two people offline at once each
  adding a record must end, after both sync, as two records with their own ids.
- **R11.2 On the device first.** The app reads and writes IndexedDB and never waits for the
  network; each write also goes into an outbox. A person's own data, or a team's shared by its
  members (teams on). The browser is asked to keep the data (`navigator.storage.persist`).
- **R11.3 Sent in order, each change once.** The outbox goes in batches (at most 100 changes,
  256 KB) on opening the app, on reconnecting, shortly after a write and every few minutes, one
  tab at a time. Every change has its own id, so a batch sent again is applied once. Fields
  merge, the later arrival winning a field both set, except fields the app guards: an edit made
  on an older version than another device's change to one is refused for the person to resolve.
  Deletes stay as markers (the backend keeps the content), and a later edit to a deleted record
  is refused. A refused change is kept on the device with what it set and shown to the person
  who made it, never silently dropped. The app can check each change to its tables.
- **R11.4 Never overwhelmed.** Each space is applied one request at a time in its own Durable
  Object, side by side with every other. Over a space's limits (60 batches a minute, 10,000
  changes a day per person) or when busy, the backend answers `rate_limited` with `Retry-After`
  and applies nothing; the device waits that long (plus a little at random) and sends the same
  batch again. With no answer it backs off, up to five minutes.
- **R11.5 Pulled in pages** from a cursor the backend gives, so a new device, or one back after
  weeks, catches up a page at a time.
- **R11.6 Files in parts** (8 MiB, up to 1 GiB a file), each part kept as it's sent, so a
  dropped connection carries on from the next one.
- **R11.7 The device shows what's waiting** ("3 changes waiting") and what was refused. Each
  account has its own data on the device: signing out gives the outbox a few seconds to go, then
  deletes the account's data if it all reached the backend, or keeps it for that person's next
  sign-in; another account signing in never wipes it. A team the backend turns away keeps its
  unsent changes until the person discards them. Deleting an account or a team deletes its data.
