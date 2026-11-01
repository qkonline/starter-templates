// What the Worker is given (wrangler.toml bindings, vars and secrets), and the app's settings
// read from them once per request.

import type { Db } from './db';
import type { SyncMeter } from './sync/meter';
import type { SyncSpace } from './sync/space';

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  /** Synced files (sync on), under sync/ in the same bucket as the photos. */
  FILES: R2Bucket;
  /** One Durable Object per space of synced data: a person's own, or a team's. */
  SPACES: DurableObjectNamespace<SyncSpace>;
  /** The whole app's daily sync totals (src/sync/meter.ts). */
  METER: DurableObjectNamespace<SyncMeter>;
  /** Caps on the whole app's sync a day: changes, and bytes of files started. */
  SYNC_APP_CHANGES_PER_DAY?: string;
  SYNC_APP_FILE_BYTES_PER_DAY?: string;
  /** Requests per network to the routes that need no sign-in. Absent in unit tests. */
  LIMITER?: RateLimit;
  /** The passwordKey salt prefix: lower case, digits and dashes. Never changed once in use. */
  APP_NAME: string;
  /** The app's name as people see it, in emails and on passkeys. */
  APP_TITLE?: string;
  /** Comma-separated frontend origins: CORS, and where Google may send people back to. */
  ALLOWED_ORIGINS: string;
  /** The passkey site: this domain and its subdomains. */
  RP_ID?: string;
  /** Who emails come from, e.g. "Starter <hello@example.com>". */
  MAIL_FROM?: string;
  /** Resend's API key (a secret). Without it, mail goes to the dev outbox, or fails. */
  RESEND_API_KEY?: string;
  /** Local development only: keep mail at /dev/mail (when there's no RESEND_API_KEY). */
  DEV_MAIL?: string;
  /** "true" to let people sign in by an emailed code. */
  EMAIL_CODE?: string;
  /** "true" to hold people back on the app's own routes until they confirm their email. */
  REQUIRE_VERIFIED_EMAIL?: string;
  /** Turnstile: the public site key, and the secret (a secret). Both set, the CAPTCHA is on. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Google: both set, signing in with Google is on. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "true" for teams (admins, members, invites). Off, /teams and /invites are 404. */
  TEAMS?: string;
  /** "true" for offline data kept in step with the backend (/sync). Off, /sync is 404. */
  SYNC?: string;
  /** "true" for the admin area, for the confirmed accounts in ADMIN_EMAILS. Off, /admin is 404. */
  ADMIN?: string;
  /** Comma-separated emails of the app's admins. */
  ADMIN_EMAILS?: string;
  /** Push: the public key (a var) and the private key (a secret). Both set, push is on. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Who push services may contact about this app's pushes: a mailto: or https: address. */
  VAPID_SUBJECT?: string;
  /**
   * A chat webhook (Slack, Discord, Google Chat…; a secret) told when something needs a person:
   * a server error, mail that couldn't go, a job or cleanup that keeps failing (src/alerts.ts).
   */
  ALERT_WEBHOOK?: string;
  /** Where contact messages are also emailed, if anywhere. */
  CONTACT_EMAIL?: string;
  /** The frontend's address, for links in emails (invites). Defaults to the first allowed origin. */
  APP_URL?: string;
  /**
   * The secret the stored hashes of emailed codes are keyed with (a secret; `npm run setup` makes
   * it). Without it, a local API uses a fixed dev value and anywhere else refuses to make codes.
   */
  CODE_PEPPER?: string;
  /**
   * PBKDF2 rounds the browser makes the passwordKey with (600000 when unset). To raise them, set
   * the new number here and the old one in PASSWORD_PREVIOUS_ITERATIONS: browsers then send a
   * key made each way, and each account moves to the new rounds as it signs in. Once most have,
   * remove PASSWORD_PREVIOUS_ITERATIONS; anyone left sets a new password with "Forgot password".
   */
  PASSWORD_ITERATIONS?: string;
  PASSWORD_PREVIOUS_ITERATIONS?: string;
  /**
   * The oldest frontend build still served (ISO 8601, as the frontend sends in X-Client-Version).
   * Raise it when a change would break copies of the app installed before it; they're told to
   * update. Unset, every build is served.
   */
  MIN_CLIENT?: string;
  /** Local development only (`npm run dev:all`): comma-separated extra push hosts, for tests. */
  PUSH_EXTRA_HOSTS?: string;
  /** Local development only: seconds between sends of one invite (60 otherwise). */
  INVITE_RESEND_GAP_S?: string;
}

