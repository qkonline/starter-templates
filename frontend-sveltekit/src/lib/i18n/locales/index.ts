// The core's translations, by language code (BCP 47: 'ur', 'ar', 'fr', 'pt-BR'). English needs
// none: it's the text in the code. Add a language as `<code>.ts` exporting a Locale, list it here,
// and run `npm run i18n` to see what it still lacks. An app's own go in src/lib/app/i18n/.

import type { Locale } from '../catalogs.ts';

export const coreLocales: Record<string, Locale> = {};
