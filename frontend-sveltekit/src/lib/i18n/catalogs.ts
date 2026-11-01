// Every language the app has, merged: English (the text in the code), the core's translations
// (./locales/) and the app's own (src/lib/app/i18n/, which win). Plain data, so the build's
// scripts can read it too.

import { appLocales } from '#lib/app/i18n/index.ts';
import { coreLocales } from './locales/index.ts';

/** One language: its own name, which way it's written, and its translations. */
export interface Locale {
  /** As people who speak it write it: "English", "اردو". */
  name: string;
  dir: 'ltr' | 'rtl';
  /** English text → translation; for a plural, the forms by Intl.PluralRules category. */
  messages: Record<string, string | Partial<Record<Intl.LDMLPluralRule, string>>>;
}

export const locales: Record<string, Locale> = { en: { name: 'English', dir: 'ltr', messages: {} } };
for (const [code, l] of Object.entries(coreLocales)) locales[code] = { ...l, messages: { ...l.messages } };
for (const [code, l] of Object.entries(appLocales)) {
  const base = locales[code];
  locales[code] = base ? { ...base, ...l, messages: { ...base.messages, ...l.messages } } : l;
}
