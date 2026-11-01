import { afterEach, describe, expect, it } from 'vitest';
import { allTexts, check, textsIn } from '../../../scripts/i18n.mjs';
import { formatNumber, i18n, locales, pick, t, tn } from './index.svelte.ts';

locales.xx = {
  name: 'Test',
  dir: 'rtl',
  messages: {
    'Enter your password.': 'Password, please.',
    'Enter the code we sent to {email}.': 'Code sent to {email}.',
    '{count} changes waiting': { one: 'one waiting ({count})', other: '{count} waiting' },
  },
};

afterEach(() => (i18n.locale = 'en'));

describe('translating', () => {
  it('shows the English when there is nothing else, and the translation when there is', () => {
    expect(t('Enter your password.')).toBe('Enter your password.');
    i18n.locale = 'xx';
    expect(t('Enter your password.')).toBe('Password, please.');
    expect(t('Enter the code we sent to {email}.', { email: 'a@b.c' })).toBe('Code sent to a@b.c.');
    expect(t('Not translated yet.')).toBe('Not translated yet.');
  });

  it("picks plurals by the language's rules", () => {
    expect(tn(1, '1 change waiting', '{count} changes waiting')).toBe('1 change waiting');
    expect(tn(1200, '1 change waiting', '{count} changes waiting')).toBe(
      `${formatNumber(1200)} changes waiting`,
    );
    i18n.locale = 'xx';
    expect(tn(1, '1 change waiting', '{count} changes waiting')).toBe('one waiting (1)');
    expect(tn(3, '1 change waiting', '{count} changes waiting')).toBe('3 waiting');
  });

  it("starts in the browser's language when the app has it", () => {
    expect(pick(['xx-YY', 'en'])).toBe('xx');
    expect(pick(['de-DE'])).toBe('en');
  });
});

describe('finding the texts', () => {
  it('takes t(), tn(), msg() and <Trans text>, not comments or computed text', () => {
    const source = `
      <!-- t('In a comment') -->
      // t('Also a comment')
      t('Sign in'); t("It's here"); msg('Member');
      tn(n, '1 file', '{count} files');
      t(\`Hello \${name}\`);
      <Trans text="Read the <link>notice</link>." />
    `;
    expect(textsIn(source).sort()).toEqual(
      ['1 file', "It's here", 'Member', 'Read the <link>notice</link>.', 'Sign in', '{count} files'].sort(),
    );
  });

  it("says which translations are stale, and which don't keep the placeholders", () => {
    const r = check(['Hello {name}.', 'Bye.', '<b>Hi</b>'], {
      'Hello {name}.': 'Hallo.',
      'Gone.': 'Weg.',
      '<b>Hi</b>': '<b>Hoi</b>',
    });
    expect(r).toEqual({ missing: ['Bye.'], stale: ['Gone.'], broken: ['Hello {name}.'] });
  });
});

describe("the app's languages", () => {
  it('translate only texts still in the code, keeping their placeholders and tags', () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(300);
    for (const [code, l] of Object.entries(locales)) {
      if (code === 'en' || code === 'xx') continue;
      const r = check(texts, l.messages);
      expect({ code, stale: r.stale, broken: r.broken }).toEqual({ code, stale: [], broken: [] });
    }
  });
});
