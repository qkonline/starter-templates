/* eslint-disable @typescript-eslint/ban-ts-comment -- run by Node, which this browser app has no types for */
// @ts-nocheck
// Every text the app shows, found in the code, and each language's file checked against them
// (`npm run i18n`; the unit tests run the same check). Texts are what's passed to t(), tn(),
// msg() and <Trans text="…">, written as plain string literals (no `${}`; use {placeholders}).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CALL = /\b(?:t|msg)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const PLURAL = /\btn\(\s*[^,]+,\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g;
const TRANS = /<Trans\b[^>]*?\btext=(["'])((?:(?!\1).)*)\1/gs;

const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

/** The texts in one file's source. */
/** @param {string} source @returns {string[]} */
export function textsIn(source) {
  const out = [];
  // Examples in comments aren't texts the app shows.
  source = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const m of source.matchAll(CALL)) if (!m[2].includes('${')) out.push(unescape(m[2]));
  for (const m of source.matchAll(PLURAL)) out.push(unescape(m[2]), unescape(m[4]));
  for (const m of source.matchAll(TRANS)) out.push(m[2]);
  return out;
}

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return /^(i18n|node_modules)$/.test(e.name) && dir.endsWith('lib') ? [] : files(p);
    return /\.(svelte|ts)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

/** Every text in the app's source, sorted, once each. */
export function allTexts(root = 'src') {
  return [...new Set(files(root).flatMap((f) => textsIn(readFileSync(f, 'utf8'))))].sort();
}

const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
const tags = (s) =>
  [...s.matchAll(/<(\w+)>/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

/** A language's translations against the texts. */
/**
 * @param {readonly string[]} texts
 * @param {Record<string, unknown>} messages
 * @returns {{ missing: string[]; stale: string[]; broken: string[] }} stale: translations of texts no
 *   longer in the code; broken: ones whose {placeholders} or <tags> differ from the English.
 */
export function check(texts, messages) {
  const known = new Set(texts);
  const report = { missing: [], stale: [], broken: [] };
  for (const text of texts) if (!(text in messages)) report.missing.push(text);
  for (const [text, value] of Object.entries(messages)) {
    if (!known.has(text)) {
      report.stale.push(text);
      continue;
    }
    const forms = typeof value === 'string' ? [value] : Object.values(value);
    const want = placeholders(text).replace(/(^|,)count(,|$)/, '$1$2');
    for (const f of forms)
      if (placeholders(f).replace(/(^|,)count(,|$)/, '$1$2') !== want || tags(f) !== tags(text))
        report.broken.push(text);
  }
  return report;
}
