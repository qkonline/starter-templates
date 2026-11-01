# Changelog

What changed in each release of the templates, for an app built from an earlier one. An app
records the release it started from in `TEMPLATE_VERSION`; to take later fixes, read from that
version up, and copy over the core's files (never the app's own: `src/app/`, `src/lib/app/`,
`src/lib/config.ts`, `contract/app.yaml`, `contract/tests/app/`, migrations from 1000).

Each entry says what an app has to do, if anything, under **To take it**.

## 0.2.1 (1 November 2026)

**To take it**: copy `backend-cloudflare/src/errors.ts`.

- `Refusal` takes an app's own error codes (from `contract/app.yaml`) without a cast.
- `docs/first-deploy.md`: a dry run on a throwaway Cloudflare account.

## 0.2.0 (1 November 2026)

**To take it** from 0.1.0: copy the core's files over, run the new migrations (0006, 0007), add
the `METER` binding and `[[migrations]] tag = "v2"` to `wrangler.toml` (and the new vars and the
second cron), and deploy. Texts in your own pages keep working; wrap them in `t()` when you want
them translated.

- Moving a passwordless account to a new address needs a code from its current one; a password
  account's old address is told.
- The browser's password rounds can be raised later without locking anyone out.
- Admin totals without whole-table scans; app-wide daily caps on synced data.
- Deleting synced files; files fetched from other devices kept within 200 MB.
- A team viewer role.
- Background jobs (`src/app/jobs.ts`), alerts to a chat webhook (`ALERT_WEBHOOK`), staging
  (`wrangler.staging.toml`), `npm run backup`, and `docs/operations.md`.
- Browser tests in WebKit too; sign-out no longer hangs in Safari where push was never allowed.
- Every text translatable, frontend and backend (`t()`, `src/lib/app/i18n/`,
  `backend-cloudflare/src/app/i18n.ts`), with a language picker and right-to-left support.

## 0.1.0 (1 November 2026)

The first release meant to build on.

- Sign-in (email and password hashed in the browser, passkeys, optional Google and email
  codes, Turnstile), sessions, the account, and the optional parts: teams, the admin area with
  support sessions, push, contact, error and CSP reports (`docs/PRD.md`).
- Offline data (optional, `SYNC`): IndexedDB on the device with an outbox, `/sync/*` in the
  contract, one Durable Object per person or team (`docs/offline-data.md`). Per-account device
  databases; nothing made offline is dropped without the person; guarded fields refuse stale
  edits; versioned structure on both sides.
- The signed-in app opens with no connection. Old installed copies are told to update
  (`MIN_CLIENT`, `client_outdated`).
- An enforced Content-Security-Policy, each page's inline scripts allowed by hash.
- The app's own places: `contract/app.yaml`; `backend-cloudflare/src/app/` (routes, account
  export and deletion, sync rules), app migrations from 1000, core tables named `core_…`;
  `frontend-sveltekit/src/lib/app/` (nav, public paths, device keys, CSP hosts).
