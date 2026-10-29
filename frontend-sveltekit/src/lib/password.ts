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

/** PBKDF2 rounds, fixed by the contract (`Methods.password.iterations` is a const). */
export const ITERATIONS = 600_000;

/**
 * The key to send instead of the password. Takes a noticeable moment on phones. Refuses any
 * other number of rounds than the contract's: fewer, from a backend that's wrong or not ours,
 * would make the key cheaper to guess the password from.
 */
export async function makeKey(password: string, email: string, settings: PasswordSettings): Promise<string> {
  if (settings.iterations !== ITERATIONS)
    throw new Error(
      'The server asked for unsafe password settings, so your password wasn’t sent. Try again later.',
    );
  await painted();
  return passwordKey(password, email, settings);
}
