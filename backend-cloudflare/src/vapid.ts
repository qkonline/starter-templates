// VAPID (RFC 8292), as in boardo: push services only take a push signed with the key the browser
// subscribed with. The signature is an ES256 JWT, made with Web Crypto.

import { b64url, fromB64url } from './crypto';

const enc = new TextEncoder();

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url. The browser subscribes with this. */
  publicKey: string;
  /** The private scalar `d`, base64url. A Worker secret. */
  privateKey: string;
  /** A contact for the push services: an https: URL or a mailto: address. */
  subject: string;
}

/** The Authorization header for sending a push to `endpoint`. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const pub = fromB64url(keys.publicKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: keys.privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  // Apple refuses tokens that live longer than an hour.
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: keys.subject };
  const body = `${header}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(body));
  return `vapid t=${body}.${b64url(sig)}, k=${keys.publicKey}`;
}
