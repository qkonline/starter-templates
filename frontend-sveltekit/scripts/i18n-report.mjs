// `npm run i18n`: every text in the code, and what each language still lacks. Fails on stale or
// broken translations (the unit tests fail the same way), never on missing ones: those show in
// English until translated.

import { locales } from '../src/lib/i18n/catalogs.ts';
import { allTexts, check } from './i18n.mjs';

const texts = allTexts();
console.log(`${texts.length} texts in the code.`);
let bad = false;
for (const [code, locale] of Object.entries(locales)) {
  if (code === 'en') continue;
  const r = check(texts, locale.messages);
  console.log(
    `${code} (${locale.name}): ${texts.length - r.missing.length} translated, ${r.missing.length} missing.`,
  );
  for (const s of r.stale) console.log(`  stale (not in the code any more): ${JSON.stringify(s)}`);
  for (const s of r.broken)
    console.log(`  placeholders or tags differ from the English: ${JSON.stringify(s)}`);
  if (process.argv.includes('--missing'))
    for (const s of r.missing) console.log(`  missing: ${JSON.stringify(s)}`);
  bad ||= r.stale.length > 0 || r.broken.length > 0;
}
if (bad) process.exit(1);
