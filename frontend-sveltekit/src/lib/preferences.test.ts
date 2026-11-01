import { describe, expect, it } from 'vitest';
import appHtml from '../app.html?raw';
import {
  applyPreferences,
  MODE_KEY,
  readPreferences,
  savePreferences,
  TEXT_KEY,
  THEME_KEY,
} from './preferences';

const memory = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

const root = () => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
};

describe('display preferences', () => {
  it('defaults to the default theme, the device mode and normal text', () => {
    expect(readPreferences(memory())).toEqual({ theme: 'fusion', mode: 'system', text: 'md' });
    expect(readPreferences(null)).toEqual({ theme: 'fusion', mode: 'system', text: 'md' });
  });

  it('ignores values it does not know, such as a theme since removed', () => {
    const store = memory();
    store.setItem(THEME_KEY, 'purple');
    store.setItem(MODE_KEY, 'dim');
    store.setItem(TEXT_KEY, 'huge');
    expect(readPreferences(store)).toEqual({ theme: 'fusion', mode: 'system', text: 'md' });
  });

  it('keeps a choice and stores the defaults as nothing', () => {
    const store = memory();
    savePreferences({ theme: 'fusion', mode: 'dark', text: 'lg' }, store);
    expect(store.map.has(THEME_KEY)).toBe(false);
    expect(store.map.get(MODE_KEY)).toBe('dark');
    expect(readPreferences(store)).toEqual({ theme: 'fusion', mode: 'dark', text: 'lg' });
    savePreferences({ theme: 'fusion', mode: 'system', text: 'md' }, store);
    expect(store.map.size).toBe(0);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readPreferences(broken)).toEqual({ theme: 'fusion', mode: 'system', text: 'md' });
    expect(() => savePreferences({ theme: 'fusion', mode: 'dark', text: 'xl' }, broken)).not.toThrow();
  });

  it('shows the choice as attributes on <html>, the theme always', () => {
    const r = root();
    applyPreferences({ theme: 'fusion', mode: 'light', text: 'xl' }, r);
    expect(Object.fromEntries(r.attrs)).toEqual({
      'data-theme': 'fusion',
      'data-mode': 'light',
      'data-text': 'xl',
    });
    applyPreferences({ theme: 'fusion', mode: 'system', text: 'md' }, r);
    expect(Object.fromEntries(r.attrs)).toEqual({ 'data-theme': 'fusion' });
  });

  it('uses the same keys and values as the script in app.html', () => {
    const html = appHtml;
    for (const key of [THEME_KEY, MODE_KEY, TEXT_KEY]) expect(html).toContain(`'${key}'`);
    for (const v of ["'light'", "'dark'", "'sm'", "'lg'", "'xl'"]) expect(html).toContain(v);
  });
});
