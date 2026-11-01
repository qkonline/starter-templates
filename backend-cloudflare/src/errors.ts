// Every refusal is a contract `Error`: a fixed code the app acts on, and a message in plain
// words that the app shows as it is (PRD R9.1).

import type { Vars } from './i18n';

export type ErrorCode =
  | 'invalid_input'
  | 'invalid_code'
  | 'invalid_credentials'
  | 'captcha_failed'
  | 'signed_out'
  | 'email_unverified'
  | 'forbidden'
  | 'account_suspended'
  | 'last_admin'
  | 'not_found'
  | 'conflict'
  | 'email_taken'
  | 'passkey_refused'
  | 'rate_limited'
  | 'too_large'
  | 'unsupported_type'
  | 'mail_failed'
  | 'server_error'
  | 'client_outdated';

export class Refusal extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 426 | 429 | 500 | 502,
    readonly code: ErrorCode,
    message: string,
    /** Seconds to wait, for rate_limited. */
    readonly retryAfter?: number,
    /** Values for the message's {placeholders}, filled in after it's translated (src/i18n.ts). */
    readonly vars?: Vars,
  ) {
    super(message);
  }
}

export const signedOut = () => new Refusal(401, 'signed_out', "You're signed out. Sign in again.");
export const notFound = () => new Refusal(404, 'not_found', "That isn't here.");
export const wrongCode = () => new Refusal(400, 'invalid_code', "That code isn't right, or it has expired. Ask for a new one.");
export const wrongCredentials = () => new Refusal(400, 'invalid_credentials', "That email and password don't match.");
export const emailTaken = () => new Refusal(409, 'email_taken', 'Another account already uses that email.');
export const tooMany = (retryAfter?: number, message = 'Too many tries. Wait a while, then try again.', vars?: Vars) =>
  new Refusal(429, 'rate_limited', message, retryAfter, vars);
export const invalid = (message: string, vars?: Vars) => new Refusal(400, 'invalid_input', message, undefined, vars);
export const forbidden = (message = "You can't do that here.", vars?: Vars) => new Refusal(403, 'forbidden', message, undefined, vars);
export const suspended = () =>
  new Refusal(403, 'account_suspended', 'This account has been suspended. Contact us if you think that is a mistake.');
export const unverified = () => new Refusal(403, 'email_unverified', 'Confirm your email address first. We can send you a code.');
export const lastAdmin = (message = 'A team needs at least one admin. Make someone else an admin first.') =>
  new Refusal(409, 'last_admin', message);
