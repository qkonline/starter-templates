// Web Push (PRD R4.2): a notification's title, text and link, encrypted for the one browser
// (RFC 8291, aes128gcm) and signed with the app's VAPID key (vapid.ts), sent straight to the
// browser's push service. No third party and no SDK: Web Crypto does all of it.

import { b64url, fromB64url } from './crypto';
import { vapidAuthorization, type VapidKeys } from './vapid';

const enc = new TextEncoder();

/** What the service worker gets, as JSON. */
export interface PushMessage {
  title: string;
  body: string;
  url: string | null;
}

export interface Subscription {
  endpoint: string;
  /** The browser's P-256 public key, uncompressed (65 bytes), base64url. */
  p256dh: string;
  /** The browser's 16-byte secret, base64url. */
  auth: string;
}

/**
 * The browsers' push services: Chrome and Edge on Android (Google), Firefox (Mozilla), Edge on
 * Windows (Microsoft), Safari (Apple). A subscription to anywhere else is refused, so the Worker
 * only ever posts to these. `*.` means any subdomain.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', '*.push.services.mozilla.com', 'updates.push.services.mozilla.com', '*.notify.windows.com', 'web.push.apple.com', '*.push.apple.com'];

const hostAllowed = (host: string, allowed: string[]) =>
  allowed.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h));

/** An https address on a known push service, or on one of `extraHosts` (local development only, for tests). */
export function isPushEndpoint(v: unknown, extraHosts: string[] = []): v is string {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && !url.port && hostAllowed(url.hostname, [...PUSH_HOSTS, ...extraHosts]);
  } catch {
    return false;
  }
}

/** At most `max` bytes of a response's body as text, for a log line; the rest is never read. */
export async function readSome(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value.subarray(0, max - size));
      size += Math.min(value.length, max - size);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(concat(...parts));
}

/** The keys from a browser's subscription, if they're the sizes RFC 8291 needs. */
export function pushKeys(keys: unknown): { p256dh: string; auth: string } | null {
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const read = (v: unknown, max: number) => {
    if (typeof v !== 'string' || v.length > max || !/^[A-Za-z0-9_\-+/]+=*$/.test(v)) return null;
    try {
      return fromB64url(v.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'));
    } catch {
      return null;
    }
  };
  const pub = read(p256dh, 200);
  const secret = read(auth, 100);
  if (!pub || pub.length !== 65 || pub[0] !== 4 || !secret || secret.length !== 16) return null;
  return { p256dh: b64url(pub), auth: b64url(secret) };
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as Uint8Array<ArrayBuffer>));
}

/** Record size written in the header: one record holds the whole message. */
const RECORD = 4096;

/**
 * Encrypt `plaintext` for one browser (RFC 8291 with RFC 8188's aes128gcm): a fresh key pair and
 * salt each time. `seed` fixes them, for tests only.
 */
export async function encryptPush(
  sub: Pick<Subscription, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  seed?: { keys: CryptoKeyPair; salt: Uint8Array },
): Promise<Uint8Array> {
  if (plaintext.length > RECORD - 17) throw new Error('Push message too long');
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const keys = seed?.keys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Web Crypto names the peer key `public`; the Workers types call it `$public`.
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, keys.privateKey, 256));

  // HKDF by hand: extract with the browser's secret, expand with both public keys.
  const ikm = await hmac(await hmac(authSecret, ecdh), concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, Uint8Array.of(1)));
  const salt = seed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), Uint8Array.of(1)))).slice(0, 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // The single, last record ends with the delimiter 2.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, Uint8Array.of(2)) as Uint8Array<ArrayBuffer>),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD);
  return concat(salt, rs, Uint8Array.of(asPublic.length), asPublic, sealed);
}

/** 'gone': the push service says this browser's subscription has ended (404 or 410), so forget it. */
export async function sendPush(sub: Subscription, message: PushMessage, vapid: VapidKeys): Promise<'ok' | 'gone' | 'failed'> {
  try {
    const body = await encryptPush(sub, enc.encode(JSON.stringify(message)));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuthorization(sub.endpoint, vapid),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        // Still worth showing for a day if the device is off.
        ttl: '86400',
        urgency: 'normal',
      },
      body: body as Uint8Array<ArrayBuffer>,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    if (res.ok) return 'ok';
    console.warn('Push refused', res.status, await readSome(res, 500).catch(() => ''));
    return 'failed';
  } catch (e) {
    console.warn('Push failed', String(e));
    return 'failed';
  }
}
