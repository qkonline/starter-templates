// Every refusal from the backend is an `Error` from the contract: a `code` the app acts on and a
// `message` in plain words, shown to the person as it is (PRD R3.1). Failures that never got an
// answer from the backend get the code `network` and a message of our own.

import type { components } from '@starter/contract/types';

export type ErrorCode = components['schemas']['ErrorCode'];

/**
 * The contract's codes, `network` when the backend couldn't be reached, or a code an app's own
 * paths added (`slot_taken`), kept as the backend sent it.
 */
export type AnyCode = ErrorCode | 'network' | (string & {});

export class ApiError extends Error {
  constructor(
    /** The contract's code, `network` with no answer, or an app's own code. */
    readonly code: AnyCode,
    message: string,
    /** The HTTP status; 0 when there was no answer. */
    readonly status: number,
    /** Seconds to wait, from `Retry-After`, when the backend said. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const codes: ReadonlySet<string> = new Set<ErrorCode>([
  'invalid_input',
  'invalid_code',
  'invalid_credentials',
  'captcha_failed',
  'signed_out',
  'email_unverified',
  'forbidden',
  'account_suspended',
  'last_admin',
  'not_found',
  'conflict',
  'email_taken',
  'passkey_refused',
  'rate_limited',
  'too_large',
  'unsupported_type',
  'mail_failed',
  'server_error',
  'client_outdated',
]);

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && codes.has(value);

/** Plain words for a reply that isn't a contract `Error`, by status. */
function fallbackMessage(status: number): string {
  if (status === 401) return 'You’ve been signed out. Sign in again.';
  if (status === 403) return 'You can’t do that here.';
  if (status === 404) return 'That isn’t here.';
  if (status === 413) return 'That file is too large.';
  if (status === 429) return 'Too many tries. Wait a little, then try again.';
  if (status >= 500) return 'Something went wrong on the server. Try again in a moment.';
  return 'Something went wrong. Try again.';
}

function fallbackCode(status: number): ErrorCode {
  if (status === 401) return 'signed_out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'too_large';
  if (status === 415) return 'unsupported_type';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'invalid_input';
}

/** Seconds from a `Retry-After` header: a number of seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** Turn a failed reply's status, parsed body and headers into an ApiError. */
export function errorFrom(status: number, body: unknown, headers?: Headers): ApiError {
  const retryAfter = parseRetryAfter(headers?.get('retry-after') ?? null);
  if (body && typeof body === 'object') {
    const { code, message } = body as { code?: unknown; message?: unknown };
    // The contract's codes, and an app's own (lower case and _), with the message as sent.
    if (isErrorCode(code) || (typeof code === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(code))) {
      const text = typeof message === 'string' && message.trim() ? message : fallbackMessage(status);
      return new ApiError(code, text, status, retryAfter);
    }
  }
  return new ApiError(fallbackCode(status), fallbackMessage(status), status, retryAfter);
}

/** When no answer came at all. */
export function networkError(): ApiError {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return new ApiError(
    'network',
    offline
      ? 'You’re offline. Try again once you’re connected.'
      : 'Couldn’t reach the server. Check your connection and try again.',
    0,
  );
}

/** The words to show for anything thrown while doing something for the person. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

/** The person closed the browser's passkey prompt, or it timed out: nothing to say about it. */
export const cancelled = (e: unknown): boolean =>
  e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');
