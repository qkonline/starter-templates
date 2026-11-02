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
  when the person taps Reload. Signed in, the app opens with no connection (or the backend
  down) from copies of the person, the sign-in settings and the switches kept on the device,
  and checks with the backend in the background.
- **Old copies told to update** (R3.6): every request says when the build was made
  (`X-Client-Version`); a backend whose `MIN_CLIENT` is later answers `client_outdated`, and
  the app shows "Update needed" in place of the pages, fetches the new version and switches.
- **Display preferences** (R3.2): theme (Daisy, or the app's own), mode (device,
  light, dark) and text size, per device, applied before the first paint.
- **Security headers** (R3.3): `_headers` for Cloudflare Pages with HSTS and an enforced CSP
  that reports to the backend's `/telemetry/csp`; each page's inline scripts are allowed by hash
  in that page's own `<meta>` policy.
- **Analytics, optional** (R3.4): PostHog and/or Google Analytics 4, each only when its key is
  set, and only after the person agrees in the consent banner; `track(event, props)`.
- **Error reporting** (R7.2): uncaught errors and unhandled rejections go to `/telemetry/errors`.
- **Notifications** (R4.1, R4.2): the bell with an unread count and a paged list; push per
  device from the account page, with "send me a test".
- **Teams** (R5, when `/features` has them): teams, members, roles, invites, `/invite?token=…`.
- **Admin area** (R6, when on and for `user.isAdmin`): counts, people (suspend, unsuspend,
  delete, support sign-in in a tab of its own), messages, error reports, audit log.
