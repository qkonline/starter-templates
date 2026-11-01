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

The frontend's look comes from a **theme**, and its pages are built from a small set of
**components** (`frontend-sveltekit/src/lib/components/ui/`: `Panel`, `Button`, `Field` with
`Input`, `Textarea` or `Select`, `Segmented`, `Badge`, `Notice`, `Divider`, `List`, `Table`).
Components take every colour, font, size, corner, shadow and control style from the theme, so
changing the theme restyles the whole app; nothing on a page needs to change.

One theme comes with it, **Fusion**, which sits between two well-known design systems: the
colours and font of Elastic's [EUI](https://eui.elastic.co/) (blue-grey neutrals, one strong
blue, Inter served from the site), sized halfway between EUI's roomy controls and
[Ant Design](https://ant.design/)'s compact ones (36 px fields and buttons, 15 px text, 20 px
panel padding), with Ant's clearer control states (white bordered buttons tinted blue on hover,
a blue border and glow on focus, bordered tags, a rule under panel titles). Type stays light:
400 for text, 500 for headings and buttons.

It works in light and dark. People choose the mode (Device, Light or Dark) and the text size in
Account → Display; the choice is kept on their device. With one theme there is no theme choice
there; add a theme (below) and the picker appears.

All paths below are in `frontend-sveltekit/`.

**Change the app's default theme**

1. Set `defaultTheme` in `src/lib/themes/index.ts` to the theme's id.
2. Set the same id on `<html data-theme="…">` in `src/app.html`.
3. Put that theme's background colour in `static/manifest.webmanifest` (`background_color`,
   `theme_color`) and in the two `theme-color` metas in `src/app.html`.

**Restyle the look**: edit `src/lib/themes/fusion.css` (or, once there are several, the
theme's own file). Every value there is a token, grouped and commented: colours
(`--color-accent`, `--color-bg`…), type (`--font-sans`, `--text-md`, `--weight-heading`…), shape
(`--radius`, `--shadow-pop`), and how controls look (`--control-height`,
`--control-focus-shadow`, `--button-plain-bg`, `--segmented-selected-bg`, `--panel-shadow`,
`--header-height`…). Colours are written once for both modes as `light-dark(<light>, <dark>)`.
`fusion.css` lists every token a theme can set. To make everything roomier or more compact,
change `--control-height`, `--button-padding-x`, `--panel-padding` and `--text-md` together.

**Add a theme**

1. Create `src/lib/themes/<id>.css` with one rule, `[data-theme='<id>'] { … }`.
2. Put in it only the tokens that differ from Fusion (copy their lines from `fusion.css` and
   change the values); the rest come from Fusion. Keep text at 4.5:1 against its background
   in both modes.
   For a font of its own, put the files in `static/fonts/` and add an `@font-face` in the
   theme's file; the site's security policy (CSP) only allows fonts from the site itself.
3. Add `{ id: '<id>', label: '<Name>' }` to `themes` in `src/lib/themes/index.ts`, add
   `@import './lib/themes/<id>.css';` to `src/app.css`, and add `'<id>'` to the `themes` list in
   the small script in `src/app.html`.
4. Run `npm test`: `src/lib/themes/themes.test.ts` fails if those three places disagree, or if
   the theme sets a token Fusion doesn't define (usually a typo).

**Offer only one look**: leave a single theme in `src/lib/themes/index.ts` (and remove the other
`@import`s and ids). Account → Display then shows no theme choice; mode and text size stay.

**Remove a theme**: delete its file and the three entries above. Anyone who had chosen it gets
the default theme.

**Spacing**: block components (`Panel`, `Field`, `Notice`, `List`, `Table`, `Segmented`, `Divider`) keep
`--flow-space` (1rem) below themselves, and none when they're the last thing in their container.
Inside a `.stack` or `.row`, the container's `gap` spaces them instead, so spacing never doubles.
Change `--flow-space` in `src/app.css` to make the whole app looser or tighter. `Button` and
`Badge` sit in a line of text or a row, so they take their spacing from it.

More detail is in [`frontend-sveltekit/README.md`](frontend-sveltekit/README.md#components-and-themes).

## Starting a new app

1. **Start from a release, not from a working copy.** Take a tagged version from GitHub, which
   holds only what's meant to be shared (a working folder can also hold notes and tool files
   kept out of git):

   ```sh
   git clone --depth 1 --branch v0.1.0 https://github.com/qkonline/starter-templates.git my-app
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

Staging, backups and restoring, alerting, database changes that don't break a rollback, and what
to do when something goes wrong: [`docs/operations.md`](docs/operations.md).

## Licence

MIT, see [LICENSE](LICENSE).
