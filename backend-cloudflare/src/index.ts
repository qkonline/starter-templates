// The starter API: contract/openapi.yaml on Cloudflare Workers, with Hono, D1 and R2.
//
// - Signing in (routes/auth.ts, passkeys.ts, oauth.ts) and the account (routes/me.ts), on the
//   data layer in db/ (every D1 query) and R2 for photos.
// - JSON in and out under /api, `Authorization: Bearer <token>`, no cookies (except the nonce
//   for the round trip to Google, on this domain only).
//
// An app adds its own routes in src/app/, never changing the core's; see README.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { d1 } from './db';
import type { Env } from './env';
import { alert, postAlert } from './alerts';
import { sha256 } from './crypto';
import { finishCleanups } from './deletion';
import { runDueJobs, whenJobDies } from './jobs';
import { Refusal } from './errors';
import { devOutbox } from './mail';
import { clientCheck, context, supportGuard, type AppEnv } from './middleware';
import { recordReport, serverReport } from './reports';
import { appRoutes } from './app/routes';
import { admin } from './routes/admin';
import { auth } from './routes/auth';
import { contact } from './routes/contact';
import { me, photos } from './routes/me';
import { notifications } from './routes/notifications';
import { oauth } from './routes/oauth';
import { passkeys } from './routes/passkeys';
import { sync } from './routes/sync';
import { teams } from './routes/teams';

const app = new Hono<AppEnv>().basePath('/api');

// Only the frontends listed in ALLOWED_ORIGINS may call from a browser. Requests without an
// Origin (curl, the contract tests) are answered too: the bearer token is the check.
app.use(
  '*',
  cors({
    origin: (origin, c) => (c.env.ALLOWED_ORIGINS ?? '').split(',').some((o: string) => o.trim() === origin) ? origin : null,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['authorization', 'content-type', 'x-client-version'],
    exposeHeaders: ['retry-after'],
    maxAge: 86400,
  }),
);
app.use('*', context);
// A copy of the app older than MIN_CLIENT is told to update before anything else (not on these two).
app.use('*', clientCheck(['/api/health', '/api/features']));
// A support session is held back from the account and security paths, whichever route has them.
app.use('*', supportGuard);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/features', (c) => {
  const { cfg } = c.var.ctx;
  return c.json({
    teams: cfg.teams,
    admin: !!cfg.admin,
    push: cfg.push ? { vapidPublicKey: cfg.push.publicKey } : null,
    sync: cfg.sync,
    minClient: cfg.minClient?.text ?? null,
  });
});

app.get('/dev/mail', (c) => {
  if (!c.var.ctx.cfg.devMail) throw new Refusal(404, 'not_found', "That isn't here.");
  return c.json({ mail: devOutbox });
});

app.route('/', auth);
app.route('/', passkeys);
app.route('/', oauth);
app.route('/', me);
app.route('/', photos);
app.route('/', notifications);
app.route('/', teams);
app.route('/', admin);
app.route('/', contact);
app.route('/', sync);

// The app's own paths: src/app/routes.ts (README, "Building on it").
app.route('/', appRoutes);

app.notFound((c) => c.json({ code: 'not_found', message: "That isn't here." }, 404));

app.onError(async (e, c) => {
  if (e instanceof Refusal) {
    if (e.retryAfter) c.header('retry-after', String(e.retryAfter));
    return c.json({ code: e.code, message: e.message }, e.status);
  }
  console.error(e);
  // Kept with the browsers' reports for the admin area (PRD R7.2); Workers logs keep the rest.
  const ctx = c.var.ctx;
  if (ctx) {
    const report = serverReport(e, `${c.req.method} ${c.req.path}`);
    await recordReport(ctx, report);
    const tell = postAlert(c.env, await sha256(report.key.join('\n')), report.message, report.url ?? '', report.detail ?? '');
    ctx.waitUntil ? ctx.waitUntil(tell) : await tell;
  }
  return c.json({ code: 'server_error', message: 'Something went wrong on our side. Try again in a minute.' }, 500);
});

// Durable Object classes must be exported from the Worker's main module.
export { SyncMeter } from './sync/meter';
export { SyncSpace } from './sync/space';

/** The daily cron (wrangler.toml); the other, every minute, runs background jobs. */
const DAILY = '17 3 * * *';

// A job that gave up after its last try needs a person.
whenJobDies((env, kind, message) => alert(env, `Background job "${kind}" gave up`, message, `job ${kind}`));

export default {
  fetch: app.fetch,
  // Once a day (wrangler.toml, [triggers]): clear out what has run out (Db.sweep): codes, counts,
  // support sessions, expired invites, notifications after 90 days, the audit log after a year.
  async scheduled(event, env) {
    try {
      if (event.cron === DAILY) {
        await d1(env.DB).sweep(Date.now());
        await finishCleanups(env);
      } else await runDueJobs(env);
    } catch (e) {
      await alert(env, event.cron === DAILY ? 'The daily sweep failed' : 'Running background jobs failed', String((e as Error)?.stack ?? e), `cron ${event.cron}`);
      throw e;
    }
  },
} satisfies ExportedHandler<Env>;
