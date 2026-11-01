// The backend's messages and emails in the language the app asks for (Accept-Language, which the
// frontend sets to the person's choice), gettext style like the frontend: the English text in
// the code is the key, and a language is a map of English text to translation. The app's
// translations are in src/app/i18n.ts; anything not translated goes in English.
//
// A refusal's message is translated as the reply is made (index.ts, onError), so code throws
// `invalid('Ask for 1 to {max} records at a time.', { max })` and never translates by hand.
// `npm run i18n` lists every text and checks each language's map (scripts/i18n.mjs).

import { appMessages } from './app/i18n';

export type Vars = Record<string, string | number>;

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all)) : text;

/** `text` in `lang`, with `{name}` placeholders filled from `vars`. */
export function tr(lang: string, text: string, vars?: Vars): string {
  const found = appMessages[lang]?.[text];
  return fill(found || text, vars);
}

/** The best of the app's languages for an Accept-Language header, or 'en'. */
export function languageOf(header: string | null | undefined): string {
  if (!header) return 'en';
  const wanted = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((w) => w.tag && w.q > 0)
    .sort((a, b) => b.q - a.q);
  const have = Object.keys(appMessages);
  for (const { tag } of wanted) {
    const exact = have.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = have.find((l) => l.toLowerCase() === tag.split('-')[0]);
    if (base) return base;
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}
