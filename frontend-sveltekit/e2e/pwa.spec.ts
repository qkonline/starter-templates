// The app shell without a backend (PRD section 3): manifest and service worker, offline,
// display preferences before the first paint, Pages headers and the not-found fallback, and a
// Content-Security-Policy that public pages don't break.
import { expect, test } from '@playwright/test';

test('the manifest and its icons are served', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const res = await request.get(icon.src);
    expect(res.ok(), icon.src).toBe(true);
    expect(res.headers()['content-type']).toBe(icon.type);
  }
});

test('Pages headers are emitted, with a report-only CSP that reports to the backend', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy-report-only']).toMatch(/script-src 'self' 'sha256-/);
  expect(h['content-security-policy-report-only']).toMatch(/report-uri https?:\/\/[^ ;]+\/telemetry\/csp/);
  expect(h['content-security-policy-report-only']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
  expect((await request.get('/service-worker.js')).headers()['cache-control']).toBe('no-cache');
  // The file itself isn't served.
  expect((await request.get('/_headers')).status()).toBe(404);
});

test('a path that isn’t a page gets the app’s own not-found page', async ({ page }) => {
  const res = await page.goto('/no/such/page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'There’s nothing here' })).toBeVisible();
});

test('public pages load without a CSP violation', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { violations: string[] }).violations.push(
        `${e.violatedDirective} ${e.blockedURI}`,
      ),
    );
  });
  for (const path of ['/', '/privacy', '/terms', '/contact', '/offline', '/signin']) {
    await page.goto(path);
    // Started in the browser and done loading its own scripts (the CAPTCHA may keep a
    // connection open, so not `networkidle`).
    await page.waitForLoadState('load');
    await page.waitForTimeout(750);
    expect(
      await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
      path,
    ).toEqual([]);
  }
});

test('the theme, mode and text size apply before the first paint', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('starter:theme', 'fusion');
    localStorage.setItem('starter:mode', 'dark');
    localStorage.setItem('starter:text', 'xl');
    // Record <html>'s attributes at the moment <body> is first parsed, before anything paints.
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      const html = document.documentElement;
      (window as unknown as { atBody: unknown }).atBody = {
        theme: html.getAttribute('data-theme'),
        mode: html.getAttribute('data-mode'),
        text: html.getAttribute('data-text'),
      };
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/privacy');
  expect(await page.evaluate(() => (window as unknown as { atBody: unknown }).atBody)).toEqual({
    theme: 'fusion',
    mode: 'dark',
    text: 'xl',
  });
  const style = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    size: getComputedStyle(document.documentElement).fontSize,
  }));
  expect(style).toEqual({ scheme: 'dark', size: '20px' });
});

test('the light mode wins over a dark device', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.goto('/');
  const dark = await background();
  await page.evaluate(() => localStorage.setItem('starter:mode', 'light'));
  await page.reload();
  const light = await background();
  expect(light).not.toBe(dark);
  await page.evaluate(() => localStorage.removeItem('starter:mode'));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  expect(await background()).toBe(light);
  await context.close();
});

test('a theme since removed falls back to the default', async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.goto('/');
  const base = await background();
  await page.evaluate(() => localStorage.setItem('starter:theme', 'gone'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fusion');
  expect(await background()).toBe(base);
});

test('the service worker registers, and the app opens offline', async ({ context, page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Precached at install, so every page is there once it's active.
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText(/You’re offline\. What’s already open/)).toBeVisible();

  // A page that was never built: the offline page.
  await page.goto('/nowhere/at/all');
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();

  // A signed-in page's shell opens offline too (the team page, with its query).
  const res = await page.goto('/team?id=abc');
  expect(res?.ok()).toBe(true);
  await context.setOffline(false);
});
