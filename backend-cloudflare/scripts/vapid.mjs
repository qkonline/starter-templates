#!/usr/bin/env node
// A VAPID key pair for push (PRD R4.2): made once per app, free, no third party. The public key
// goes in wrangler.toml ([vars] VAPID_PUBLIC_KEY), the private one in a secret
// (`wrangler secret put VAPID_PRIVATE_KEY`). Making a new pair later stops every browser's
// existing subscription, so keep them.
//
//   node scripts/vapid.mjs          # prints both
//   node scripts/vapid.mjs --json   # {"publicKey": ..., "privateKey": ...}

import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** A new P-256 pair: the public key uncompressed (65 bytes) and the private scalar `d`, both base64url. */
export async function vapidKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64url(new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey)));
  const { d } = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey, privateKey: d };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const keys = await vapidKeys();
  if (process.argv.includes('--json')) console.log(JSON.stringify(keys));
  else console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
}
