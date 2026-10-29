import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/errors';
import { Task } from './task.svelte';

afterEach(() => vi.useRealTimers());

describe('Task', () => {
  it('shows the backend’s message and keeps its code', async () => {
    const t = new Task();
    const ok = await t.run(() =>
      Promise.reject(new ApiError('captcha_failed', 'The check failed. Try again.', 400)),
    );
    expect(ok).toBe(false);
    expect(t.error).toBe('The check failed. Try again.');
    expect(t.code).toBe('captcha_failed');
    expect(t.busy).toBe(false);
  });

  it('holds the button for the seconds rate_limited asks', async () => {
    vi.useFakeTimers();
    const t = new Task();
    await t.run(() => Promise.reject(new ApiError('rate_limited', 'Too many tries.', 429, 3)));
    expect(t.wait).toBe(3);
    expect(t.blocked).toBe(true);
    expect(await t.run(async () => {})).toBe(false); // refused while waiting
    vi.advanceTimersByTime(3000);
    expect(t.wait).toBe(0);
    expect(await t.run(async () => {})).toBe(true);
  });

  it('says nothing when the person closes the passkey prompt', async () => {
    const t = new Task();
    const closed = new Error('The operation either timed out or was not allowed.');
    closed.name = 'NotAllowedError';
    expect(await t.run(() => Promise.reject(closed))).toBe(false);
    expect(t.error).toBe('');
  });

  it('runs one at a time', async () => {
    const t = new Task();
    let release!: () => void;
    const first = t.run(() => new Promise<void>((r) => (release = r)));
    expect(t.busy).toBe(true);
    expect(await t.run(async () => {})).toBe(false);
    release();
    expect(await first).toBe(true);
  });
});
