import { describe, expect, it, vi } from 'vitest';
import { TokenQueue } from './captcha';

describe('CAPTCHA tokens', () => {
  it('hands out a ready token once, then resets the widget for a fresh one', async () => {
    const reset = vi.fn();
    const q = new TokenQueue(reset);
    q.give('t1');
    await expect(q.take()).resolves.toBe('t1');
    expect(reset).toHaveBeenCalledTimes(1);
    // The same token is never handed out twice.
    const next = q.take(1000);
    q.give('t2');
    await expect(next).resolves.toBe('t2');
  });

  it('waits for the widget when no token is ready', async () => {
    const q = new TokenQueue(() => {});
    const waiting = q.take(1000);
    q.give('t1');
    await expect(waiting).resolves.toBe('t1');
  });

  it('drops an expired token', async () => {
    const q = new TokenQueue(() => {});
    q.give('old');
    q.expire();
    const waiting = q.take(1000);
    q.give('new');
    await expect(waiting).resolves.toBe('new');
  });

  it('passes on a widget failure', async () => {
    const q = new TokenQueue(() => {});
    const waiting = q.take(1000);
    q.fail(new Error('The security check failed.'));
    await expect(waiting).rejects.toThrow('security check');
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    const q = new TokenQueue(() => {});
    const waiting = q.take(500);
    vi.advanceTimersByTime(501);
    await expect(waiting).rejects.toThrow(/too long/);
    vi.useRealTimers();
  });
});
