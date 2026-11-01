// Storing the passwordKey (PRD R1.2). The browser has already done the slow part, 600,000 rounds
// of PBKDF2 (contract/password.ts), so the key it sends is as good as random. It still works as
// the password, though, so it's never stored as it is: a stolen database would let anyone sign
// in. Instead it's hashed again with its own random salt. A few rounds are plenty here, since
// guessing has to go through the browser's 600,000 first; more would only spend the Worker's
// 10 ms of CPU (Workers Free). Measured: about 0.03 ms a hash (README, "Passwords").
//
// The stored string names its algorithm and settings,
// `pbkdf2-sha256$<rounds>$<salt>$<hash>$<browser rounds>`, so both can be raised later:
// `checkPasswordKey` says when a stored hash is behind, and the caller stores a new one while it
// has the key in hand. The browser rounds are the ones the key was made with (600,000 when a
// hash from before they were written down doesn't say); see `keyFor` in routes/auth.ts.

import { b64url, fromB64url, sameBytes } from './crypto';

const ALGORITHM = 'pbkdf2-sha256';
export const ROUNDS = 10;
const SALT_BYTES = 16;

async function derive(key: string, salt: Uint8Array<ArrayBuffer>, rounds: number): Promise<Uint8Array> {
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, raw, 256));
}

/** The browser rounds of a hash that doesn't say: the only ones there were before they were written down. */
export const FIRST_BROWSER_ROUNDS = 600_000;

/** The string to store for a passwordKey made in the browser with `browserRounds`. */
export async function hashPasswordKey(key: string, browserRounds: number, rounds = ROUNDS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `${ALGORITHM}$${rounds}$${b64url(salt)}$${b64url(await derive(key, salt, rounds))}$${browserRounds}`;
}

/** The browser rounds the stored hash's key was made with. */
export function browserRoundsOf(stored: string | null): number {
  const n = Number(stored?.split('$')[4]);
  return Number.isInteger(n) && n > 0 ? n : FIRST_BROWSER_ROUNDS;
}

/**
 * Whether `key` is the one `stored` was made from, and whether `stored` should be made again
 * with today's settings (`browserRounds`: what the browser uses now).
 */
export async function checkPasswordKey(
  key: string,
  stored: string | null,
  browserRounds = FIRST_BROWSER_ROUNDS,
): Promise<{ ok: boolean; rehash: boolean }> {
  const [algorithm, roundsText, salt, hash] = stored?.split('$') ?? [];
  const rounds = Number(roundsText);
  if (algorithm !== ALGORITHM || !Number.isInteger(rounds) || rounds < 1 || !salt || !hash) {
    // No password, or one stored some way this code doesn't know: a wrong password, but spend
    // the same time on it, so the answer doesn't say which.
    await derive(key, new Uint8Array(SALT_BYTES), ROUNDS);
    return { ok: false, rehash: false };
  }
  const ok = sameBytes(await derive(key, fromB64url(salt), rounds), fromB64url(hash));
  return { ok, rehash: ok && (rounds !== ROUNDS || browserRoundsOf(stored) !== browserRounds) };
}
