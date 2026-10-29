// What a push carries and where tapping it goes. The contract doesn't fix the payload yet; this
// reads `{ title, body, url }` (a Notification's fields) and copes with anything else.

import { sameSitePath } from '#lib/same-site.ts';

export interface PushMessage {
  title: string;
  body: string;
  /** An app path, or null to open the app's home. */
  url: string | null;
}

/** Read a push's data, whatever came. */
export function readPush(text: string | null | undefined, appName: string): PushMessage {
  if (!text) return { title: appName, body: 'You have a new notification.', url: null };
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const title = typeof data.title === 'string' && data.title.trim() ? data.title : appName;
    const body = typeof data.body === 'string' ? data.body : '';
    return { title, body, url: typeof data.url === 'string' ? data.url : null };
  } catch {
    return { title: appName, body: text, url: null };
  }
}

/** Where tapping goes: only a path on this site; anything else opens the home page. */
export function openUrl(url: string | null | undefined, origin: string, home: string): string {
  return new URL(sameSitePath(url, origin) ?? home, origin).href;
}
