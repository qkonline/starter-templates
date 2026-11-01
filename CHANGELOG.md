# Changelog

What changed in each release of the templates, for an app built from an earlier one. An app
records the release it started from in `TEMPLATE_VERSION`; to take later fixes, read from that
version up, and copy over the core's files (never the app's own: `src/app/`, `src/lib/app/`,
`src/lib/config.ts`, `contract/app.yaml`, `contract/tests/app/`, migrations from 1000).

Each entry says what an app has to do, if anything, under **To take it**.

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
