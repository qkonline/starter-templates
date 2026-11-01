// Security headers for Cloudflare Pages (PRD R3.3), built after `vite build` by postbuild.mjs.
// Pure functions, so vitest checks them; the runner reads the env and the built pages.
//
// Why built and not a file in static/: the policy names the backend (PUBLIC_API_URL) and the
// analytics hosts, which are known only at build time, and each page's inline scripts
// (SvelteKit's start script, the display-preferences script in app.html) are allowed by their
// hashes, which change with every build: in a `<meta>` policy written into that page, so the
// header stays the same length however many pages an app adds.

import { appCsp, type AppCsp } from '../src/lib/app/csp.ts';

export interface HeaderEnv {
  apiUrl: string;
  posthogKey: string;
  posthogHost: string;
  gaId: string;
}

/** Cloudflare Pages refuses a header longer than this. */
export const MAX_HEADER_LENGTH = 2000;

/** The executable inline scripts in a page (not JSON data, not `src` scripts). */
export function inlineScripts(html: string): string[] {
  const scripts: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const [, attrs = '', body = ''] of html.matchAll(re)) {
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== 'module' && type !== 'text/javascript' && type !== 'application/javascript')
      continue;
    scripts.push(body);
  }
  return scripts;
}

/** A script's CSP source: `'sha256-…'` of its exact text. */
export async function scriptHash(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `'sha256-${btoa(binary)}'`;
}

const origin = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/** PostHog's cloud hosts load their extra files from a sibling assets host. */
export function posthogHosts(host: string): string[] {
  const o = origin(host);
  if (!o) return [];
  const cloud = /^https:\/\/(us|eu)\.i\.posthog\.com$/.exec(o);
  return cloud ? [o, `https://${cloud[1]}-assets.i.posthog.com`] : [o];
}

/**
 * Where PostHog loads scripts from: on its cloud only the assets host (posthog-js asks its
 * `assets` endpoint for every script), on a proxy the proxy itself.
 */
export function posthogScriptHosts(host: string): string[] {
  const hosts = posthogHosts(host);
  return hosts.length > 1 ? hosts.slice(1) : hosts;
}

const list = (...items: (string | null | false | undefined | readonly string[])[]) =>
  [...new Set(items.flat().filter((x): x is string => !!x))].join(' ');

const TURNSTILE = 'https://challenges.cloudflare.com';

/** Where scripts may come from besides the site: the CAPTCHA, analytics when on, the app's own. */
function scriptHosts(env: HeaderEnv, app: AppCsp): string[] {
  return [
    TURNSTILE,
    ...(env.posthogKey ? posthogScriptHosts(env.posthogHost) : []),
    ...(env.gaId ? ['https://www.googletagmanager.com'] : []),
    ...(app.script ?? []),
  ];
}

/**
 * The site-wide policy, sent as a header on every response and enforced: exactly what the app
 * loads, given what's switched on, and reporting to the backend. Its script-src allows inline
 * scripts because each page's own `<meta>` policy (`pagePolicy`) lists the inline scripts that
 * page may run by their hashes; a browser enforces both, so only those run. Keeping the hashes
 * out of the header keeps it short however many pages there are (Pages takes 2,000 characters).
 */
export function buildCsp(env: HeaderEnv, app: AppCsp = appCsp): string {
  const api = origin(env.apiUrl);
  const posthog = env.posthogKey ? posthogHosts(env.posthogHost) : [];
  const ga = !!env.gaId;

  const directives: [string, string][] = [
    ['default-src', "'self'"],
    ['script-src', list("'self'", "'unsafe-inline'", scriptHosts(env, app))],
    ['style-src', list("'self'", "'unsafe-inline'", app.style)],
    [
      'img-src',
      list(
        "'self'",
        'data:',
        'blob:',
        api,
        ga && ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
        app.img,
      ),
    ],
    ['font-src', list("'self'", app.font)],
    ['media-src', list("'self'", 'blob:', app.media)],
    [
      'connect-src',
      list(
        "'self'",
        api,
        posthog,
        ga && [
          'https://*.google-analytics.com',
          'https://*.analytics.google.com',
          'https://*.googletagmanager.com',
        ],
        app.connect,
      ),
    ],
    ['frame-src', list(TURNSTILE, app.frame)],
    ['worker-src', "'self'"],
    ['manifest-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];
  if (env.apiUrl) {
    directives.push(['report-uri', `${env.apiUrl.replace(/\/+$/, '')}/telemetry/csp`]);
    directives.push(['report-to', 'csp']);
  }
  return directives.map(([k, v]) => `${k} ${v}`).join('; ');
}

/** One page's own policy, for its `<meta>`: its inline scripts by hash, and the script hosts. */
export function pagePolicy(env: HeaderEnv, hashes: readonly string[], app: AppCsp = appCsp): string {
  return `script-src ${list("'self'", hashes, scriptHosts(env, app))}; object-src 'none'; base-uri 'self'`;
}

/** The page with its policy as the first thing in <head>, so it covers every script after it. */
export function withPagePolicy(html: string, policy: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, '&quot;')}">`;
  const cleaned = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
  if (!/<head\b[^>]*>/i.test(cleaned)) throw new Error('A built page has no <head> to put its policy in.');
  return cleaned.replace(/<head\b[^>]*>/i, (head) => head + meta);
}

/** The whole `_headers` file. Throws when a line is longer than Pages accepts. */
export function buildHeaders(env: HeaderEnv, app: AppCsp = appCsp): string {
  const csp = buildCsp(env, app);
  const report = `${env.apiUrl.replace(/\/+$/, '')}/telemetry/csp`;
  const all: [string, string][] = [
    // Enforced, and reporting what it blocks to the backend (/admin/errors). A host the app
    // loads from goes in src/lib/app/csp.ts.
    ['Content-Security-Policy', csp],
    ['Reporting-Endpoints', `csp="${report}"`],
    // For browsers too old for frame-ancestors.
    ['X-Frame-Options', 'DENY'],
    // HTTPS only, here and on every subdomain, for a year. Browsers ignore it over plain http
    // (npm run serve), so it does nothing locally.
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    [
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), publickey-credentials-get=(self), publickey-credentials-create=(self)',
    ],
  ];
  for (const [name, value] of all) {
    const length = `  ${name}: ${value}`.length;
    if (length > MAX_HEADER_LENGTH)
      throw new Error(
        `${name} is ${length} characters; Cloudflare Pages takes at most ${MAX_HEADER_LENGTH}. ` +
          'Too many hosts in src/lib/app/csp.ts?',
      );
  }
  return [
    '# Built by scripts/postbuild.mjs from PUBLIC_API_URL and the analytics keys. Edit scripts/csp.ts, not this file.',
    '/*',
    ...all.map(([name, value]) => `  ${name}: ${value}`),
    '',
    '/_app/immutable/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/service-worker.js',
    '  Cache-Control: no-cache',
    '',
    '/manifest.webmanifest',
    '  Content-Type: application/manifest+json',
    '',
  ].join('\n');
}
