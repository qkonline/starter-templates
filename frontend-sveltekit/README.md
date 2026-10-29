# Starter frontend: SvelteKit

Sign-in, account, sessions and the optional app parts for a new app, built as static files that
work with any backend implementing [`../contract/openapi.yaml`](../contract/openapi.yaml).
SvelteKit 3, Svelte 5, TypeScript, no server code: deploy the `build/` folder to Cloudflare
Pages (the default, `npm run deploy`), S3, Azure Static Web Apps, or any file host.

What's in it (requirement numbers from [`../docs/PRD.md`](../docs/PRD.md)):

- **Sign up, sign in** with email and password (R1.1). The password never leaves the device: the
  browser sends `passwordKey()` from `@starter/contract/password` (R1.2).
- **Sign in with a passkey**; **Continue with Google** and **Email me a code** only when
  `/auth/methods` has them on (R1.6, R1.9, R1.10). Google returns to `/auth/callback`, which
  signs in only when the sign-in was started in that tab (a nonce in sessionStorage and in the
  return address, `?n=…`), so a link from someone else can't sign the browser into their account.
- **Forgot password**: a code by email, then a new password, which signs in (R1.3).
- **Turnstile** on sign-up, sign-in, forgot password, code sending, changing the email, contact
  and feedback when the backend names it; nothing is loaded when it doesn't (R1.5).
- **Confirm your email**: a banner, or a gate when `requireVerifiedEmail` is on (R1.7).
- **Account**: name, photo (cropped square and resized to 512 px on the device), confirm and
  change email, change or set a password, passkeys, devices, notifications on this device,
  display, download my data, delete account.
- **Installable and offline** (R3.1): a manifest, icons, a service worker that caches the app
  so it opens offline, an offline page and banner, and "A new version is ready" applied only
  when the person taps Reload.
- **Display preferences** (R3.2): theme (device, light, dark) and text size, per device,
  applied before the first paint.
- **Security headers** (R3.3): `_headers` for Cloudflare Pages with HSTS and a report-only CSP
  that reports to the backend's `/telemetry/csp`.
- **Analytics, optional** (R3.4): PostHog and/or Google Analytics 4, each only when its key is
  set, and only after the person agrees in the consent banner; `track(event, props)`.
- **Error reporting** (R7.2): uncaught errors and unhandled rejections go to `/telemetry/errors`.
- **Notifications** (R4.1, R4.2): the bell with an unread count and a paged list; push per
  device from the account page, with "send me a test".
- **Teams** (R5, when `/features` has them): teams, members, roles, invites, `/invite?token=…`.
- **Admin area** (R6, when on and for `user.isAdmin`): counts, people (suspend, unsuspend,
  delete, support sign-in in a tab of its own), messages, error reports, audit log.
- **Contact** (`/contact`, signed in or out) and **Send feedback** inside the app (R7.1).
- Public pages (`/`, `/privacy`, `/terms`, `/contact`, `/offline`) prerendered with their
  content, as placeholders.

`/features` is read when the app starts, next to `/auth/methods`; teams, admin and push show only
when it has them on. A backend without `/features` gets everything optional off.

## Setup

Needs Node 24 (`.node-version`), and `../contract` next to this folder (it's a `file:`
dependency).

```bash
npm install
cp .env.example .env      # then set PUBLIC_API_URL if the backend isn't on localhost:8787
npm run dev               # http://localhost:5180
```

## Environment variables

All of them are read at **build time** and written into the files (declared in `src/env.ts`;
`scripts/postbuild.mjs` reads the same ones for `_headers`), so set them before `npm run build`
or `npm run deploy`, in `.env` or the shell. On Cloudflare Pages' own Git builds, set them as
build variables.

| Variable              | Default                      | What it does                                                                                                                        |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_API_URL`      | `http://localhost:8787/api`  | The backend's server URL, ending in `/api`. Also the CSP's `connect-src`/`img-src` origin and its `report-uri` (`…/telemetry/csp`). |
| `PUBLIC_POSTHOG_KEY`  | empty (off)                  | PostHog project key. Empty: posthog-js isn't even in the build.                                                                     |
| `PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com`   | PostHog host (`https://eu.i.posthog.com` for the EU cloud, or your proxy).                                                          |
| `PUBLIC_GA_ID`        | empty (off)                  | Google Analytics 4 measurement id (`G-…`). Loaded only after the person agrees.                                                     |
| `PUBLIC_RELEASE`      | Pages' commit, or build time | The version in error reports and the service worker's cache name. Read from the shell only (by `vite.config.ts`), not from `.env`.  |

