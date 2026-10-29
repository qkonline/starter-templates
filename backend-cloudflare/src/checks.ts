// What the API accepts. Each body is read into exactly the fields its route allows, so nothing
// else ever reaches storage.

import { invalid } from './errors';

/**
 * An address the way browsers check `type=email` (the HTML standard's pattern), less `?` and `&`
 * (they'd turn a mailto: link or a query into something else), and with a dot in the domain.
 */
const EMAIL = /^[a-z0-9.!#$%'*+/=^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** An email address as typed, trimmed and lower-cased, or null if it doesn't look like one. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 254) return null;
  const e = v.trim().toLowerCase();
  return EMAIL.test(e) ? e : null;
}

/** The frontend's passwordKey: 32 bytes, base64url without padding. */
export const isPasswordKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

/** A six-digit code as typed ("123 456" works), or null. */
export function cleanCode(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 20) return null;
  const digits = v.replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

/** Most a name may be as sent, before tidying (the contract's maxLength). */
const NAME_SENT = 200;

/**
 * A name with its spaces tidied, 1 to `max` characters, or null. Line breaks and other control
 * characters become spaces too, so a name can't start a new line in an email or a log.
 */
export function cleanName(v: unknown, max = 60): string | null {
  if (typeof v !== 'string' || v.length > NAME_SENT) return null;
  const name = v.replace(/[\s\p{Cc}]+/gu, ' ').trim();
  return name && name.length <= max ? name : null;
}

/** An optional name: null when none (absent or blank), undefined when it can't be one, else tidied. */
export function optionalName(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null || (typeof v === 'string' && !v.replace(/[\s\p{Cc}]+/gu, ''))) return null;
  return cleanName(v, max) ?? undefined;
}

/** An id as the contract has them: a passkey's credential id can be long. */
export const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,1024}$/.test(v);

const MAX_BODY = 64 * 1024;

/**
 * The body's bytes, or null when there are more than `max`: refused from its Content-Length when
 * it says so, and never read past `max` either way, so a large body costs nothing.
 */
export async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A JSON object body with only the fields `allowed` names. */
export async function readBody<K extends string>(req: Request, allowed: readonly K[]): Promise<Partial<Record<K, unknown>>> {
  const bad = invalid("That request didn't make sense. Reload the page and try again.");
  const bytes = await readCapped(req, MAX_BODY);
  if (!bytes) throw bad;
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw bad;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad;
  for (const k of Object.keys(body)) if (!(allowed as readonly string[]).includes(k)) throw bad;
  return body as Partial<Record<K, unknown>>;
}

/** A short name for the device, from its browser, for the list of sessions and passkeys. */
export function deviceName(ua: string | null | undefined): string {
  ua ??= '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}

/**
 * The `cursor` of a list newest first: where the previous page stopped, as "<time>.<id>". Null for
 * the first page; one that was never given is `invalid_input`.
 */
export function readCursor(v: string | undefined): { at: number; id: string } | null {
  if (v === undefined || v === '') return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,100})$/.exec(v);
  if (!m) throw invalid('That page of the list is out of date. Start again from the first.');
  return { at: Number(m[1]), id: m[2]! };
}

/**
 * A page from rows fetched with one more than `size`: the page, and `next` (where the following
 * page starts) when there was more.
 */
export function paged<T>(rows: T[], size: number, key: (row: T) => { at: number; id: string }): { items: T[]; next: string | null } {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  if (rows.length <= size || !last) return { items, next: null };
  const k = key(last);
  return { items, next: `${k.at}.${k.id}` };
}

/** Optional text of at most `max` characters, trimmed; null when empty, undefined when it isn't text or is too long. */
export function optionalText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > max) return undefined;
  return v.trim() || null;
}
