# Changelog

What changed in each release of the templates, for an app built from an earlier one. An app
records the release it started from in `TEMPLATE_VERSION`; to take later fixes, read from that
version up, and copy over the core's files (never the app's own: `src/app/`, `src/lib/app/`,
`src/lib/config.ts`, `contract/app.yaml`, `contract/tests/app/`, migrations from 1000).

Each entry says what an app has to do, if anything, under **To take it**.

## 0.3.3 (2 November 2026)

A confirmation code at sign-up, without holding anyone back.

- `CONFIRM_ON_SIGNUP = "true"` in `wrangler.toml` emails the confirmation code when someone signs
  up with a password, as `REQUIRE_VERIFIED_EMAIL` does, but lets them straight into the app; they
  confirm with it when they like. `/auth/methods` says so in `confirmOnSignup` (also true with
  `REQUIRE_VERIFIED_EMAIL`), and the account page shows the code field at once while the code
  still works (10 minutes). Each sign-up is then one email from the quota (and `MAIL_PER_DAY`).

**To take it**:

1. In `contract/`, copy over `openapi.yaml`, `types.ts` (or `npm run types`), `tests/lib.ts`,
   `tests/password.test.ts` and `tests/account.test.ts`.
2. In `backend-cloudflare/`, copy over `src/env.ts`, `src/routes/auth.ts` and the new
   `src/routes/auth.test.ts`; add `CONFIRM_ON_SIGNUP` to `[vars]` in `wrangler.toml` and
   `wrangler.staging.toml` (`"false"` keeps things as they were).
3. In `frontend-sveltekit/`, copy over `src/routes/(app)/account/+page.svelte` and
   `src/lib/components/account/ConfirmEmail.svelte`.

## 0.3.2 (2 November 2026)

The browser tests test the core, not what an app replaces.

- They open the account, teams and admin pages by address instead of clicking header links an
  app may rename or replace with its own frame; they check the address after sign-in against
  `homePath`; the theme tests no longer name the Daisy theme.
- The frontend README's "What the core's tests leave to the app" lists what an app then tests in
  a spec of its own: its navigation, its home after sign-in, where it shows the saved name, its
  look, and the email gate around its frame.

**To take it**: copy the core's `e2e/` files (`helpers.ts`, `smoke.spec.ts`, `features.spec.ts`,
`pwa.spec.ts`) and `frontend-sveltekit/README.md`; keep your own spec files. Then add the tests
the README lists to your own spec.

## 0.3.1 (2 November 2026)

Fixes found building the first app on 0.3.0.

- The browser tests no longer wait for the placeholder home page's heading: the signed-in layout
  marks itself with `data-signed-in` and they wait for that, so they keep passing once an app
  replaces `/app`.
- An app can draw its own frame (a sidebar, a tab bar) around its signed-in pages in place of
  the core's header and footer: `appFrame` in the new `src/lib/app/frame.ts`.
- The signed-in header's brand and Home link go to `homePath`; on phones its links move to a row
  of their own that scrolls sideways.
- `npm run deploy` in the frontend works on Wrangler 4.155 and later (`--force`, which keeps it on
  classic Pages).
- `onlyListed: true` in `src/app/sync.ts` no longer fails the core's sync tests: a backend in
  local development still takes the tests' `test_…` tables; a deployed one doesn't.
- Signing out no longer stops type checking once an app has more than about 25 pages.
- `MAIL_PER_DAY` caps the app's emails a day, of every kind (100 in `wrangler.toml`), for a
  Resend account several apps share.

**To take it**:

1. In `frontend-sveltekit/`, copy the core's files over: `package.json` (the deploy scripts),
   `src/lib/session.svelte.ts`, `src/routes/(app)/+layout.svelte` and `e2e/`. Add
   `src/lib/app/frame.ts` from the template if the app doesn't have one (it's the app's own file
   from now on). If the app had changed the `(app)` layout to draw its own frame, move that into
   `frame.ts` and take the core's layout.
