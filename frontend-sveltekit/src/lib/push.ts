// Push on this device (PRD R4.2). On when /features gives a VAPID key; the person turns it on
// per device from the account page. The service worker (src/service-worker) shows the pushes.

import { api } from '#lib/api/index.ts';

/**
 * What this device can do: 'unsupported' (no push in this browser), 'install' (an iPhone or
 * iPad, where only the app added to the Home Screen can have notifications), 'blocked' (turned
 * down in the browser's settings), 'off' or 'on'.
 */
export type PushState = 'unsupported' | 'install' | 'blocked' | 'off' | 'on';

const ios = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The VAPID key as `PushManager.subscribe` takes it: base64url to bytes. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration().catch(() => undefined)) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return ios() && !installed() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await (await registration())?.pushManager.getSubscription().catch(() => null);
  return sub ? 'on' : 'off';
}

/** Ask for permission (it must follow a tap), subscribe, and give the subscription to the backend. */
export async function pushOn(vapidPublicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  if (!reg) throw new Error('The app’s offline copy isn’t ready yet. Reload the page and try again.');
  const key = keyBytes(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key (the backend's keys changed) can't be used.
  const current = sub?.options.applicationServerKey;
  if (sub && current && !sameBytes(new Uint8Array(current), key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  await api.pushSubscribe({
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  });
  return 'on';
}

export async function pushOff(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
