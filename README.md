# Starter templates

Starting points for new web apps: a frontend and a backend that meet only at an API contract, so
either side can be swapped for another.

| Folder | What it is |
|---|---|
| [`contract/`](contract) | The API as OpenAPI 3.1 (`openapi.yaml`), the TypeScript types made from it, and the tests any backend must pass |
| [`frontend-sveltekit/`](frontend-sveltekit) | SvelteKit, built as static files (Cloudflare Pages or any static host); talks to the backend only through the contract |
| [`backend-cloudflare/`](backend-cloudflare) | Hono on Cloudflare Workers, with D1 and R2; fits the Workers free plan |

What they do together is in [`docs/PRD.md`](docs/PRD.md): sign-in by email and password (hashed in
the browser, so the server stays within the free plan's CPU time), passkeys, optional Google and
email-code sign-in, Turnstile, sessions, the account page, an installable offline app, push
notifications, security headers, error reports, optional analytics (PostHog and/or Google
Analytics, after consent), optional teams with invites and roles, an optional admin area, display
preferences, and a contact form.

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

## Starting a new app

Copy `frontend-sveltekit/` and a backend, give the app its own `saltPrefix` (never changed once
people have passwords), then follow `backend-cloudflare/README.md` (`npm run setup`, then
`npm run deploy`) and `frontend-sveltekit/README.md`.

## Licence

MIT, see [LICENSE](LICENSE).
