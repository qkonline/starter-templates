// Dates for people: "Today, 14:05", "Yesterday, 09:12", "3 Oct", "3 Oct 2025".

import { sameSitePath } from '#lib/same-site.ts';

const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatWhen(iso: string, now = new Date(), locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

/** A file name for today's export, such as `starter-data-2026-10-28.json`. */
export function exportFileName(appName: string, now = new Date()): string {
  const slug =
    appName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'app';
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${slug}-data-${day}.json`;
}

/** Save JSON as a file the person downloads. */
export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Only paths on this site, so `?next=` can't send anyone elsewhere; null for anything else.
 * Only a path counts (`/account`), not a full address, even of this site.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next?.startsWith('/')) return null;
  return sameSitePath(next, 'https://this-site.invalid');
}

/**
 * A `mailto:` link to one address. The address is encoded, so one that came from a form
 * (`a@b.c?cc=…&body=…`) can't add recipients or words to the email; `@` stays readable.
 */
export function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`;
}
