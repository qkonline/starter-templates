// Security headers for Cloudflare Pages (PRD R3.3), built after `vite build` by postbuild.mjs.
// Pure functions, so vitest checks them; the runner reads the env and the built pages.
//
// Why built and not a file in static/: the policy names the backend (PUBLIC_API_URL) and the
// analytics hosts, which are known only at build time, and it allows the pages' inline scripts
// (SvelteKit's start script, the display-preferences script in app.html) by their hashes, which
// change with every build.

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

/** The Content-Security-Policy: exactly what the app loads, given what's switched on. */
export function buildCsp(env: HeaderEnv, hashes: readonly string[]): string {
  const api = origin(env.apiUrl);
  const posthog = env.posthogKey ? posthogHosts(env.posthogHost) : [];
  const posthogScripts = env.posthogKey ? posthogScriptHosts(env.posthogHost) : [];
  const ga = !!env.gaId;
  const turnstile = 'https://challenges.cloudflare.com';
  const list = (...items: (string | null | false | undefined | readonly string[])[]) =>
    [...new Set(items.flat().filter((x): x is string => !!x))].join(' ');

  const directives: [string, string][] = [
    ['default-src', "'self'"],
    // The CAPTCHA is switched on by the backend at run time, so it is always allowed.
    [
      'script-src',
      list("'self'", hashes, turnstile, posthogScripts, ga && 'https://www.googletagmanager.com'),
    ],
    ['style-src', "'self' 'unsafe-inline'"],
    [
      'img-src',
      list(
        "'self'",
        'data:',
        'blob:',
        api,
        ga && ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
      ),
    ],
    ['font-src', "'self'"],
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
      ),
    ],
    ['frame-src', turnstile],
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

/** The whole `_headers` file. Throws when a line is longer than Pages accepts. */
export function buildHeaders(env: HeaderEnv, hashes: readonly string[]): string {
  const csp = buildCsp(env, hashes);
  const report = `${env.apiUrl.replace(/\/+$/, '')}/telemetry/csp`;
  const all: [string, string][] = [
    // Report-only to start; once /admin/errors shows no CSP reports, rename the header to
    // Content-Security-Policy to enforce it.
    ['Content-Security-Policy-Report-Only', csp],
    ['Reporting-Endpoints', `csp="${report}"`],
    // frame-ancestors isn't enforced while the CSP only reports, so this one does it.
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
          'Too many distinct inline scripts: each public page with content adds one hash.',
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
