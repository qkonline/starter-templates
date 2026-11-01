// Translation (gettext style): the English text is the key. Write `t('Enter your password.')`;
// a language is a file mapping each English text to its translation (src/lib/i18n/locales/ for
// the core's, src/lib/app/i18n/ for the app's own), and anything not translated shows in English.
//
//   t('Enter the code we sent to {email}.', { email })        // placeholders in {braces}
//   tn(count, '1 change waiting', '{count} changes waiting')   // plurals, by the language's rules
//   <Trans text="Read the <link>privacy notice</link>.">       // markup inside a sentence:
//     {#snippet link(s)}<a href="/privacy">{s}</a>{/snippet}   // components/Trans.svelte
//   </Trans>
//
// A label kept in a list at the top of a module (`{ value, label }`) stays English there and is
// translated where it's shown (`t(option.label)`), so it follows a change of language.
//
// The language is a setting of the device (Account → Display), saved as `starter:locale`; it
// starts as the browser's if the app has it, else English. The backend's messages and emails
// come in it too: every request says it (Accept-Language). `npm run i18n` lists every text and
// checks each language's file (scripts/i18n.mjs).

import { locales, type Locale } from './catalogs.ts';

export { locales, type Locale };

export const LOCALE_KEY = 'starter:locale';

export const i18n = $state({ locale: 'en' });

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** `text` in the current language, with `{name}` placeholders filled from `vars`. */
export function t(text: string, vars?: Vars): string {
  const found = locales[i18n.locale]?.messages[text];
  return fill(typeof found === 'string' && found ? found : text, vars);
}

/**
 * A text that depends on a count: `one` and `other` in English (`{count}` filled in); in another
 * language, its plural forms, kept under the English `other`.
 */
export function tn(count: number, one: string, other: string, vars?: Vars): string {
  const all = { count: formatNumber(count), ...vars };
  const found = locales[i18n.locale]?.messages[other];
  if (found && typeof found === 'object') {
    const form = found[new Intl.PluralRules(i18n.locale).select(count)] ?? found.other;
    if (form) return fill(form, all);
  }
  return fill(count === 1 ? one : other, all);
}

export const formatNumber = (n: number) => new Intl.NumberFormat(i18n.locale).format(n);

export const formatDate = (
  d: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
) =>
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a value to format, not state
  new Intl.DateTimeFormat(i18n.locale, opts).format(new Date(d));

/** The best of the app's languages for these preferences (`navigator.languages`), or English. */
export function pick(wanted: readonly string[]): string {
  for (const w of wanted) {
    const tag = w.toLowerCase();
    const exact = Object.keys(locales).find((c) => c.toLowerCase() === tag);
    if (exact) return exact;
    const base = Object.keys(locales).find((c) => c.toLowerCase() === tag.split('-')[0]);
    if (base) return base;
  }
  return 'en';
}

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function apply(code: string) {
  i18n.locale = code;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = locales[code]!.dir;
  }
}

/** Switch language: everything shown follows at once; kept on this device. */
export function setLocale(code: string): void {
  if (!locales[code]) return;
  apply(code);
  try {
    store()?.setItem(LOCALE_KEY, code);
  } catch {
    /* Kept until the page closes. */
  }
}

/** Once, in the browser (the root layout): the saved language, or the browser's. */
export function startI18n(): void {
  let saved: string | null = null;
  try {
    saved = store()?.getItem(LOCALE_KEY) ?? null;
  } catch {
    /* none */
  }
  const code =
    saved && locales[saved] ? saved : pick(typeof navigator === 'undefined' ? [] : navigator.languages);
  apply(code);
}

/**
 * Marks a text to translate that's kept untranslated where it's written (a label in a list at the
 * top of a module) and translated where it's shown with `t(label)`. Returns it as it is.
 */
export const msg = (text: string): string => text;
