import { describe, expect, it } from 'vitest';
import { appMessages } from './app/i18n';
import { languageOf, tr } from './i18n';
import { trHtml } from './mail';
// @ts-expect-error -- a plain script, without types
import { allTexts, check } from '../scripts/i18n.mjs';

appMessages.xx = {
  "That doesn't look like an email address.": 'Not an address.',
  'Ask for 1 to {max} records at a time.': 'From 1 to {max}.',
  '{who} invited you to join {team} on {app} as {role}.': '{who} → {team} ({app}, {role}).',
};

describe('the language of messages', () => {
  it("is the best of the app's for Accept-Language, else English", () => {
    expect(languageOf('xx-YY;q=0.8, de;q=0.9')).toBe('xx');
    expect(languageOf('de, en;q=0.5')).toBe('en');
    expect(languageOf(undefined)).toBe('en');
    expect(languageOf('*')).toBe('en');
  });

  it('translates with placeholders filled, and goes in English when there is no translation', () => {
    expect(tr('xx', "That doesn't look like an email address.")).toBe('Not an address.');
    expect(tr('xx', 'Ask for 1 to {max} records at a time.', { max: 200 })).toBe('From 1 to 200.');
    expect(tr('xx', 'Not translated.')).toBe('Not translated.');
    expect(tr('en', 'Ask for 1 to {max} records at a time.', { max: 200 })).toBe('Ask for 1 to 200 records at a time.');
  });

  it('in HTML, neither a value nor a translation can add markup', () => {
    const html = trHtml('xx', '{who} invited you to join {team} on {app} as {role}.', { who: '<script>', team: 'A&B', app: 'App', role: 'x' }, ['team']);
    expect(html).toBe('&#60;script&#62; → <b>A&#38;B</b> (App, x).');
  });
});

describe('the texts', () => {
  it('are found in the code, including messages with placeholders and emails', () => {
    const texts = allTexts();
    for (const t of ["That doesn't look like an email address.", 'Ask for 1 to {max} records at a time.', 'Your {app} code is {code}', 'Enter it to sign in.'])
      expect(texts).toContain(t);
    expect(texts.some((t: string) => /^(SELECT|UPDATE|DELETE)/.test(t))).toBe(false);
  });

  it("every language's translations are of texts still in the code, with the same placeholders", () => {
    const texts = allTexts();
    for (const [lang, messages] of Object.entries(appMessages)) {
      if (lang === 'xx') continue;
      const r = check(texts, messages);
      expect({ lang, stale: r.stale, broken: r.broken }).toEqual({ lang, stale: [], broken: [] });
    }
  });
});
