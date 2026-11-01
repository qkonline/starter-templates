// The Hono pieces every route uses: the request's context, who's signed in, and the switch that
// holds unconfirmed people back from an app's own routes.

import { createMiddleware } from 'hono/factory';
import { isAdmin, sessionFor } from './account';
import { d1, type SessionRow, type UserRow } from './db';
import { config, type Config, type Ctx, type Env } from './env';
import { forbidden, notFound, Refusal, signedOut, tooMany, unverified } from './errors';
import { languageOf } from './i18n';
import { networkOf } from './network';

export type AppEnv = {
  Bindings: Env;
  Variables: { ctx: Ctx; session: SessionRow; user: UserRow };
};

/** Builds the context every handler reads: settings, data layer, network, own address. */
export const context = createMiddleware<AppEnv>(async (c, next) => {
  const url = new URL(c.req.url);
  const api = `${url.origin}/api`;
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  c.set('ctx', {
    env: c.env,
    cfg: config(c.env, api),
    db: d1(c.env.DB),
    ip,
    network: networkOf(ip),
    api,
    lang: languageOf(c.req.header('accept-language')),
    waitUntil: (p) => {
      try {
        c.executionCtx.waitUntil(p);
      } catch {
        // No execution context (unit tests): the work runs on, unawaited.
      }
    },
  });
  await next();
});

/**
 * 426 `client_outdated` for a frontend built before MIN_CLIENT (its X-Client-Version), except on
 * `open` paths. A request without the header (scripts, tests, other clients) is let through.
 */
export const clientCheck = (open: string[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const min = c.var.ctx.cfg.minClient;
    const sent = c.req.header('x-client-version');
    if (min && sent && !open.includes(c.req.path) && c.req.method !== 'OPTIONS') {
      const at = Date.parse(sent);
      if (!Number.isNaN(at) && at < min.at)
        throw new Refusal(426, 'client_outdated', 'This version of the app is out of date. Update it to carry on; nothing you saved is lost.');
    }
    await next();
  });

/** The bearer token sent with the request, if any. */
export const bearer = (header: string | undefined) => header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;

/** Signed in, or 401 `signed_out`. Sets `user` and `session`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  // Once is enough when a route and the routes around it both ask.
  if (c.var.user) return next();
  const found = await sessionFor(c.var.ctx, bearer(c.req.header('authorization')));
  if (!found) throw signedOut();
  c.set('session', found.session);
  c.set('user', found.user);
  await next();
});

/**
 * For an app's own routes, after `requireUser`: when the app requires confirmed email
 * (REQUIRE_VERIFIED_EMAIL), someone who hasn't confirmed yet gets 403 `email_unverified`. The
 * core routes never use it, so the person can still confirm, change the address, or leave.
 */
export const requireVerifiedEmail = createMiddleware<AppEnv>(async (c, next) => {
  const { cfg } = c.var.ctx;
  if (cfg.requireVerifiedEmail && !c.var.user.email_verified) throw unverified();
  await next();
});

/**
 * For what an account must have proved its address for, whatever REQUIRE_VERIFIED_EMAIL says:
 * adding a passkey (it would outlast the owner taking the address back, PRD R1.8) and sending
 * invites (mail from the app's quota, to anyone). 403 `email_unverified` until confirmed.
 */
export function needsConfirmedEmail(user: UserRow): void {
  if (!user.email_verified) throw unverified();
}

/**
 * Requests per network to a route anyone can call, on top of the limits kept in D1: Cloudflare's
 * rate limiting binding (wrangler.toml, LIMITER). Off in local development, like every
 * per-network limit.
 */
export const perNetwork = createMiddleware<AppEnv>(async (c, next) => {
  const { env, cfg, network } = c.var.ctx;
  if (env.LIMITER && !cfg.devMail) {
    const { success } = await env.LIMITER.limit({ key: network });
    if (!success) throw tooMany(60, 'Too many requests. Try again in a minute.');
  }
  await next();
});

/** An optional part (`/features`): switched off, every one of its paths is 404 `not_found`. */
export const requireFeature = (on: (cfg: Config) => unknown) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!on(c.var.ctx.cfg)) throw notFound();
    await next();
  });

/**
 * The admin area: on (else 404), signed in (else 401), and an admin in an ordinary session (else
 * 403). A support session is never let in, even one opened as someone who later became an admin.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.ctx.cfg.admin) throw notFound();
  await requireUser(c, async () => {});
  if (c.var.session.support || !isAdmin(c.var.ctx, c.var.user)) throw forbidden('Only the app\'s admins can do that.');
  await next();
});

/**
 * The account and security paths a support session may not touch (PRD R6.3): changing the name,
 * deleting, the password, email, photo, export, sessions, passkeys and push. Reading `GET /me`
 * and the rest of the app is allowed.
 */
export function supportBarred(method: string, path: string): boolean {
  const p = path.replace(/^\/api/, '');
  if (p === '/me') return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  return /^\/me\/(password|email|photo|export|sessions|passkeys|push)(\/|$)/.test(p);
}

/** Before every route: a support session on a barred path gets 403 `forbidden`. */
export const supportGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== 'OPTIONS' && supportBarred(c.req.method, c.req.path)) {
    // Push switched off is 404 on all its paths, support session or not.
    if (/^\/api\/me\/push(\/|$)/.test(c.req.path) && !c.var.ctx.cfg.push) throw notFound();
    await requireUser(c, async () => {});
    if (c.var.session.support) throw forbidden("A support session can't change the account's sign-in or security settings.");
  }
  await next();
});

/** The signed-in person if a working token was sent, else nothing: for paths open to both. */
export const maybeUser = createMiddleware<AppEnv>(async (c, next) => {
  const found = await sessionFor(c.var.ctx, bearer(c.req.header('authorization')));
  if (found) {
    c.set('session', found.session);
    c.set('user', found.user);
  }
  await next();
});
