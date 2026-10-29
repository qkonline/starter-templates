// Signing in with Google (PRD R1.9), as high-yield-prep does it, by hand with fetch. The browser
// goes frontend -> /start -> Google -> /callback -> back to the frontend with a one-time code good
// for 60 seconds, which the frontend trades for a session at /exchange, so the token never sits
// in an address. A nonce in an HttpOnly cookie on this domain must match the one in `state`, so a
// sign-in can't be started by someone else's link; and only allowed frontend origins are
// returned to.

import { Hono } from 'hono';
import { ownerOf, signedIn } from '../account';
import { cleanEmail, deviceName, readBody } from '../checks';
import { b64url, fromB64url, randomToken, sameText, sha256 } from '../crypto';
import type { Config, Ctx } from '../env';
import { invalid, notFound, wrongCode } from '../errors';
import { perNetwork, type AppEnv } from '../middleware';

const NONCE_COOKIE = 'oauth_nonce';
const NONCE_SECONDS = 600;
const EXCHANGE_MS = 60_000;

/** The providers on, by name; one that's off is 404 everywhere. */
function provider(cfg: Config, name: string) {
  if (name === 'google' && cfg.google) return cfg.google;
  throw notFound();
}

/** `return` if it's a page on an allowed frontend origin, else null. */
function allowedReturn(cfg: Config, v: unknown): URL | null {
  if (typeof v !== 'string' || v.length > 2048) return null;
  try {
    const url = new URL(v);
    return cfg.origins.includes(url.origin) ? url : null;
  } catch {
    return null;
  }
}

const redirectUri = (ctx: Ctx, name: string) => `${ctx.api}/auth/oauth/${name}/callback`;

function nonceCookie(ctx: Ctx, value: string, maxAge: number) {
  const secure = ctx.api.startsWith('https:') ? '; Secure' : '';
  return `${NONCE_COOKIE}=${value}; Path=/api/auth/oauth; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

const readCookie = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((p) => p.trim().split('='))
    .find(([k]) => k === name)?.[1] ?? null;

/** `state` carries the nonce and where to go back to; the cookie carries the nonce alone. */
const packState = (nonce: string, ret: string) => b64url(new TextEncoder().encode(JSON.stringify({ n: nonce, r: ret })));

function unpackState(state: string | undefined): { n?: unknown; r?: unknown } {
  try {
    const v = JSON.parse(new TextDecoder().decode(fromB64url(state ?? '')));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** The claims of an ID token received straight from Google's token endpoint over TLS (OpenID Connect allows skipping the signature check there). */
function claims(idToken: unknown): Record<string, unknown> | null {
  if (typeof idToken !== 'string') return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(idToken.split('.')[1] ?? '')));
  } catch {
    return null;
  }
}

/** Trades Google's code for the person's verified email; a reason (`oauth_no_email`, `oauth_failed`) if not. */
async function googleEmail(ctx: Ctx, google: { clientId: string; clientSecret: string }, code: string): Promise<string | 'oauth_no_email' | 'oauth_failed'> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: redirectUri(ctx, 'google'),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => {
    console.error('Google token', e);
    return null;
  });
  if (!res?.ok) {
    if (res) console.error('Google token', res.status, await res.text().catch(() => ''));
    return 'oauth_failed';
  }
  const c = claims((await res.json<{ id_token?: string }>().catch(() => null))?.id_token);
  if (!c || !['https://accounts.google.com', 'accounts.google.com'].includes(c.iss as string) || c.aud !== google.clientId) return 'oauth_failed';
  if (typeof c.exp !== 'number' || c.exp * 1000 < Date.now()) return 'oauth_failed';
  const email = c.email_verified === true ? cleanEmail(c.email) : null;
  return email ?? 'oauth_no_email';
}

export const oauth = new Hono<AppEnv>();

oauth.get('/auth/oauth/:provider/start', (c) => {
  const ctx = c.var.ctx;
  const google = provider(ctx.cfg, c.req.param('provider'));
  const ret = allowedReturn(ctx.cfg, c.req.query('return'));
  if (!ret) throw invalid("Signing in can't return to that page.");
  const nonce = randomToken(24);
  const to = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  to.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: redirectUri(ctx, 'google'),
    response_type: 'code',
    scope: 'openid email profile',
    state: packState(nonce, ret.href),
    prompt: 'select_account',
  }).toString();
  c.header('set-cookie', nonceCookie(ctx, nonce, NONCE_SECONDS));
  c.header('cache-control', 'no-store');
  return c.redirect(to.href, 302);
});

oauth.get('/auth/oauth/:provider/callback', async (c) => {
  const ctx = c.var.ctx;
  const google = provider(ctx.cfg, c.req.param('provider'));
  const state = unpackState(c.req.query('state'));
  // The return address comes from `state`, checked again: never anywhere not allowed.
  const ret = allowedReturn(ctx.cfg, state.r) ?? allowedReturn(ctx.cfg, ctx.cfg.origins[0] ? `${ctx.cfg.origins[0]}/auth/callback` : null);
  if (!ret) throw notFound();
  const back = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) ret.searchParams.set(k, v);
    c.header('set-cookie', nonceCookie(ctx, '', 0));
    c.header('cache-control', 'no-store');
    return c.redirect(ret.href, 302);
  };
  const cookie = readCookie(c.req.header('cookie'), NONCE_COOKIE);
  if (!cookie || typeof state.n !== 'string' || !sameText(cookie, state.n)) return back({ error: 'oauth_failed' });
  if (c.req.query('error')) return back({ error: c.req.query('error') === 'access_denied' ? 'oauth_denied' : 'oauth_failed' });
  const code = c.req.query('code');
  if (!code || code.length > 2048) return back({ error: 'oauth_failed' });
  const email = await googleEmail(ctx, google, code);
  if (email === 'oauth_no_email' || email === 'oauth_failed') return back({ error: email });
  if ((await ctx.db.userByEmail(email))?.suspended) return back({ error: 'account_suspended' });
  const { user, isNew } = await ownerOf(ctx, email);
  const once = randomToken(32);
  const now = Date.now();
  await ctx.db.saveOAuthCode({ hash: await sha256(once), userId: user.id, isNew, expires: now + EXCHANGE_MS, now });
  return back({ code: once });
});

oauth.post('/auth/oauth/exchange', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  const b = await readBody(c.req.raw, ['code']);
  if (typeof b.code !== 'string' || !b.code || b.code.length > 100) throw wrongCode();
  // Gone once read: two exchanges at once get one session.
  const row = await ctx.db.takeOAuthCode(await sha256(b.code), Date.now());
  const user = row ? await ctx.db.userById(row.user_id) : null;
  if (!row || !user) throw wrongCode();
  return c.json(await signedIn(ctx, user, deviceName(c.req.header('user-agent')), !!row.is_new));
});