export interface Config {
  saltPrefix: string;
  title: string;
  origins: string[];
  emailCode: boolean;
  requireVerifiedEmail: boolean;
  captcha: { siteKey: string; secret: string } | null;
  google: { clientId: string; clientSecret: string } | null;
  teams: boolean;
  /** Offline data: /sync, a Durable Object per space. */
  sync: boolean;
  /** The admin area: on, with the emails of the app's admins (lower case). */
  admin: { emails: string[] } | null;
  push: { publicKey: string; privateKey: string; subject: string } | null;
  contactEmail: string | null;
  /** The frontend, without a trailing slash. */
  appUrl: string;
  /** The API is on this machine (http://localhost or 127.0.0.1): what only development may do. */
  local: boolean;
  /**
   * Mail kept at /dev/mail instead of sent: DEV_MAIL, no RESEND_API_KEY, and a local API.
   * Per-network limits are off with it, so test runs don't lock themselves out.
   */
  devMail: boolean;
  /** Push hosts allowed beyond the known push services: local development only. */
  pushExtraHosts: string[];
  /** The time between sends of one invite. */
  inviteResendGapMs: number;
  /** The browser's PBKDF2 rounds for passwords, and the ones before them while accounts move over. */
  passwordIterations: number;
  previousIterations: number | null;
  /** The oldest frontend build served (ms since 1970, and as set), or null. */
  minClient: { at: number; text: string } | null;
}

const on = (v: string | undefined) => /^(true|1|on|yes)$/i.test(v?.trim() ?? '');

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

/** A number of PBKDF2 rounds, or null when unset; too few is a mistake worth failing loudly on. */
function rounds(v: string | undefined): number | null {
  const text = v?.trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 100_000) throw new Error(`PASSWORD_ITERATIONS must be a whole number of at least 100000, not "${text}".`);
  return n;
}

/** MIN_CLIENT read as a time; a value that isn't one is a mistake worth failing loudly on. */
function minClient(v: string | undefined): Config['minClient'] {
  const text = v?.trim();
  if (!text) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at)) throw new Error(`MIN_CLIENT must be a date and time (ISO 8601), not "${text}".`);
  return { at, text: new Date(at).toISOString() };
}

/** Whether this API address (ending in /api) is on this machine. */
export const isLocalApi = (api: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api$/.test(api);

/** The settings, for the API at `api` (this request's own address, ending in /api). */
export function config(env: Env, api: string): Config {
  const local = isLocalApi(api);
  const origins = list(env.ALLOWED_ORIGINS);
  const gap = Number(env.INVITE_RESEND_GAP_S);
  const appUrl = (env.APP_URL?.trim() || origins[0] || 'http://localhost:5180').replace(/\/+$/, '');
  const contactEmail = env.CONTACT_EMAIL?.trim() || null;
  return {
    saltPrefix: env.APP_NAME,
    title: env.APP_TITLE || env.APP_NAME,
    origins,
    emailCode: on(env.EMAIL_CODE),
    requireVerifiedEmail: on(env.REQUIRE_VERIFIED_EMAIL),
    captcha: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? { siteKey: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET } : null,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null,
    teams: on(env.TEAMS),
    sync: on(env.SYNC),
    admin: on(env.ADMIN) ? { emails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()) } : null,
    push:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? {
            publicKey: env.VAPID_PUBLIC_KEY.trim(),
            privateKey: env.VAPID_PRIVATE_KEY.trim(),
            subject: env.VAPID_SUBJECT?.trim() || (contactEmail ? `mailto:${contactEmail}` : appUrl),
          }
        : null,
    contactEmail,
    appUrl,
    local,
    devMail: local && !env.RESEND_API_KEY && on(env.DEV_MAIL),
    pushExtraHosts: local ? list(env.PUSH_EXTRA_HOSTS).map((h) => h.toLowerCase()) : [],
    minClient: minClient(env.MIN_CLIENT),
    passwordIterations: rounds(env.PASSWORD_ITERATIONS) ?? 600_000,
    previousIterations: rounds(env.PASSWORD_PREVIOUS_ITERATIONS),
    inviteResendGapMs: (local && Number.isInteger(gap) && gap > 0 ? gap : 60) * 1000,
  };
}

/** What every request handler gets: the bindings, the settings, the data layer, and who's asking. */
export interface Ctx {
  env: Env;
  cfg: Config;
  db: Db;
  /** The address asking ('local' when there's none), as Turnstile wants it. */
  ip: string;
  /** The network asking, for per-network limits: the IPv4 address, or an IPv6 address's /64. */
  network: string;
  /** This API's own address, ending in /api: for photo links and Google's redirect_uri. */
  api: string;
  /** Work that may finish after the reply (the Worker's waitUntil); absent in unit tests. */
  waitUntil?: (p: Promise<unknown>) => void;
  /** The language for messages and emails, from Accept-Language (src/i18n.ts). */
  lang: string;
}
