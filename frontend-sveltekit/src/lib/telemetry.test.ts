import { describe, expect, it, vi } from 'vitest';
import { createReporter, describe as describeError, fingerprint } from './telemetry';

function setup(options: { perMinute?: number; total?: number; ignore?: (e: unknown) => boolean } = {}) {
  let t = 1_000_000;
  const send = vi.fn();
  const reporter = createReporter({
    send,
    release: 'v1',
    url: () => '/app',
    now: () => t,
    ...options,
  });
  return { reporter, send, advance: (ms: number) => (t += ms) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the error reporter', () => {
  it('sends the message, stack, page and build version', async () => {
    const { reporter, send } = setup();
    const error = new Error('boom');
    expect(reporter.report(error)).toBe(true);
    await flush();
    expect(send).toHaveBeenCalledWith({ message: 'boom', stack: error.stack, url: '/app', release: 'v1' });
  });

  it('sends the same error once', () => {
    const { reporter } = setup();
    const make = () => {
      const e = new Error('same');
      e.stack = 'Error: same\n    at f (app.js:1:1)';
      return e;
    };
    expect(reporter.report(make())).toBe(true);
    expect(reporter.report(make())).toBe(false);
  });

  it('holds back a flood: a few a minute, and a cap per page life', () => {
    const { reporter, advance } = setup({ perMinute: 2, total: 3 });
    expect(reporter.report('a')).toBe(true);
    expect(reporter.report('b')).toBe(true);
    expect(reporter.report('c')).toBe(false);
    advance(61_000);
    expect(reporter.report('d')).toBe(true);
    advance(61_000);
    expect(reporter.report('e')).toBe(false);
  });

  it('never throws, whatever is thrown or however sending fails', async () => {
    const send = vi.fn(() => {
      throw new Error('network');
    });
    const reporter = createReporter({ send, release: 'v1', url: () => '/' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => reporter.report(circular)).not.toThrow();
    expect(() => reporter.report(undefined)).not.toThrow();
    expect(() => reporter.report(Object.create(null))).not.toThrow();
    await flush();
  });

  it('skips noise and what the app says is not a bug', () => {
    const { reporter } = setup({ ignore: (e) => e === 'expected' });
    expect(reporter.report('Script error.')).toBe(false);
    expect(reporter.report('ResizeObserver loop completed with undelivered notifications.')).toBe(false);
    expect(reporter.report('expected')).toBe(false);
  });

  it('clips long messages to what the backend takes', async () => {
    const { reporter, send } = setup();
    reporter.report('x'.repeat(5000));
    await flush();
    expect((send.mock.calls[0]![0] as { message: string }).message).toHaveLength(1000);
  });

  it('keys a report by its message and first stack frame', () => {
    expect(fingerprint({ message: 'm', stack: 'Error: m\n  at a (x.js:1)\n  at b (y.js:2)' })).toBe(
      'm\nat a (x.js:1)',
    );
    expect(describeError('text')).toEqual({ message: 'text' });
  });
});