```bash
PUBLIC_API_URL=https://api.example.com/api PUBLIC_POSTHOG_KEY=phc_… npm run build
```

## Pointing it at a backend

Any backend that passes the contract tests works. It must also:

- allow this frontend's origin for CORS, including the `Authorization` and `Content-Type`
  request headers and exposing `Retry-After` (the dev server is `http://localhost:5180`,
  `npm run preview` and `npm run serve` are `http://localhost:4180`);
- for Google, allow `<this origin>/auth/callback` as a return address;
- for passkeys, use this frontend's domain as the WebAuthn relying party;
- for invites, email links to `<this origin>/invite?token=…`;
- for support sessions, nothing: the admin area opens `<this origin>/support?code=…` itself.

## Commands

```bash
npm run dev          # dev server on :5180
npm run build        # static site in build/, then _headers and 404.html (scripts/postbuild.mjs)
npm run preview      # vite preview of build/ on :4180
npm run serve        # build/ served like Cloudflare Pages (_headers, 404.html) on :4180
npm run check        # svelte-check, and tsc for the service worker
npm test             # vitest unit tests
npm run lint         # eslint (recommended rules of eslint, typescript-eslint, eslint-plugin-svelte)
npm run format       # prettier
npm run e2e          # Playwright (see below)
npm run icons        # regenerate the placeholder icons
npm run deploy       # check PUBLIC_API_URL is https, build, then wrangler pages deploy build/
```

### End-to-end tests

`npm run e2e` builds the site, serves it with `scripts/pages-server.mjs` on port 4180 (the way
Pages serves it, so the headers are tested) and runs `e2e/` in Chromium.

- `e2e/pwa.spec.ts` needs no backend: manifest and icons, `_headers`, the 404 page, no CSP
  violations on public pages, preferences before the first paint, the service worker and
  offline.
- `e2e/smoke.spec.ts` and `e2e/features.spec.ts` run against the backend at `API_URL` (default
  `http://localhost:8787/api`), which must have dev mail on (`/dev/mail`) and Turnstile's
  always-pass test keys if the CAPTCHA is on. They skip when it doesn't answer (`/health`, and
  `/features` for the optional parts). The admin test also needs `E2E_ADMIN_EMAIL` and
  `E2E_ADMIN_PASSWORD` of a confirmed account in the backend's `ADMIN_EMAILS`.

First time: `npx playwright install chromium`. If something else holds port 4180 on `::1`,
`E2E_IPV4=1 npm run e2e` serves on 127.0.0.1 and maps `localhost` there inside Chromium.
`E2E_PORT` picks another port (the backend must allow it).

## Deploying to Cloudflare Pages

```bash
PUBLIC_API_URL=https://api.example.com/api npm run deploy
```

`npm run deploy` refuses to start unless `PUBLIC_API_URL` (from the shell or `.env`) is an
`https:` address (`scripts/predeploy.mjs`), since a build without it would call localhost from
people's browsers; then it builds and runs `wrangler pages deploy build` with the pinned
`wrangler` devDependency. A Cloudflare Pages Git build (`CF_PAGES=1`) fails the same way.
`npm run build` alone doesn't check, so local builds and the e2e tests keep using localhost.
`wrangler.toml` names the Pages project (`name`, change it per app) and its output folder. The
first time, `npx wrangler login`, then either let the first deploy create the project or create
it in the dashboard (Workers & Pages → Create → Pages → Direct Upload). Then add the custom domain in the project's settings, and allow that origin in the
backend's CORS.

What `build/` holds:

- one HTML file per page (`index.html`, `signin.html`, `team.html`, `admin/people.html`, …);
  Pages serves `/account` from `account.html` by itself;
- `200.html`, an empty app shell, and `404.html`, a copy of it: Pages serves `404.html` (with
  status 404) for any path that isn't a file, and the app shows its own "not found" page;