2. In `backend-cloudflare/`, copy over `src/env.ts`, `src/mail.ts`, `src/mail.test.ts`,
   `src/routes/sync.ts` and `src/sync/` (not `src/app/sync.ts`, which is the app's).
3. In `contract/`, copy over `tests/sync.test.ts`.
4. Add `MAIL_PER_DAY` to `[vars]` in `wrangler.toml` and `wrangler.staging.toml`: the app's
   share of the mail plan's daily emails, or `""` for no cap of its own.

## 0.3.0 (2 November 2026)

The frontend's look is now DaisyUI 5 on Tailwind CSS 4, in a theme of its own, **Daisy**, which
replaces the earlier one. The components keep their names and props, so pages built on them need no
change; there are 30 new ones beside them, and a gallery of all of them at `/components` under
`npm run dev`.

**To take it**:

1. In `frontend-sveltekit/`: `npm install -D tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 daisyui@5.7.50`,
   then copy the core's files over: `vite.config.ts`, `src/app.css`, `src/app.html`,
   `src/lib/themes/`, `src/lib/components/`, `e2e/`, the layouts (`src/routes/+layout.svelte`,
   `(app)/`, `(auth)/`, `(site)/`), `(site)/+page.svelte`, `(app)/admin/+page.svelte`,
   `(open)/invite/+page.svelte` and the new `(open)/components/`. Delete the earlier theme's
   file from `src/lib/themes/` (every file there but `daisy.css` and your own themes).
2. Your own pages' styles: the earlier theme's tokens for how controls, buttons, panels, segmented choices,
   badges, notices, tables and the top bar look are gone (`--control-*` except
   `--control-height`, `--button-*`, `--panel-*`, `--segmented-*`, `--badge-*`, `--notice-*`,
   `--table-head-bg`, `--header-bg`, `--header-border`, `--header-shadow`, and
   `--color-accent-text`, `--color-accent-subtle`, `--color-accent-border`,
   `--color-accent-soft-text`, `--color-primary-hover`, `--color-border-hover`,
   `--color-success-soft`, `--color-danger-subtle`, `--color-notice-text`). Use DaisyUI's
   (`--color-base-100` for a card, `--color-base-300` for its line, `--radius-box`,
   `--radius-field`) or a DaisyUI class. The general ones stay (`--color-text`, `--color-muted`,
   `--color-border`, `--color-surface`, `--color-bg`, `--space-*`, `--text-*`, `--radius`…).
3. Your own class names that are DaisyUI components' names now pick up DaisyUI's styles: rename
   them (the core renamed `card`, `hero`, `label`, `loading`, `toast`). The `.label` helper is
   gone: use `fieldset-legend`.
4. A theme of your own: rewrite it as DaisyUI's variables (see `src/lib/themes/daisy.css` and
   the frontend README). Someone who had picked the earlier theme gets the default one.

- Components, new: `Checkbox`, `Toggle`, `RadioGroup`, `Range`, `FileInput`, `Rating`, `Tabs`,
  `Collapse` (accordion with `group`), `Modal`, `Drawer`, `Dropdown`, `Menu`, `Tooltip`,
  `toast()` with `Toaster` (in the root layout), `Breadcrumbs`, `Pagination`, `Steps`,
  `Progress`, `RadialProgress`, `Skeleton`, `Stats`/`Stat`, `Status`, `Kbd`, `Indicator`,
  `Timeline`, `Countdown`, `Swap`, `Carousel`, `ChatBubble`, `Navbar`, `Hero`, `Footer`, `Dock`.
- Components, rebuilt on DaisyUI: `Button` (new variants `outline`, `soft`, `ghost`, `dash`;
  sizes `xs`, `lg`; `square`), `Panel` (card), `Field` and its controls, `Segmented` (join),
  `Badge` (more tones), `Notice` (alert, with `tone` and `solid`), `Divider`, `List`, `Table`
  (`zebra`, scrolls sideways), `Spinner`, `Avatar`, the update prompt.
- Light and dark stay one theme, written with `light-dark()`, so the mode switch works as before.

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
