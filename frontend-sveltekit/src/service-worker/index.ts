// The service worker (PRD R3.1, R4.2): the app shell cached for offline, updates applied only
// when the person taps "Reload" (#lib/pwa.svelte.ts), and push notifications. Typechecked by
// its own tsconfig.json (`npm run check` runs both).

import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';
import { appName, homePath } from '#lib/config.ts';
import { openUrl, readPush } from '#lib/sw/push.ts';
import { precacheList, respond } from '#lib/sw/respond.ts';

const CACHE = `app-${version}`;
// The base path, from where the worker is registered (`/` unless the app sets `paths.base`).
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const PRECACHE = precacheList(BASE, immutable, assets, prerendered);
const PRECACHED = new Set(PRECACHE);
const OFFLINE = `${BASE}/offline`;
const ICON = `${BASE}/icons/icon-192.png`;

self.addEventListener('install', (event) => {
  // No skipWaiting here: an update waits until the person taps "Reload".
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // The API, analytics and the CAPTCHA go straight to the network.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) =>
        respond(request, { cache, fetch: (r) => fetch(r), precached: PRECACHED, offlinePath: OFFLINE }),
      ),
  );
});

self.addEventListener('push', (event) => {
  const message = readPush(event.data?.text(), appName);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title, {
        body: message.body,
        icon: ICON,
        badge: ICON,
        data: { url: message.url },
      }),
      // Open tabs refresh their bell.
      self.clients
        .matchAll({ type: 'window' })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: 'push' }))),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = openUrl(
    (event.notification.data as { url?: string } | null)?.url,
    self.location.origin,
    `${BASE}/${homePath}`,
  );
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus().then((c) => c.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
