import { describe, expect, it } from 'vitest';
import { exportFileName, formatWhen, mailtoHref, safeNext } from './format';

describe('formatWhen', () => {
  const now = new Date(2026, 9, 28, 15, 0);

  it('says today and yesterday', () => {
    expect(formatWhen(new Date(2026, 9, 28, 9, 5).toISOString(), now, 'en-GB')).toBe('Today, 09:05');
    expect(formatWhen(new Date(2026, 9, 27, 23, 59).toISOString(), now, 'en-GB')).toBe('Yesterday, 23:59');
  });

  it('gives the date otherwise, with the year only when it differs', () => {
    expect(formatWhen(new Date(2026, 9, 3).toISOString(), now, 'en-GB')).toBe('3 Oct');
    expect(formatWhen(new Date(2025, 9, 3).toISOString(), now, 'en-GB')).toBe('3 Oct 2025');
    expect(formatWhen('not a date', now)).toBe('');
  });
});

describe('exportFileName', () => {
  it('names the file after the app and the day', () => {
    expect(exportFileName('My App!', new Date(2026, 0, 5))).toBe('my-app-data-2026-01-05.json');
  });
});

describe('safeNext', () => {
  it('allows only paths on this site', () => {
    expect(safeNext('/account?tab=1')).toBe('/account?tab=1');
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it('refuses what the URL parser turns into another site', () => {
    // Tabs and newlines are dropped by the parser, `\` is read as `/`.
    expect(safeNext('/\t/evil.example')).toBeNull();
    expect(safeNext('/\n/evil.example')).toBeNull();
    expect(safeNext('/\r\n/evil.example')).toBeNull();
    expect(safeNext('\\/evil.example')).toBeNull();
    expect(safeNext('/\\/evil.example')).toBeNull();
    expect(safeNext('/./\t/evil.example')).toBeNull();
    expect(safeNext('/.//evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
  });

  it('keeps encoded characters as part of the path', () => {
    expect(safeNext('/%2F%2Fevil.example')).toBe('/%2F%2Fevil.example');
    expect(safeNext('/%5Cevil.example')).toBe('/%5Cevil.example');
    expect(safeNext('/%09/evil.example')).toBe('/%09/evil.example');
    expect(safeNext('/invite?token=a%26b#x')).toBe('/invite?token=a%26b#x');
  });
});

describe('mailtoHref', () => {
  it('links to the one address, and nothing more', () => {
    expect(mailtoHref('ada@example.com')).toBe('mailto:ada@example.com');
    expect(mailtoHref('a@b.c?cc=x@evil.test&body=hi')).toBe('mailto:a@b.c%3Fcc%3Dx@evil.test%26body%3Dhi');
    expect(mailtoHref('a@b.c\nBcc: x@evil.test')).not.toMatch(/[\n ?&]/);
  });
});
