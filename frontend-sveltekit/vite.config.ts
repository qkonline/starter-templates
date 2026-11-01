import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// The build's version: what error reports carry and what tells an installed copy a new one is
// out. Cloudflare Pages sets CF_PAGES_COMMIT_SHA on its own builds; PUBLIC_RELEASE wins when set.
const release = process.env.PUBLIC_RELEASE || process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) || undefined;

export default defineConfig(({ mode }) => ({
  // A plain constant, so the build drops the posthog-js import (and the service worker never
  // precaches it) when there's no key. `$app/env/public` values aren't folded that far.
  define: {
    __POSTHOG__: JSON.stringify(
      !!(process.env.PUBLIC_POSTHOG_KEY ?? loadEnv(mode, '.', 'PUBLIC_').PUBLIC_POSTHOG_KEY)?.trim(),
    ),
  },
  plugins: [
    sveltekit({
      // Every route is prerendered: the public pages with their content, the sign-in and
      // signed-in pages as empty shells that start the app in the browser (they set
      // `ssr = false`). `200.html` catches any path that wasn't prerendered, such as a
      // route with a parameter an app adds; `scripts/postbuild.mjs` copies it to `404.html`,
      // which Cloudflare Pages serves for any path that isn't a file.
      adapter: adapter({ fallback: '200.html' }),
      compilerOptions: {
        runes: true,
      },
      // Absolute paths, so every app shell's inline start script is the same file whatever
      // its depth, which keeps the CSP's list of script hashes short (scripts/csp.ts).
      paths: { relative: false },
      // #lib/pwa.svelte.ts registers it, to show "new version ready" and apply it on a tap.
      serviceWorker: { register: false },
      version: { name: release, pollInterval: 0 },
    }),
  ],
  server: {
    port: 5180,
    strictPort: true,
    // `@starter/contract` is a link to ../contract; let the dev server read it.
    fs: { allow: ['..'] },
  },
  preview: {
    port: 4180,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    // So the theme tests can read app.css and the theme files as text (src/lib/themes/themes.test.ts).
    css: { include: [/\.css(\?|$)/] },
  },
}));