- **Offline data** (R11, when `/features` has `sync`): `#lib/db` keeps the app's records in
  IndexedDB and syncs them; a "N changes waiting" chip in the header and a banner for changes
  the backend refused. See [Offline data](#offline-data).
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

#### What the core's tests leave to the app

The core's tests cover the core: signing up and in, the account page, teams, admin, the PWA. They
skip everything an app is expected to replace, so they keep passing on any app built from the
template:

- They reach the core's pages by address (`page.goto('/account')`, `/teams`, `/admin`), never
  through links in the header, which an app may restyle, rename or replace with its own frame.
- They wait for the signed-in layout (`signedInApp(page)`, `[data-signed-in]`), never for the
  home page's text, and check the address after sign-in against `homePath` (`atHome`).
- They check that a stored theme, mode and text size apply before the first paint, not which
  theme it is.

Once your app has its own shell, home page and look, add a spec of your own in `e2e/` (for
example `e2e/<app>.spec.ts`) that tests what the core's tests no longer do, in your app's words:

- **Navigation:** from the home page, your header, sidebar or tab bar reaches the account page
  (and Teams and Admin when they're on), each link with the name a person sees, and the current
  page is marked (`aria-current="page"`).
- **Home after sign-in:** signing up and signing in land on your home page and show its real
  content, e.g. its heading, or the person's name if you greet them.
- **The name on the account:** a name saved on the account page shows where your app shows it.
- **Your look:** if you replaced or added themes, your default theme's id is on `<html>` before
  the first paint, and a removed one falls back to it.
- **The email gate:** with `REQUIRE_VERIFIED_EMAIL` on, your frame isn't drawn until the email is
  confirmed (the core shows `EmailGate` in its place).

Reuse the helpers in `e2e/helpers.ts` (`signUp`, `signIn`, `passGate`, `confirmEmail`,
`latestCode`, `signedInApp`, `atHome`) rather than repeating the sign-up steps. Keep the core's
spec files as they are, so later template releases update them cleanly.

## Deploying to Cloudflare Pages

```bash
PUBLIC_API_URL=https://api.example.com/api npm run deploy
```

`npm run deploy` refuses to start unless `PUBLIC_API_URL` (from the shell or `.env`) is an
`https:` address (`scripts/predeploy.mjs`), since a build without it would call localhost from
people's browsers; then it builds and runs `wrangler pages deploy build --force` with the pinned
`wrangler` devDependency. A Cloudflare Pages Git build (`CF_PAGES=1`) fails the same way.
`npm run build` alone doesn't check, so local builds and the e2e tests keep using localhost.
`--force` keeps the deploy on classic Pages: since 4.155, Wrangler otherwise hands it to Pages
on Workers, which refuses a folder of static files. If your Wrangler login sees more than one
Cloudflare account, name the one to use: `CLOUDFLARE_ACCOUNT_ID=… npm run deploy` (a Pages
`wrangler.toml` can't hold `account_id`).
`npm run deploy:staging` does the same with `.env.staging` (the staging API) as a Pages
deployment on the `staging` branch (`../docs/operations.md`, "Staging").
`wrangler.toml` names the Pages project (`name`, change it per app) and its output folder. The
first time, `npx wrangler login`, then either let the first deploy create the project or create
it in the dashboard (Workers & Pages → Create → Pages → Direct Upload). Then add the custom domain in the project's settings, and allow that origin in the
backend's CORS.

What `build/` holds:

- one HTML file per page (`index.html`, `signin.html`, `team.html`, `admin/people.html`, …);
  Pages serves `/account` from `account.html` by itself;
- `200.html`, an empty app shell, and `404.html`, a copy of it: Pages serves `404.html` (with
  status 404) for any path that isn't a file, and the app shows its own "not found" page;
- `_headers`: the CSP (enforced), `Strict-Transport-Security` (a year, subdomains included:
  every subdomain of the domain must serve HTTPS), `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and caching for `/_app/immutable/*` and the service
  worker. It is built, not a file in `static/`, because the policy names `PUBLIC_API_URL` and the
  analytics hosts. Each page also gets a `<meta>` policy listing its own inline scripts by hash
  (SvelteKit's start script, the display-preferences script), written in by the build. Hosts
  the app loads from go in `src/lib/app/csp.ts`; the core's policy is `scripts/csp.ts`.
- `service-worker.js`, `manifest.webmanifest`, `icons/`.

Other hosts (S3/CloudFront, Azure Static Web Apps, nginx): serve `build/`, map extensionless
paths to `.html`, use `404.html` (or `200.html`) for unknown paths, and copy the headers from
`build/_headers` into the host's own configuration.

**The CSP is enforced from the start**, because the session token is in localStorage and a
script that shouldn't run is the one way to read it. What it blocks is reported to the admin
area under Errors (kind CSP). Two policies apply to each page and a browser keeps both: the
header (every host, for everything) allows inline scripts, and the page's own `<meta>` allows
only the inline scripts that page has, by hash. So the header stays the same length however
many pages an app adds (Pages takes 2,000 characters a header; the build fails clearly past it).
A new third-party script or host goes in `src/lib/app/csp.ts`, or the browser blocks it.

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

**The app's own files.** A later release of the template replaces the core's files; these are
the app's, and it never touches them, so its fixes merge without hand work:

| File                       | What goes in it                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/config.ts`        | `appName`, and `homePath`, where people land after signing in                         |
| `src/lib/app/shell.ts`     | `appNav` (links in the signed-in header), `appPublicPaths`, `appDeviceKeys`           |
| `src/lib/app/csp.ts`       | hosts the app's pages load scripts, data, images or fonts from                        |
| `src/lib/app/frame.ts`     | `appFrame`: the app's own frame around signed-in pages, in place of the core's header |
| `src/routes/(app)/…`, etc. | the app's own pages (any route the core doesn't have)                                 |
| `../contract/app.yaml`     | the app's own paths; `api.client` is typed with them (`npm run types` in `contract/`) |

- **Signed-in pages** go in `src/routes/(app)/`, e.g. `src/routes/(app)/notes/+page.svelte`. The
  `(app)` layout handles sign-in, the email gate, the header, the bell and the feedback link;
  `auth.user` from `#lib/session.svelte.ts` is the person, `auth.features` the switches. A link
  in the header: `appNav` in `src/lib/app/shell.ts`.
- **A frame of the app's own** (a sidebar, a tab bar) instead of the core's header and footer:
  a component set as `appFrame` in `src/lib/app/frame.ts`. It gets `user` and the page as
  `children`, renders the page inside `<main id="main">`, and shows what the core's header
  did (links, the bell, sync status, the account link, the email banner, "Send feedback");
  the comment in `frame.ts` lists them. Everything signed in sits inside `[data-signed-in]`,
  which the browser tests wait for, so they keep passing once the app replaces the home page.
- **One page per thing, with a query parameter** (`/team?id=…`), not a route parameter
  (`/teams/[id]`): every page is then a prerendered file, works offline from the service
  worker's cache, and needs no fallback rules on the host. If an app does add a route with a
  parameter, Pages serves the shell for it through `404.html` (with status 404). For a 200, Pages
  supports rewrites in a `static/_redirects` file (`/notes/* /200 200`); try it on a preview
  deploy first, it isn't covered by the tests here.
- **Public pages** go in `src/routes/(site)/`; they are prerendered with their content.
- **Pages that work signed in or out** and decide for themselves (like `/invite`, `/support`) go
  in `src/routes/(open)/`.
- **API calls**: add the paths to the app's contract first (`../contract/app.yaml`, then
  `npm run types` there), then call them with the typed client: `api.client.GET('/notes')`.
  The client already sends the token and the build's version, and handles `signed_out`,
  `email_unverified` and `client_outdated`. An error code the app's paths add (`slot_taken`)
  arrives as it was sent, with its message, in `ApiError.code`.
- **Paged lists**: `Pager` from `#lib/pager.svelte.ts` takes a function returning
  `{ items, next }` and gives `items`, `more`, `loadMore()`, `reload()`.
- **Data kept on the device** (IndexedDB, caches): register a cleaner with `onForget()` from
  `#lib/device.ts`, so it's wiped when a different account signs in or the account is deleted
  (it's told which: `previous`, `deleted`). Register it in a module the app always loads, or it
  won't be there to run.
  Settings of the device rather than the person go in `appDeviceKeys` (`src/lib/app/shell.ts`),
  so they stay.
  Records people create or change offline go through `#lib/db` (below), which already does this.
- **New third-party scripts or hosts**: add them to `src/lib/app/csp.ts`, or the CSP blocks them.
- **The look**: see [Components and themes](#components-and-themes).

## Languages

Every text people see goes through `t()` from `#lib/i18n/index.svelte.ts`, with the English as
the key (gettext style), so pages read as plain English and nothing has to be named:

```svelte
<script lang="ts">
  import { msg, t, tn } from '#lib/i18n/index.svelte.ts';
  import Trans from '#lib/components/Trans.svelte';
</script>

<h1>{t('Your notes')}</h1>
<p>{tn(count, '1 note', '{count} notes')}</p>
<Field label={t('Title')} id="title"><Input bind:value={title} /></Field>
<Trans text={msg('Shared with <b>{team}</b>.')} vars={{ team: team.name }}>
  {#snippet b(s: string)}<strong>{s}</strong>{/snippet}
</Trans>
```

- `{placeholders}`, never `${}` inside `t()`; counts with `tn()`, which uses each language's
  plural rules; a sentence with markup in it is one `<Trans>` (its `text` in `msg()` when it
  has a placeholder: in a quoted attribute Svelte reads `{name}` as code).
- A label in a list at the top of a module is `msg('…')` there and `t(item.label)` where it's
  shown, so it follows a change of language. Dates and numbers: `formatDate`, `formatNumber`,
  `formatWhen` (`#lib/format.ts`).
- **Adding a language**: a file in `src/lib/app/i18n/` (the app's own, never touched by a
  release) mapping each English text to its translation, listed in its `index.ts` with its own
  name and direction (`dir: 'rtl'` for Urdu, Arabic…). Account → Display then shows a language
  picker; the choice is kept on the device, and `lang` and `dir` are set before the first
  paint. Anything not translated shows in English.
- `npm run i18n` lists every text (`--missing` per language). It, and the unit tests, fail on a
  translation of a text that's no longer in the code, or one whose `{placeholders}` or `<tags>`
  differ from the English.
- Every request says the language (`Accept-Language`), so the backend's messages and emails
  come in it too: translate those in `backend-cloudflare/src/app/i18n.ts`.
- Right to left: the layout uses physical margins in places; check a right-to-left language's
  pages before shipping it, and prefer `margin-inline-start` and the like in new styles.

## Offline data

With `SYNC = "true"` on the backend, the app's own records live in IndexedDB first and sync
when there's a connection (PRD section 11). Read the rules in
[`docs/offline-data.md`](../docs/offline-data.md) before designing tables.

```ts
import { data, ME } from '#lib/db/index.svelte.ts';

const id = data.newId(); // a UUID v7, made here and kept by the backend
await data.put(ME, 'appointments', id, { patient: 'Ali', slot: '10:00' });
await data.put(ME, 'appointments', id, { note: 'first visit' }); // merges: patient and slot stay
await data.remove(ME, 'appointments', id);
const list = await data.list(ME, 'appointments');
const stop = data.onChange(() => reload()); // a write here, in another tab, or from the backend

const photo = await data.saveFile(ME, blob); // uploads in 8 MiB parts; keep `photo` in a field
const back = await data.file(ME, photo);
```

- **Spaces**: `ME` is the person's own data; a team's id is that team's, shared with its members.
  Call `data.follow(teamId)` once (opening the team) so its changes are pulled too.
- **When it syncs** (`src/lib/db/sync.ts`): on opening the app, on coming back online, on
  returning to the tab, 1.5 s after a write, and every 5 minutes, in one tab at a time. The
  outbox goes in batches of at most 100 changes; `rate_limited` waits as long as `Retry-After`
  says plus up to 2 s at random, and resends the same batch; no answer backs off up to 5 minutes.
- **What people see**: `SyncStatus` in the header while changes are waiting, `SyncRefused` when
  the backend refused some (with its message) or turned a team away. `syncState` has `pending`,
  `running`, `error`, `refused`, `lost` and `stale`.
- **Nothing made here is dropped without the person.** A refused change leaves the outbox for
  `syncState.refused` with what it set (`change.fields`), kept in IndexedDB until dismissed,
  so a page can show it beside the record to enter again. A team the backend turns away (the
  person removed, the team deleted, or a switch turned off by mistake) is set aside with its
  unsent changes until the person taps Try again or Discard.
- **Merging**: each record keeps `base` (the backend's), its `version`, and `fields` (`base`
  plus this device's unsent changes). Each change carries the version it was made on, so the
  backend can refuse a stale edit to a field the app guards. Pulled records replace `base`
  without losing unsent changes.
- **One database per account** (`starter-data-<account id>`): on a shared computer, one
  person signing in never wipes another's unsent work. Signing out gives the outbox 5 seconds,
  then deletes the account's database if everything reached the backend, or keeps it for the
  person's next sign-in here (the account page says so first). Deleting the account deletes it.
  A support tab works in its own database, filled from the backend and deleted when the
  session ends.
- **Its structure is versioned** (`UPGRADES` in `src/lib/db/local.ts`): add steps at the end,
  never edit one. When another tab opens a newer release, this one lets go of the database and
  `syncState.stale` asks for a reload.
- Records over 192 KB are refused on the device: keep large things as files (at most 1 GB).
- **Files**: `data.removeFile(space, id)` deletes one here at once and on the backend when it
  syncs (whoever added it, or a team admin; anyone else's attempt comes back as refused). Files
  fetched from other devices are kept for next time within 200 MB (`MAX_CACHED`), the least
  recently opened dropped first; files made here are never dropped that way.
- **Roles**: in a team, a viewer's changes are each refused (`forbidden`); hide the editing
  controls when `team.role === 'viewer'`.

## Components and themes

The look is [DaisyUI 5](https://daisyui.com/) on [Tailwind CSS 4](https://tailwindcss.com/),
with one theme of our own, **Daisy**. Pages are built from the components in
`src/lib/components/ui/`, each a Svelte component around DaisyUI's classes, with the
accessibility and translation done once. Pages may also use DaisyUI's classes and Tailwind's
utilities directly (`class="btn btn-soft"`, `class="flex gap-2"`).

To see every component in the theme, in light and dark and at each text size: `npm run dev`,
then open `/components` (`src/routes/(open)/components/`). It exists only under `npm run dev`:
a build answers 404 there and leaves the gallery out.

| Component                                                        | For                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`                                                          | A titled block of a page (DaisyUI's card): `title`, optional `description` and `actions`, then the content                                                                                               |
| `Button`                                                         | Buttons, and links that look like one (`href`). `variant`: `plain`, `primary`, `danger`, `danger-solid`, `link`, `outline`, `soft`, `ghost`, `dash`; `size`: `xs`, `small`, `md`, `lg`; `wide`; `square` |
| `Field` + `Input`, `Textarea`, `Select`, `FileInput`, `Range`    | A labelled control with an optional `hint`. The control takes its id, `aria-describedby` and `aria-invalid` from the `Field` around it                                                                   |
| `Segmented`, `RadioGroup`                                        | One choice out of a few, side by side; one out of a list, one under another (with a hint each)                                                                                                           |
| `Checkbox`, `Toggle`, `Rating`                                   | A box to tick, an on/off switch, stars to give or show a score                                                                                                                                           |
| `Badge`, `Notice`, `Status`, `Kbd`, `Indicator`                  | A short label (`tone`), a boxed message (`tone`: warning, info, success, error), a coloured dot, a key, a badge pinned to a corner                                                                       |
| `Divider`, `Skeleton`, `Progress`, `RadialProgress`, `Countdown` | A rule with "or" in it; shapes while loading; how far something has got; a share as a ring; a number that rolls                                                                                          |
| `List`, `Table`, `Stats` + `Stat`, `Timeline`                    | Rows between hairlines; a data table (`zebra`); figures side by side; things that happened, in order                                                                                                     |
| `Tabs`, `Collapse`, `Steps`, `Breadcrumbs`, `Pagination`         | Tabs over one panel (arrow keys); a heading that opens (`group` for an accordion); steps of a series; where a page sits; pages of a list                                                                 |
| `Modal`, `Drawer`, `Dropdown`, `Menu`, `Tooltip`, `Swap`         | A dialog; a panel from the side; a button that opens a list; links and actions; words on hover and focus; one of two icons                                                                               |
| `toast()` + `Toaster`                                            | `toast(t('Saved'), { tone: 'success' })` from anywhere; the root layout shows them                                                                                                                       |
| `Navbar`, `Hero`, `Footer`, `Dock`, `Carousel`, `ChatBubble`     | A bar with start, middle and end; a public page's opening; its foot; a phone's bottom bar; things that scroll sideways; a message                                                                        |

```svelte
<Field label="Email" hint="We'll send a code to it.">
  <Input type="email" bind:value={email} autocomplete="email" />
</Field>
<Button variant="primary" type="submit">Send</Button>
```

DaisyUI components without a Svelte one here, used straight from their classes when an app
needs them: `calendar` (needs a date-picker library, Cally), `fab`, `filter`, `join`, `mask`,
`diff`, `mockup-*`, `hover-3d`, `hover-gallery`, `text-rotate`, `megamenu`, `aura`, `otp`
(`CodeInput` covers codes) and `validator` (`Field`'s `invalid` covers it). DaisyUI's `stack` is
switched off, because `.stack` is our layout helper.

**Class names are written out in full.** Tailwind builds only the classes it finds in the
source, so `` `btn-${tone}` `` never works; the components map each choice to a full name
(`{ primary: 'btn-primary', … }`). A page of an app's own does the same. And a class of a page's
own must not be a DaisyUI component's name (`card`, `hero`, `label`, `loading`, `toast`, `menu`…),
or DaisyUI's styles join it.

Block components (`Panel`, `Field`, `Notice`, `List`, `Table`, `Segmented`, `Divider`, and the
new ones through the `flow` class) keep `--flow-space` below themselves, none as the last in
their container. A `.stack` or `.row` spaces its children with its `gap` instead, so there the
margins go. A page layout of its own that uses `gap` should carry `stack` or `row` too (as
`AuthShell` and the team page's sections do), or its children's margins add to the gap. Each
component declares its margin inside `:where()`, so a page can always override it.

`src/app.css` is Tailwind's entry: it loads Tailwind and DaisyUI, the theme, Tailwind's type
scale matched to the theme, the element defaults, the mode and text size, and the layout
helpers (`.stack`, `.row`, `.muted`, `.small`, `.hint`, `.error`, `.success`, `.pop` for
floating surfaces, `.flow`). It also gives pages short names for the theme's colours
(`--color-muted`, `--color-border`, `--color-surface`…), which follow the theme.

**Themes** are DaisyUI's theme variables plus a few of our own, one CSS file each in
`src/lib/themes/`:

- `daisy.css` is the one theme that ships, and the base: it lists everything a theme sets. A
  blue-grey palette, Inter (served from `static/fonts/`, licence beside it), 36 px controls,
  6 px corners on controls and 8 px on cards, flat. A theme added later overrides only what it
  changes, so a removed theme falls back to Daisy.
- Colours are written once as `light-dark(light, dark)`. The mode (Device, Light, Dark) sets
  `color-scheme`, which picks the half, so a theme has no separate dark block. (DaisyUI's own
  themes are light or dark each; ours carry both, so the mode switch keeps working.)
- A theme applies to whatever carries `data-theme`. `<html>` always does, and a preview or a
  section can carry another (the picker in Account → Display shows each theme this way).

To **add a theme**: create `<id>.css` with one `[data-theme='<id>']` rule inside `@layer base`,
holding the variables it changes from `daisy.css` (DaisyUI's theme generator at
daisyui.com/theme-generator gives the colours; write each as `light-dark()`), then add the id to
`src/lib/themes/index.ts`, to the `@import`s in `src/app.css` and to the `themes` list in the
inline script in `src/app.html` (`src/lib/themes/themes.test.ts` checks all of these agree, and
that a theme sets nothing Daisy doesn't define). Keep text at 4.5:1 against its background in
both modes. Its own font goes in `static/fonts/` with an `@font-face` in its file: the CSP
allows fonts from this site only. With two or more themes, Account → Display shows a picker.

To **change the app's default**, set `defaultTheme` in `src/lib/themes/index.ts` and `data-theme`
on `<html>` in `src/app.html`. Then put the theme's background colour in
`static/manifest.webmanifest` and in the `theme-color` metas in `src/app.html`; after loading,
the page sets the bar colour from the theme in use. To **offer only one look**, list one theme:
Account → Display then shows no theme choice. A person's choice is kept per device
(`starter:theme`, `starter:mode`, `starter:text`) and survives the device being handed to
another account.
