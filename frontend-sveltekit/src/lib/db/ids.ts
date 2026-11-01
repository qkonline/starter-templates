// Ids made on the device (docs/offline-data.md, Rule 1): a UUID version 7, the time in its first
// 48 bits and the rest random, so two devices never make the same one and ids made later sort
// later (good for the backend's indexes).

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** A new UUID v7, e.g. `019a3f2e-7c4b-7d21-9a0e-5b6c7d8e9f01`. */
export function newId(now = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What the contract takes as an id made on the device. */
export const isSyncId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
