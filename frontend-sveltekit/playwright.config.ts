import { defineConfig, devices } from '@playwright/test';

// End-to-end tests. The frontend is built and served by scripts/pages-server.mjs, which serves
// build/ the way Cloudflare Pages does (`_headers`, 404.html, extensionless pages), on E2E_PORT
// (default 4180). Tests that need the backend run against API_URL (PUBLIC_API_URL for the
// build) and skip when it doesn't answer; it must have dev mail on (`/dev/mail`), Turnstile's
// always-pass test keys if the CAPTCHA is on, and allow this origin for CORS.
const API_URL = process.env.API_URL ?? process.env.PUBLIC_API_URL ?? 'http://localhost:8787/api';
const PORT = Number(process.env.E2E_PORT ?? 4180);
// E2E_IPV4=1 serves on 127.0.0.1 and has Chromium resolve `localhost` there, for when another
// server already holds the port on ::1. The page's origin stays http://localhost:PORT.
const IPV4 = process.env.E2E_IPV4 === '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: IPV4 ? { args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] } : {},
  },
  // Chromium, and WebKit (Safari's engine: every browser on iPhone and iPad). Tests that need
  // Chromium's DevTools (the virtual passkey authenticator) skip on WebKit.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && node scripts/pages-server.mjs',
    url: `http://${IPV4 ? '127.0.0.1' : 'localhost'}:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PUBLIC_API_URL: API_URL, PORT: String(PORT), HOST: IPV4 ? '127.0.0.1' : 'localhost' },
  },
});
