# Starter templates

Starting points for new web apps: a frontend and a backend that meet only at an API contract, so
either side can be swapped for another.

| Folder                                      | What it is                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`contract/`](contract)                     | The API as OpenAPI 3.1 (`openapi.yaml`), the TypeScript types made from it, and the tests any backend must pass        |
| [`frontend-sveltekit/`](frontend-sveltekit) | SvelteKit, built as static files (Cloudflare Pages or any static host); talks to the backend only through the contract |
| [`backend-cloudflare/`](backend-cloudflare) | Hono on Cloudflare Workers, with D1 and R2; fits the Workers free plan                                                 |

What they do together is in [`docs/PRD.md`](docs/PRD.md): sign-in by email and password (hashed in
the browser, so the server stays within the free plan's CPU time), passkeys, optional Google and
email-code sign-in, Turnstile, sessions, the account page, an installable offline app, push
notifications, security headers, error reports, optional analytics (PostHog and/or Google
Analytics, after consent), optional teams with invites and roles, an optional admin area, display
preferences, and a contact form. Optionally, offline data: kept in IndexedDB on
the device and synced in batches when there's a connection, a Durable Object per person or team
on the backend; apps that use it follow [`docs/offline-data.md`](docs/offline-data.md), so records
made on several devices at once merge without clashing.

## Using them

Each folder is its own project with its own README and `package.json`; there is no tooling at
this level. Everything needs Node 24 (`.node-version`).

```sh
cd backend-cloudflare && npm ci && npm run db:migrate && npm run dev:all   # API on :8787
cd contract && npm ci && API_URL=http://localhost:8787/api npm test        # the backend passes the contract
cd frontend-sveltekit && npm ci && npm run dev                             # app on :5180
```

A change to what crosses between frontend and backend starts in `contract/openapi.yaml`, then
`npm run types`, then the contract tests, then the code on each side.

## Themes and components

The frontend's look is [DaisyUI 5](https://daisyui.com/) on [Tailwind CSS 4](https://tailwindcss.com/),
in a theme of its own, **Daisy**: a calm blue-grey palette, Inter served from the site, 36 px
controls, flat cards. Pages are built from Svelte components around DaisyUI's classes
(`frontend-sveltekit/src/lib/components/ui/`): `Panel`, `Button`, `Field` with `Input`,
`Textarea`, `Select`, `FileInput` or `Range`, `Segmented`, `RadioGroup`, `Checkbox`, `Toggle`,
`Rating`, `Badge`, `Notice`, `Status`, `List`, `Table`, `Stats`, `Tabs`, `Collapse`, `Modal`,
`Drawer`, `Dropdown`, `Menu`, `Tooltip`, `toast()`, `Pagination`, `Steps`, `Breadcrumbs`,
`Progress`, `Timeline`, `Navbar`, `Hero`, `Footer`, `Dock`, `Carousel` and more. Each does its
accessibility and translation once; pages may also use DaisyUI's classes and Tailwind's
utilities directly.

To see them all, in light and dark and at each text size: `npm run dev` in
`frontend-sveltekit/`, then open `/components` (development only; a build leaves it out).

It works in light and dark. People choose the mode (Device, Light or Dark) and the text size in
Account → Display; the choice is kept on their device. With one theme there is no theme choice
there; add a theme and the picker appears.

All paths below are in `frontend-sveltekit/`.

**Restyle the look**: edit `src/lib/themes/daisy.css`. It holds DaisyUI's theme variables
(`--color-primary`, `--color-base-100`…, `--radius-field`, `--size-field` for control height)
and a few of our own (`--color-heading`, `--color-muted`, `--color-link`), each colour written
once for both modes as `light-dark(<light>, <dark>)`. DaisyUI's theme generator
(daisyui.com/theme-generator) is a good place to try colours.

**Add a theme**

1. Create `src/lib/themes/<id>.css` with one rule, `[data-theme='<id>'] { … }`, inside
   `@layer base`.
2. Put in it only the variables that differ from Daisy (copy their lines from `daisy.css` and
   change the values); the rest come from Daisy. Keep text at 4.5:1 against its background in
   both modes. For a font of its own, put the files in `static/fonts/` and add an `@font-face`
   in the theme's file; the site's security policy (CSP) only allows fonts from the site itself.
3. Add `{ id: '<id>', label: '<Name>' }` to `themes` in `src/lib/themes/index.ts`, add
   `@import './lib/themes/<id>.css';` to `src/app.css`, and add `'<id>'` to the `themes` list in
   the small script in `src/app.html`.
4. Run `npm test`: `src/lib/themes/themes.test.ts` fails if those three places disagree, or if
   the theme sets a variable Daisy doesn't define (usually a typo).

**Change the app's default theme**: set `defaultTheme` in `src/lib/themes/index.ts` and the same
id on `<html data-theme="…">` in `src/app.html`, and put that theme's background colour in
`static/manifest.webmanifest` (`background_color`, `theme_color`) and in the two `theme-color`
metas in `src/app.html`.

**Spacing**: block components (`Panel`, `Field`, `Notice`, `List`, `Table`, `Segmented`,
`Divider`…) keep `--flow-space` (1rem) below themselves, and none when they're the last thing in
their container. Inside a `.stack` or `.row`, the container's `gap` spaces them instead, so
spacing never doubles. Change `--flow-space` in `src/app.css` to make the whole app looser or
tighter.

More detail, and the full list of components, is in
[`frontend-sveltekit/README.md`](frontend-sveltekit/README.md#components-and-themes).

## Starting a new app

1. **Start from a release, not from a working copy.** Take a tagged version from GitHub, which
   holds only what's meant to be shared (a working folder can also hold notes and tool files
   kept out of git):

   ```sh
   git clone --depth 1 --branch v0.3.3 https://github.com/qkonline/starter-templates.git my-app
   cd my-app && rm -rf .git && git init
   ```

2. **Keep the three folders side by side.** `contract/` comes too, even with only one frontend
   and one backend: the frontend installs it (`"@starter/contract": "file:../contract"`), the
   backend's tests and the contract suite read it, and it's where the app's own paths are
   written first. Drop the backends the app doesn't use.
3. **Write down where it came from.** `TEMPLATE_VERSION` at the root says which release this
   is; keep it, and when taking a later release's fixes, read `CHANGELOG.md` from that version
   on.
4. Give the app its name: `APP_NAME` in `backend-cloudflare/wrangler.toml` salts every password,
   so it's never changed once people have passwords (`npm run predeploy` refuses `starter`).
5. Choose its default theme or make its own (above), then follow `backend-cloudflare/README.md`
   (`npm run setup`, then `npm run deploy`) and `frontend-sveltekit/README.md`.
6. Add the app's own paths, tables and pages beside the core ones, in the places made for them
   (see "Building on it" in each folder's README), so a later release's fixes can be taken
   without merging by hand.

## Running it

Before the first real app: a dry run on a throwaway Cloudflare account,
[`docs/first-deploy.md`](docs/first-deploy.md). Staging, backups and restoring, alerting, database changes that don't break a rollback, and what
to do when something goes wrong: [`docs/operations.md`](docs/operations.md).

## Licence

MIT, see [LICENSE](LICENSE).
