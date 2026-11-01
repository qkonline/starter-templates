// Passwords never leave the device: what goes to the backend is the key from
// contract/password.ts (PBKDF2, 600,000 rounds), made with the settings from /auth/methods.

import { cleanEmail, passwordKey, type PasswordSettings } from '@starter/contract/password';

export { cleanEmail };

/** What's wrong with a new password, or null. Only length is checked: the contract asks no more. */
export function passwordProblem(password: string, minLength: number): string | null {
  // Counted in characters as people see them, not UTF-16 units.
  const length = [...password.normalize('NFKC')].length;
  if (length === 0) return 'Enter a password.';
  if (length < minLength) return `Use at least ${minLength} characters.`;
  return null;
}

/** Plain email check, enough to catch typos before a request; the backend has the last word. */
export function emailProblem(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'That doesn’t look like an email address.';
  return null;
}

/** Wait for the browser to paint, so a busy state shows before the slow part starts. */
const painted = () =>
  new Promise<void>((resolve) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => setTimeout(resolve, 0))
      : resolve(),
  );

/** The fewest PBKDF2 rounds the contract allows, and the most this app will spend time on. */
export const ITERATIONS = 600_000;
const MOST = 10_000_000;

const unsafe = () =>
  new Error('The server asked for unsafe password settings, so your password wasn’t sent. Try again later.');

/**
 * The key to send instead of the password. Takes a noticeable moment on phones. Refuses fewer
 * rounds than the contract's least: from a backend that's wrong or not ours, they would make the
 * key cheaper to guess the password from.
 */
export async function makeKey(password: string, email: string, settings: PasswordSettings): Promise<string> {
  if (
    !Number.isInteger(settings.iterations) ||
    settings.iterations < ITERATIONS ||
    settings.iterations > MOST
  )
    throw unsafe();
  await painted();
  return passwordKey(password, email, settings);
}

/**
 * While the app is raising its rounds (`previousIterations`), the key made with the old ones as
 * well, for an account that hasn't moved over yet; undefined the rest of the time.
 */
export async function makePreviousKey(
  password: string,
  email: string,
  settings: PasswordSettings & { previousIterations?: number | null },
): Promise<string | undefined> {
  const previous = settings.previousIterations;
  if (!previous) return undefined;
  return makeKey(password, email, { ...settings, iterations: previous });
}

/** The key, and while the rounds change the previous one too (as `previous`). */
export async function makeKeys(
  password: string,
  email: string,
  settings: PasswordSettings & { previousIterations?: number | null },
): Promise<{ key: string; previous?: string }> {
  const [key, previous] = await Promise.all([
    makeKey(password, email, settings),
    makePreviousKey(password, email, settings),
  ]);
  return previous ? { key, previous } : { key };
}
