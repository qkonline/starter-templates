# Contract

The API between every starter frontend and every starter backend. A frontend calls only what
`openapi.yaml` lists; a backend is done when the tests here pass against it.

What it covers, the core every app shares:

- signing in by email and password (the default; the browser does the slow hashing, see
  `password.ts`), by passkey, and by Google or emailed code where an app switches them on;
- forgetting the password (a code by email), confirming the address, Turnstile CAPTCHA;
- sessions: a bearer token per device, listing them, signing one or all others out;
- the account: name, email change confirmed by code, photo, export, deletion.

And the optional parts each app switches on, listed at `/features`:

- notifications (always) and push (on with VAPID keys);
- teams: admins and members, invites by email, never without an admin;
- the admin area: finding, suspending and deleting people, support sessions, the audit log;
- contact messages and feedback, and error and CSP reports (always).

An app adds its own paths beside these and leaves these as they are.

## Files

- `openapi.yaml`: the contract. Every rule a backend must keep (limits, what's stored, which
  error for what) is written in its descriptions.
- `types.ts`: TypeScript types generated from it, for frontends (`@starter/contract/types`).
  Never edit it by hand; run `npm run types`.
- `password.ts`: the one way a password becomes the `passwordKey` a backend receives
  (`@starter/contract/password`), used by frontends and the tests.
- `tests/`: the contract tests, plain HTTP against a running backend.

## Commands

```bash
npm install
npm run lint     # check openapi.yaml (Redocly)
npm run types    # regenerate types.ts after changing openapi.yaml
npm run check    # lint + typecheck

# Against a backend running locally, with dev mail on and no mail provider:
API_URL=http://localhost:8787/api npm test
npx vitest run tests/sessions.test.ts       # one file
npx vitest run -t 'a code works once'       # one test
```

`API_URL` defaults to `http://localhost:8787/api`, `APP_URL` (the frontend origin the
backend allows OAuth to return to) to `http://localhost:5173`, and `ADMIN_EMAIL` (an address the
backend lists as an admin) to `admin@example.test`. The admin tests sign that account up the
first time, with the tests' password, and sign in to it after; they confirm its email through
`/dev/mail`. The Google tests run only when
the backend lists `google` at `/auth/methods`; otherwise they check that it's absent. Before any test runs, the backend must answer
`/health` and `/dev/mail`, or the run stops and says which is missing.

Tests sign people up with passwords, so they send little mail. Optional parts (email codes,
Google, the CAPTCHA, required confirmation) are read from `/auth/methods`, and teams, the admin area
and push from `/features`: their tests run when the backend has them on and check that they answer
`not_found` when it doesn't. With a CAPTCHA on, the tests send
Turnstile's dummy token, so a local backend must use Turnstile's always-pass test secret.

## How the tests check a backend

Every reply goes through `expectReply`, which fails if the status isn't one the contract lists
for that operation, or if the body doesn't match its schema exactly (no missing fields, no extra
ones). Errors must carry one of the contract's `code`s and a message. Codes are read from the dev
outbox, `GET /dev/mail`, which a backend serves only in local development.

Passkeys are tested as far as an HTTP client can go: the challenges and every refusal. Making and
using a real passkey needs a WebAuthn authenticator, so the frontend's browser tests cover it.

## The tests of the optional parts

- `features.test.ts`: `/features`; each part that's off answers `not_found`; nobody is an admin by
  signing up.
- `notifications.test.ts`: the list, marking read (ids, all, others' ids ignored), paging 50 at a
  time with `next` (51 notifications from invites by two admins, teams on); push (on): subscribing
  with real keys to `https://push.invalid/…` (a local backend must allow that host for tests), whose host never resolves, so `/me/push/test` must still answer 204
  and add a notification while keeping the subscription (only a 404 or 410 removes one, which the
  backend's unit tests cover, since no push service can be faked here); at most 5 tests an hour.
- `teams.test.ts`: making, naming, members and roles; the last admin under concurrent demotions
  and leaving; deleting an account hands its teams on; invites by link (proves and confirms the
  address) and by id (confirmed email only), the wrong account gets `not_found`, decline,
  withdraw, conflicts; only a confirmed email invites; resending (too soon is `rate_limited`; the
  test waits as long as `Retry-After` says, a minute unless the local backend shortens it, then
  the old link stops working).
- `admin.test.ts`: who is an admin; finding people; suspending (sessions end, every sign-in path
  this client can reach answers `account_suspended`, unsuspending); deleting; support sessions
  (refused on every listed account and security path and on `/admin`, a code works once, the
  person can end it, suspending ends it); admins can't act on an admin; the audit log. That a
  support session ends after an hour is in the backend's unit tests: a run can't wait an hour.
- `contact.test.ts`: signed in or out (`email` required signed out), the CAPTCHA, 20 a day per
  account, and the messages in the admin area.
- `telemetry.test.ts`: always 204 whatever arrives; repeats counted (by message and first stack
  line; CSP by directive, blocked address and page, in either form); only the first 5
  CSP reports of a batch kept; clearing.

Passkeys and invites need a confirmed email, so those tests confirm through `/dev/mail` first. The
take-back test (`reset.test.ts`) checks that a squatter's sessions, push subscription and passkey
attempt all come to nothing once the owner resets the password.
