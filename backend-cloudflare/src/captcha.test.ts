// Turnstile: a token must pass and have been made on one of the app's own sites; the test secrets
// work only on a local API.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { checkCaptcha } from './captcha';

const TEST_SECRET = '1x0000000000000000000000000000000AA';

function answer(body: Record<string, unknown>) {
  const fetch = vi.fn(async () => Response.json(body));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('checkCaptcha', () => {
  const live = (api = 'https://api.example.com/api') =>
    fakeCtx({ TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET: '0x4AAAAAAAreal', ALLOWED_ORIGINS: 'https://app.example.com' }, { api }).ctx;

  it("passes a token made on the app's own site", async () => {
    answer({ success: true, hostname: 'app.example.com' });
    await checkCaptcha(live(), 'token');
  });

  it('refuses one made on another site, or refused by Turnstile', async () => {
    answer({ success: true, hostname: 'other.example' });
    await expect(checkCaptcha(live(), 'token')).rejects.toMatchObject({ code: 'captcha_failed' });
    answer({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(checkCaptcha(live(), 'token')).rejects.toMatchObject({ code: 'captcha_failed' });
    await expect(checkCaptcha(live(), '')).rejects.toMatchObject({ code: 'captcha_failed' });
  });

  it('takes the test secret on a local API only, whatever hostname it reports', async () => {
    const vars = { TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET: TEST_SECRET };
    const fetch = answer({ success: true, hostname: 'example.com' });
    await checkCaptcha(fakeCtx(vars).ctx, 'XXXX.DUMMY.TOKEN.XXXX');
    await expect(checkCaptcha(fakeCtx(vars, { api: 'https://api.example.com/api' }).ctx, 'XXXX.DUMMY.TOKEN.XXXX')).rejects.toMatchObject({
      code: 'captcha_failed',
    });
    // Refused before asking Turnstile.
    expect(fetch).toHaveBeenCalledOnce();
  });
});