- `_headers`: the CSP (report-only), `Strict-Transport-Security` (a year, subdomains included:
  every subdomain of the domain must serve HTTPS), `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and caching for `/_app/immutable/*` and the service
  worker. It is built, not a file in `static/`, because the policy names `PUBLIC_API_URL` and the
  analytics hosts and allows the pages' inline scripts by their hashes. Edit `scripts/csp.ts`.
- `service-worker.js`, `manifest.webmanifest`, `icons/`.

Other hosts (S3/CloudFront, Azure Static Web Apps, nginx): serve `build/`, map extensionless
paths to `.html`, use `404.html` (or `200.html`) for unknown paths, and copy the headers from
`build/_headers` into the host's own configuration.

**The CSP starts report-only.** Reports land in the admin area under Errors (kind CSP). Once
they're clean, rename the header in `scripts/csp.ts` to `Content-Security-Policy` to enforce it.
Each public page with content adds one script hash; Pages takes at most 2,000 characters per
header, and the build fails with a clear message if the policy grows past that.

## Icons

`static/icons/` holds placeholders made by `scripts/icons.mjs` (the favicon's ring on ink):
`icon-192.png`, `icon-512.png` (any purpose), `maskable-512.png` (full bleed, the drawing inside
the middle 80%) and `apple-touch-icon.png` (180 px, full bleed). To use the app's own, replace
those files with the same names and sizes, replace `static/favicon.svg`, and update `name`,
`short_name`, `description` and the colours in `static/manifest.webmanifest` (and the
`theme-color` metas in `src/app.html`). `npm run icons` would overwrite them, so don't run it
afterwards.

## Analytics

Each provider is on only when its key is set at build time; with neither, nothing loads and no
banner shows. With either, a small banner asks once (the answer is kept on the device and can be
changed under Account → Display). **Nothing is loaded, stored or sent until the person agrees**;
saying no later stops both at once (PostHog's `opt_out_capturing()`, Google Analytics' own
`ga-disable-<id>` switch and consent update), and the next page load doesn't load them.

- **PostHog**: autocapture records which element was clicked but not its text or attributes
  (`mask_all_text`, `mask_all_element_attributes`), and nothing inside elements marked
  `ph-no-capture` (the admin area, the bell's list). Session recording and surveys are off.
  Every address it sends, in properties, `$set`, `$set_once` and `$elements_chain`, has `code`,
  `token`, `email`, `next`, `session` and `state` removed (`before_send`, and PostHog's own
  `mask_personal_data_properties`).
- **Google Analytics 4**: told the scrubbed address and referrer itself (`page_location`,
  `page_referrer`), at start and on every navigation, so its own events never carry a token or
  an email; pages are named by route (`/team`), never by their title, which can hold a team's
  name.

Page views are sent on every client-side navigation (root layout). Signing in identifies the
account id (never the email), only once the person has agreed; signing out resets. Support tabs
send nothing. For events:

```ts
import { track } from '#lib/analytics/index.ts';
track('note_created', { length: 'short' }); // nothing personal in props
```

## Adding the app's own pages

- **Signed-in pages** go in `src/routes/(app)/`, e.g. `src/routes/(app)/notes/+page.svelte`. The
  `(app)` layout handles sign-in, the email gate, the header, the bell and the feedback link;
  `auth.user` from `#lib/session.svelte.ts` is the person, `auth.features` the switches. Change
  the landing page after sign-in in `src/lib/config.ts` (`homePath`), with `appName`.
- **One page per thing, with a query parameter** (`/team?id=…`), not a route parameter
  (`/teams/[id]`): every page is then a prerendered file, works offline from the service
  worker's cache, and needs no fallback rules on the host. If an app does add a route with a
  parameter, Pages serves the shell for it through `404.html` (with status 404). For a 200, Pages
  supports rewrites in a `static/_redirects` file (`/notes/* /200 200`); try it on a preview
  deploy first, it isn't covered by the tests here.
- **Public pages** go in `src/routes/(site)/`; they are prerendered with their content. Each adds
  one hash to the CSP.
- **Pages that work signed in or out** and decide for themselves (like `/invite`, `/support`) go
  in `src/routes/(open)/`.
- **API calls**: add the paths to the app's contract first (`openapi.yaml`, then
  `npm run types` there), then call them with the typed client:
  `api.client.GET('/notes')`, or add a function next to the others in `src/lib/api/client.ts`.
  The client already sends the token and handles `signed_out` and `email_unverified`.
- **Paged lists**: `Pager` from `#lib/pager.svelte.ts` takes a function returning
  `{ items, next }` and gives `items`, `more`, `loadMore()`, `reload()`.
- **Data kept on the device** (IndexedDB, caches): register a cleaner with `onForget()` from
  `#lib/device.ts`, so it's wiped when a different account signs in or the account is deleted.
  Settings of the device rather than the person go in `deviceKeys` there, so they stay.
- **New third-party scripts or hosts**: add them to `scripts/csp.ts`, or the CSP reports them.
- **The look**: every colour, font, radius and spacing is a token at the top of `src/app.css`,
  with dark values below it (twice: the device's dark mode and the chosen one). Components use
  only those.
