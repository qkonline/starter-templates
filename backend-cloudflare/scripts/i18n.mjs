#!/usr/bin/env node
// `npm run i18n`: every text the backend shows people (refusals' messages, emails, notifications)
// and what each language in src/app/i18n.ts still lacks. Fails on translations of texts no
// longer in the code, or whose {placeholders} differ from the English; never on missing ones,
// which go in English. Texts are string literals passed to invalid(), forbidden(), tooMany(),
// lastAdmin(), new Refusal(), refuse(), refusal(), tr() and trHtml(), and `message:` in the sync code.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STR = String.raw`(['"])((?:\\.|(?!\1)[^\\])*)\1`;
const PATTERNS = [
  new RegExp(String.raw`\b(?:invalid|forbidden|lastAdmin)\(\s*` + STR, 'g'),
  new RegExp(String.raw`\btooMany\([^,()]*,\s*` + STR, 'g'),
  new RegExp(String.raw`\bnew Refusal\([^,]+,\s*'[a-z_]+',\s*` + STR, 'g'),
  new RegExp(String.raw`\brefuse\([^,]+,\s*'[a-z_]+',\s*` + STR, 'g'),
  new RegExp(String.raw`\brefusal\(\s*'[a-z_]+',\s*` + STR, 'g'),
  new RegExp(String.raw`\btr(?:Html)?\([^,()]+,\s*` + STR, 'g'),
  new RegExp(String.raw`\bmessage:\s*` + STR, 'g'),
];
const SENTENCE = /(['"])((?:[A-Z{][^'"\n]{6,})[.?!])\1/g;
// Purposes of emailed codes: the lines are translated where the mail is made.
const LINES = /^\s+(?:signin|reset|confirm|change|leave):\s*\n?\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/gm;

/** The texts in one file. */
export function textsIn(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  for (const re of [...PATTERNS, LINES]) for (const m of code.matchAll(re)) out.push(m[3] ?? m[2]);
  // And any sentence written as a literal (a message passed on through a variable or a helper),
  // but not SQL, and not what only a developer or the app's operator reads (logs, errors, alerts).
  for (const m of code.matchAll(SENTENCE)) {
    const before = code.slice(Math.max(0, m.index - 60), m.index);
    if (!/^(SELECT|UPDATE|DELETE|INSERT|CREATE|ALTER|WITH)\b/.test(m[2]) && !/(console\.\w+|new Error|alert|tell)\([^)]*$/.test(before))
      out.push(m[2]);
  }
  return out.filter(Boolean).map((s) => s.replace(/\\(['"\\])/g, '$1'));
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'app' ? [] : files(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

export function allTexts(root = fileURLToPath(new URL('../src', import.meta.url))) {
  return [...new Set(files(root).flatMap((f) => textsIn(readFileSync(f, 'utf8'))))].sort();
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

export function check(texts, messages) {
  const known = new Set(texts);
  const report = { missing: texts.filter((t) => !(t in messages)), stale: [], broken: [] };
  for (const [text, value] of Object.entries(messages)) {
    if (!known.has(text)) report.stale.push(text);
    else if (placeholders(value) !== placeholders(text)) report.broken.push(text);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { appMessages } = await import('../src/app/i18n.ts');
  const texts = allTexts();
  console.log(`${texts.length} texts in the backend.`);
  let bad = false;
  for (const [lang, messages] of Object.entries(appMessages)) {
    const r = check(texts, messages);
    console.log(`${lang}: ${texts.length - r.missing.length} translated, ${r.missing.length} missing.`);
    for (const s of r.stale) console.log(`  stale: ${JSON.stringify(s)}`);
    for (const s of r.broken) console.log(`  placeholders differ: ${JSON.stringify(s)}`);
    if (process.argv.includes('--missing')) for (const s of r.missing) console.log(`  missing: ${JSON.stringify(s)}`);
    bad ||= r.stale.length > 0 || r.broken.length > 0;
  }
  if (process.argv.includes('--list')) for (const t of texts) console.log(JSON.stringify(t));
  if (bad) process.exit(1);
}
