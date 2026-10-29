// After `vite build`: writes build/_headers (security headers, scripts/csp.ts) and build/404.html
// (the app shell, which Cloudflare Pages serves for any path that isn't a file, so the app shows
// its own "not found" page). Run by `npm run build`; reads the same env as the build.
//
// On Cloudflare Pages' own Git builds (CF_PAGES=1) the build fails without an https
// PUBLIC_API_URL, as `npm run deploy` does before building (scripts/predeploy.mjs).

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import { apiUrlProblem } from './api-url.ts';
import { buildHeaders, inlineScripts, scriptHash } from './csp.ts';

const out = 'build';
const env = { ...loadEnv('production', process.cwd(), 'PUBLIC_'), ...process.env };

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '_app' ? [] : htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

if (env.CF_PAGES === '1') {
  const problem = apiUrlProblem(env.PUBLIC_API_URL);
  if (problem) {
    console.error(`postbuild: ${problem} Set it in the Pages project's build variables.`);
    process.exit(1);
  }
}

if (!existsSync(join(out, '200.html'))) {
  console.error('postbuild: build/200.html is missing; run vite build first.');
  process.exit(1);
}
copyFileSync(join(out, '200.html'), join(out, '404.html'));

const hashes = new Set();
for (const file of htmlFiles(out)) {
  for (const body of inlineScripts(readFileSync(file, 'utf8'))) hashes.add(await scriptHash(body));
}

const headers = buildHeaders(
  {
    apiUrl: (env.PUBLIC_API_URL || 'http://localhost:8787/api').replace(/\/+$/, ''),
    posthogKey: (env.PUBLIC_POSTHOG_KEY ?? '').trim(),
    posthogHost: (env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').trim(),
    gaId: (env.PUBLIC_GA_ID ?? '').trim(),
  },
  [...hashes].sort(),
);
writeFileSync(join(out, '_headers'), headers);
console.log(`postbuild: wrote build/_headers (${hashes.size} inline script hashes) and build/404.html`);
