import { describe, expect, it } from 'vitest';
import { ApiError, cancelled, errorFrom, messageOf, parseRetryAfter } from './errors';

describe('errorFrom', () => {
  it('keeps the contract code and message as they are', () => {
    const e = errorFrom(400, { code: 'invalid_credentials', message: 'That email or password is wrong.' });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('invalid_credentials');
    expect(e.message).toBe('That email or password is wrong.');
    expect(e.status).toBe(400);
  });

  it('reads Retry-After on rate_limited', () => {
    const e = errorFrom(
      429,
      { code: 'rate_limited', message: 'Wait.' },
      new Headers({ 'retry-after': '42' }),
    );
    expect(e.code).toBe('rate_limited');
    expect(e.retryAfter).toBe(42);
  });

  it('falls back by status for bodies that are not contract errors', () => {
    expect(errorFrom(502, '<html>Bad gateway</html>').code).toBe('server_error');
    expect(errorFrom(401, null).code).toBe('signed_out');
    expect(errorFrom(413, {}).code).toBe('too_large');
    expect(errorFrom(429, { code: 'slow_down' }).code).toBe('rate_limited');
    expect(errorFrom(500, null).message).toMatch(/server/);
  });

  it('gives words when a contract error comes without a message', () => {
    const e = errorFrom(400, { code: 'invalid_input', message: '' });
    expect(e.code).toBe('invalid_input');
    expect(e.message.length).toBeGreaterThan(0);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
    const now = Date.parse('2026-10-28T12:00:00Z');
    expect(parseRetryAfter('Wed, 28 Oct 2026 12:00:30 GMT', now)).toBe(30);
  });
});

describe('messageOf and cancelled', () => {
  it('shows the message of whatever was thrown', () => {
    expect(messageOf(new ApiError('email_taken', 'Taken.', 409))).toBe('Taken.');
    expect(messageOf(new Error('Boom.'))).toBe('Boom.');
    expect(messageOf('nope')).toMatch(/Something went wrong/);
  });

  it('treats a closed passkey prompt as no error', () => {
    const e = new Error('closed');
    e.name = 'NotAllowedError';
    expect(cancelled(e)).toBe(true);
    expect(cancelled(new Error('other'))).toBe(false);
  });
});
