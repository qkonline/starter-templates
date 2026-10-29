import { describe, expect, it } from 'vitest';
import appHtml from '../app.html?raw';
import { applyPreferences, readPreferences, savePreferences, TEXT_KEY, THEME_KEY } from './preferences';

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
  it('defaults to the device theme and normal text', () => {
    expect(readPreferences(memory())).toEqual({ theme: 'system', text: 'md' });
    expect(readPreferences(null)).toEqual({ theme: 'system', text: 'md' });
  });

  it('ignores values it does not know', () => {
    const store = memory();
    store.setItem(THEME_KEY, 'purple');
    store.setItem(TEXT_KEY, 'huge');
    expect(readPreferences(store)).toEqual({ theme: 'system', text: 'md' });
  });

  it('keeps a choice and stores the defaults as nothing', () => {
    const store = memory();
    savePreferences({ theme: 'dark', text: 'lg' }, store);
    expect(store.map.get(THEME_KEY)).toBe('dark');
    expect(readPreferences(store)).toEqual({ theme: 'dark', text: 'lg' });
    savePreferences({ theme: 'system', text: 'md' }, store);
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
    expect(readPreferences(broken)).toEqual({ theme: 'system', text: 'md' });
    expect(() => savePreferences({ theme: 'dark', text: 'xl' }, broken)).not.toThrow();
  });

  it('shows the choice as attributes on <html>', () => {
    const r = root();
    applyPreferences({ theme: 'light', text: 'xl' }, r);
    expect(Object.fromEntries(r.attrs)).toEqual({ 'data-theme': 'light', 'data-text': 'xl' });
    applyPreferences({ theme: 'system', text: 'md' }, r);
    expect(r.attrs.size).toBe(0);
  });

  it('uses the same keys and values as the script in app.html', () => {
    const html = appHtml;
    expect(html).toContain(`'${THEME_KEY}'`);
    expect(html).toContain(`'${TEXT_KEY}'`);
    for (const v of ["'light'", "'dark'", "'sm'", "'lg'", "'xl'"]) expect(html).toContain(v);
  });
});
