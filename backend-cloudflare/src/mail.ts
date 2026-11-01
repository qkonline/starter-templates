// Sending email through Resend's HTTP API. Without a key, in local development (DEV_MAIL), mail
// is kept for `/dev/mail` instead, so the contract tests can read the codes (PRD R10.1).

import type { Ctx } from './env';
import { alert } from './alerts';
import { Refusal } from './errors';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Mail kept in local development, newest last, at most this many. Local dev runs one isolate, so memory is enough. */
const DEV_OUTBOX_MAX = 500;
export const devOutbox: Mail[] = [];

export async function sendMail(ctx: Ctx, mail: Mail): Promise<void> {
  const { env, cfg } = ctx;
  if (cfg.devMail) {
    devOutbox.push(mail);
    if (devOutbox.length > DEV_OUTBOX_MAX) devOutbox.shift();
    console.log(`Mail to ${mail.to}: ${mail.subject}`);
    return;
  }
  const failed = new Refusal(502, 'mail_failed', "The email couldn't be sent. Try again in a minute.");
  const tell = (why: string) => {
    const p = alert(env, "Email couldn't be sent", why, 'Resend');
    if (ctx.waitUntil) ctx.waitUntil(p);
  };
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.error('Mail is not set up: RESEND_API_KEY and MAIL_FROM are needed.');
    tell('RESEND_API_KEY or MAIL_FROM is missing.');
    throw failed;
  }
  // A slow answer from Resend mustn't keep a sign-in waiting for ever.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => {
    console.error('Resend', e);
    tell(`No answer from Resend: ${String(e)}`);
    throw failed;
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Resend', res.status, body);
    // 429 is the plan's daily or per-second limit; 403 a domain or key problem.
    tell(`Resend answered ${res.status}: ${body.slice(0, 500)}`);
    throw failed;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** An email carrying a six-digit code, with a line saying what it's for. */
export function codeMail(ctx: Ctx, to: string, code: string, purpose: string): Mail {
  const title = ctx.cfg.title;
  const after = `${purpose} It works for 10 minutes. If you didn't ask for it, you can ignore this email.`;
  return {
    to,
    subject: `Your ${title} code is ${code}`,
    text: `Your ${title} code is ${code}\n\n${after}`,
    html:
      `<p style="font:16px/1.5 system-ui,sans-serif">Your ${esc(title)} code is</p>` +
      `<p style="font:600 28px/1.2 system-ui,sans-serif;letter-spacing:4px">${code}</p>` +
      `<p style="font:14px/1.5 system-ui,sans-serif;color:#5b6170">${esc(after)}</p>`,
  };
}

/** To the old address once an account has moved to another: who to tell if it wasn't them. */
export function movedMail(ctx: Ctx, to: string, next: string): Mail {
  const [name, domain] = next.split('@');
  const shown = `${name!.slice(0, 2)}…@${domain}`;
  const help = ctx.cfg.contactEmail ? ` If this wasn't you, write to ${ctx.cfg.contactEmail} straight away.` : " If this wasn't you, reply to this email straight away.";
  const text = `The email address of your ${ctx.cfg.title} account was changed to ${shown}, so this address no longer signs in.${help}`;
  return {
    to,
    subject: `Your ${ctx.cfg.title} email address was changed`,
    text,
    html: `<p style="font:16px/1.5 system-ui,sans-serif">${esc(text)}</p>`,
  };
}

