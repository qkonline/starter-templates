// Contact messages and feedback (PRD R7.1), and the error and CSP reports (R7.2) that browsers
// send. All of it works signed in or out.

import { Hono } from 'hono';
import { checkCaptcha } from '../captcha';
import { cleanEmail, optionalName, optionalText, readBody, readCapped } from '../checks';
import { randomToken } from '../crypto';
import type { MessageRow } from '../db';
import type { Ctx } from '../env';
import { invalid } from '../errors';
import { DAY, HOUR, limit, networkLimit, underLimit, underNetworkLimit } from '../limits';
import { sendMail } from '../mail';
import { maybeUser, perNetwork, type AppEnv } from '../middleware';
import { clientReport, cspReports, recordReport } from '../reports';

const PER_NETWORK_HOUR = 5;
const PER_ACCOUNT_DAY = 20;
const REPORTS_PER_NETWORK_HOUR = 120;
/**
 * Report requests stored a day from everyone together: bounds what the reports table and
 * report_hours can grow by between daily sweeps, however many networks send.
 */
const REPORTS_PER_DAY = 2000;
const MAX_REPORT_BODY = 32 * 1024;

export const contact = new Hono<AppEnv>();

/** Emailed to the app's contact address, when it has one. A failure is logged, never shown: the message is stored. */
async function forward(ctx: Ctx, m: MessageRow) {
  const to = ctx.cfg.contactEmail;
  if (!to) return;
  const from = m.name ? `${m.name} <${m.email}>` : m.email;
  await sendMail(ctx, {
    to,
    subject: `${m.kind === 'feedback' ? 'Feedback' : 'Contact'} on ${ctx.cfg.title} from ${m.email}`,
    text: `From: ${from}${m.user_id ? ` (account ${m.user_id})` : ''}${m.page ? `\nPage: ${m.page}` : ''}\n\n${m.message}`,
  }).catch((e) => console.error('Forwarding a contact message', e));
}

contact.post('/contact', perNetwork, maybeUser, async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['kind', 'name', 'email', 'message', 'page', 'captcha']);
  if (b.kind !== 'contact' && b.kind !== 'feedback') throw invalid('Say whether this is a message or feedback.');
  // Tidied like any name: no line breaks or control characters, which the forwarded email's
  // From line would otherwise carry.
  const name = optionalName(b.name, 80);
  if (name === undefined) throw invalid('Give a name of at most 80 characters, or none.');
  const page = optionalText(b.page, 500);
  if (page === undefined) throw invalid("The page you were on couldn't be read.");
  const message = typeof b.message === 'string' && b.message.length <= 5000 ? b.message.trim() : '';
  if (!message) throw invalid('Write a message of at most 5,000 characters.');
  // Signed in, the account answers for it; signed out, there must be somewhere to answer.
  const email = user ? user.email : cleanEmail(b.email);
  if (!email) throw invalid('Give an email address we can answer at.');
  await checkCaptcha(ctx, b.captcha);
  await networkLimit(ctx, 'contact', PER_NETWORK_HOUR, HOUR, 'Too many messages from this network. Try again in an hour.');
  if (user) await limit(ctx, `contact:${user.id}`, PER_ACCOUNT_DAY, 24 * HOUR, "That's as many messages as we take in a day. Try again tomorrow.");
  const row: MessageRow = {
    id: randomToken(12),
    kind: b.kind,
    name,
    email,
    user_id: user?.id ?? null,
    message,
    page,
    status: 'open',
    created: Date.now(),
  };
  await ctx.db.addMessage(row);
  await forward(ctx, row);
  return c.body(null, 204);
});

/** The body as JSON, or undefined: too large, or not JSON. Reports are never refused, only dropped. */
async function reportBody(req: Request): Promise<unknown> {
  const bytes = await readCapped(req, MAX_REPORT_BODY).catch(() => null);
  if (!bytes?.length) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/**
 * Whether to store this request's reports: under the network's hourly limit and the app's daily
 * cap. Over either, nothing at all is written, not even the count (countUse stops at the limit).
 */
const mayRecord = async (ctx: Ctx) =>
  (await underNetworkLimit(ctx, 'reports', REPORTS_PER_NETWORK_HOUR, HOUR)) && (await underLimit(ctx, 'reports:app', REPORTS_PER_DAY, DAY));

contact.post('/telemetry/errors', perNetwork, maybeUser, async (c) => {
  const ctx = c.var.ctx;
  const report = clientReport(await reportBody(c.req.raw));
  if (report && (await mayRecord(ctx))) await recordReport(ctx, { ...report, userId: c.var.user?.id ?? null });
  return c.body(null, 204);
});

contact.post('/telemetry/csp', perNetwork, async (c) => {
  const ctx = c.var.ctx;
  // At most five from one request (cspReports); the rest are dropped.
  const reports = cspReports(await reportBody(c.req.raw));
  if (reports.length && (await mayRecord(ctx))) for (const r of reports) await recordReport(ctx, r);
  return c.body(null, 204);
});
