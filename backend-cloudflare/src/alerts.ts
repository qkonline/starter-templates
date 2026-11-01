// Telling a person when something needs one: an error on the server, mail that couldn't go, a
// deletion's cleanup or a background job that keeps failing, the daily sweep failing. Each is
// kept with the error reports in the admin area (Errors, kind server) and, when ALERT_WEBHOOK is
// set, posted there (Slack, Discord, Google Chat and most chat webhooks take the JSON sent), at
// most once an hour per kind of problem, so a storm is one message, not thousands.

import { sha256 } from './crypto';
import { d1 } from './db';
import type { Env } from './env';

const HOUR = 3600_000;

/** An https address that isn't this machine: what ALERT_WEBHOOK may be. */
export function webhookSafe(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Kept with the error reports, and posted to ALERT_WEBHOOK (at most once an hour for the same problem). */
export async function alert(env: Env, title: string, detail: string, where: string, now = Date.now()): Promise<void> {
  const signature = await sha256(`alert\n${title}\n${where}`);
  try {
    await d1(env.DB).recordReport(
      {
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
        signature,
        kind: 'server',
        message: title.slice(0, 1000),
        detail: detail.slice(0, 8000),
        url: where.slice(0, 1000),
        release: null,
        userId: null,
      },
      now,
    );
  } catch (e) {
    console.error('Recording an alert', e);
  }
  await postAlert(env, signature, title, where, detail, now);
}

/** Only the post to ALERT_WEBHOOK, for a problem already kept another way (the Worker's 500s). */
export async function postAlert(env: Env, signature: string, title: string, where: string, detail: string, now = Date.now()): Promise<void> {
  const db = d1(env.DB);
  const hook = env.ALERT_WEBHOOK?.trim();
  if (!hook || !webhookSafe(hook)) return;
  try {
    // Once an hour per kind of problem: the first in the hour posts, the rest only count.
    const { count } = await db.countUse(`alert:${signature}`, HOUR, now, 1);
    if (count > 1) return;
    const app = env.APP_TITLE || env.APP_NAME;
    const text = `${app}: ${title}\n${where}\n${detail.slice(0, 1500)}\n(At most one message an hour for this; all of them are in the admin area under Errors.)`;
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('ALERT_WEBHOOK answered', res.status);
  } catch (e) {
    console.error('Posting an alert', e);
  }
}
