// The installed-app side (PRD R3.1): registers the service worker (src/service-worker), knows
// when a new version is waiting, and applies it only when the person taps "Reload": a new
// version never takes over in the middle of what they're doing. Also whether we're online.

import { dev } from '$app/env';
import { resolve } from '$app/paths';

export const pwa = $state({
  online: true,
  /** A new version is installed and waiting for the person's tap. */
  updateReady: false,
});

let waiting: ServiceWorker | null = null;
let applying = false;
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- callbacks, not state anything renders
const pushListeners = new Set<(data: unknown) => void>();

/** Run `fn` when the service worker says a push arrived (to refresh the bell). */
export function onPush(fn: (data: unknown) => void): () => void {
  pushListeners.add(fn);
  return () => pushListeners.delete(fn);
}

function track(worker: ServiceWorker | null) {
  if (!worker) return;
  const check = () => {
    // Installed while another version controls the page: an update, waiting for the tap.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waiting = worker;
      pwa.updateReady = true;
    }
  };
  check();
  worker.addEventListener('statechange', check);
}

/** Start once, in the browser (the root layout does). */
export function startPwa(): void {
  if (typeof window === 'undefined') return;
  pwa.online = navigator.onLine;
  addEventListener('online', () => (pwa.online = true));
  addEventListener('offline', () => (pwa.online = false));

  // Development serves modules that change on every save; caching them would only confuse.
  if (dev || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: string } | null;
    if (data?.type === 'push') for (const fn of pushListeners) fn(data);
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only the person's tap reloads; the first install taking control doesn't.
    if (applying) location.reload();
  });

  navigator.serviceWorker
    .register(`${resolve('').replace(/\/$/, '')}/service-worker.js`, { type: 'classic' })
    .then((reg) => {
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // An app left open for days still hears of new versions.
      let last = Date.now();
      const look = () => {
        if (Date.now() - last < 60_000) return;
        last = Date.now();
        reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && look());
      setInterval(look, 30 * 60_000);
    })
    .catch(() => {
      /* No offline copy this time (private mode, storage off): the app works without it. */
    });
}

/** The person tapped "Reload": let the waiting version take over, then load the page again. */
export function applyUpdate(): void {
  if (!waiting) return location.reload();
  applying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // If it doesn't take over within a few seconds, a plain reload still gets the new files.
  setTimeout(() => location.reload(), 4000);
}

/**
 * The backend said this copy is too old (`client_outdated`): fetch the newest version now and
 * switch to it. False when no newer version could be found (the new frontend isn't out yet, or
 * no connection); the caller says so and lets the person try again.
 */
export async function forceUpdate(timeoutMs = 15_000): Promise<boolean> {
  const reg = dev || !('serviceWorker' in navigator) ? null : await navigator.serviceWorker.getRegistration();
  if (!reg) {
    location.reload();
    return true;
  }
  await reg.update().catch(() => {});
  const next = reg.waiting ?? reg.installing;
  if (!next) return false;
  const ready = await new Promise<boolean>((done) => {
    if (next.state === 'installed') return done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    next.addEventListener('statechange', () => {
      if (next.state === 'installed' || next.state === 'redundant') {
        clearTimeout(timer);
        done(next.state === 'installed');
      }
    });
  });
  if (!ready) return false;
  waiting = next;
  applyUpdate();
  return true;
}
