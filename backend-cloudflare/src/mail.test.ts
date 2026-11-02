// The app's own daily mail cap (MAIL_PER_DAY): every kind of email counts, nothing past it is
// sent, and dev mail (nothing really sent) isn't counted.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { config } from './env';
import { devOutbox, sendMail } from './mail';

afterEach(() => vi.unstubAllGlobals());

const mail = { to: 'ann@example.com', subject: 'Hi', text: 'Hello' };
const sent = async (n: number, f: () => Promise<unknown>) => {
  let ok = 0;
  for (let i = 0; i < n; i++) ok += await f().then(() => 1, () => 0);
  return ok;
};

describe('MAIL_PER_DAY', () => {
  it('sends no more than the cap a day, and refuses the rest with rate_limited', async () => {
    const send = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', send);
    const { ctx } = fakeCtx({ RESEND_API_KEY: 're_x', MAIL_FROM: 'App <a@example.com>', MAIL_PER_DAY: '3' });
    expect(await sent(5, () => sendMail(ctx, mail))).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    await expect(sendMail(ctx, mail)).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
  });

  it('has no cap of its own when unset, and none with dev mail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    const open = fakeCtx({ RESEND_API_KEY: 're_x', MAIL_FROM: 'App <a@example.com>' }).ctx;
    expect(await sent(5, () => sendMail(open, mail))).toBe(5);
    const dev = fakeCtx({ DEV_MAIL: 'true', MAIL_PER_DAY: '1' }).ctx;
    const before = devOutbox.length;
    expect(await sent(3, () => sendMail(dev, mail))).toBe(3);
    expect(devOutbox.length - before).toBe(3);
  });

  it('fails loudly on a value that is not a whole number', () => {
    const env = { APP_NAME: 'test', ALLOWED_ORIGINS: '', MAIL_PER_DAY: 'thirty' } as never;
    expect(() => config(env, 'http://localhost:8787/api')).toThrow(/MAIL_PER_DAY/);
  });
});
