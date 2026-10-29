// Cloudflare Turnstile (PRD R1.5), on the routes that send email or check a password. On when a
// site key and secret are set. A token passes only if Turnstile says so and it was made on one of
// the app's own sites (the hostname Turnstile reports is an allowed origin's), so a token solved
// on some other site that uses the same widget can't be brought here.
//
// Turnstile's test secrets (README) pass every token and report the hostname `example.com`, so
// they're taken only by a local API, without the hostname check, and refused anywhere else: a
// deploy that kept them would have no CAPTCHA at all.

import type { Ctx } from './env';
import { Refusal } from './errors';

const failed = () => new Refusal(400, 'captcha_failed', "We couldn't check that you're a person. Try the check again.");

/** Turnstile's documented test secrets: always pass, always fail, already spent. */
export const isTestSecret = (secret: string) => /^[123]x0{31}AA$/.test(secret);

/** The hostnames of the app's allowed origins. */
const hostsOf = (origins: string[]) =>
  origins.flatMap((o) => {
    try {
      return [new URL(o).hostname];
    } catch {
      return [];
    }
  });

export async function checkCaptcha(ctx: Ctx, token: unknown): Promise<void> {
  const captcha = ctx.cfg.captcha;
  if (!captcha) return;
  const testing = isTestSecret(captcha.secret);
  if (testing && !ctx.cfg.local) {
    console.error("TURNSTILE_SECRET is one of Turnstile's test secrets, which a deployed API refuses. Put the real one.");
    throw failed();
  }
  if (typeof token !== 'string' || !token || token.length > 2048) throw failed();
  const form = new FormData();
  form.append('secret', captcha.secret);
  form.append('response', token);
  if (ctx.ip !== 'local') form.append('remoteip', ctx.ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => {
    console.error('Turnstile', e);
    return null;
  });
  const out = res?.ok ? await res.json<{ success?: boolean; hostname?: string; 'error-codes'?: string[] }>().catch(() => null) : null;
  if (!out?.success) {
    if (out) console.log('Turnstile refused', out['error-codes']);
    throw failed();
  }
  if (!testing && !hostsOf(ctx.cfg.origins).includes(String(out.hostname ?? '').toLowerCase())) {
    console.log('Turnstile token made on another site', out.hostname);
    throw failed();
  }
}
