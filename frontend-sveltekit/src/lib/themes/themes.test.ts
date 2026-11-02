import { describe, expect, it } from 'vitest';
import appCss from '../../app.css?raw';
import appHtml from '../../app.html?raw';
import { defaultTheme, themes } from './index.ts';

// Each theme's file, by its name: daisy.css → 'daisy'.
const files: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true })).map(
    ([path, css]) => [path.slice(2, -4), css],
  ),
);

const ids = themes.map((t) => t.id);
const file = (id: string) => files[id] ?? '';
const tokens = (css: string) => new Set(css.match(/--[a-z0-9-]+(?=:)/g));

// What DaisyUI's components read from a theme (https://daisyui.com/docs/themes/).
const daisyVariables = [
  ...['base-100', 'base-200', 'base-300', 'base-content'],
  ...['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'].flatMap((c) => [
    c,
    `${c}-content`,
  ]),
].map((c) => `--color-${c}`);
const shape = [
  '--radius-selector',
  '--radius-field',
  '--radius-box',
  '--size-selector',
  '--size-field',
  '--border',
];

describe('themes', () => {
  it('have a file each, which app.css imports', () => {
    expect(Object.keys(files).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(appCss).toContain(`@import './lib/themes/${id}.css';`);
  });

  it('style only what carries their own id', () => {
    for (const id of ids) {
      const selectors = file(id).match(/^\s*[:[][^{]*(?=\{)/gm) ?? [];
      expect(selectors.length, `${id}.css`).toBeGreaterThan(0);
      for (const s of selectors.join(',').split(',')) {
        expect(s.trim(), `${id}.css`).toMatch(
          new RegExp(`^${id === 'daisy' ? `(:root|\\[data-theme='daisy'\\])` : `\\[data-theme='${id}'\\]`}$`),
        );
      }
    }
  });

  it('are the ones the script in app.html knows, with the default on <html>', () => {
    const list = appHtml.match(/var themes = \[([^\]]*)\]/)?.[1];
    expect(list?.split(',').map((s) => s.trim().slice(1, -1))).toEqual(ids);
    expect(appHtml).toContain(`<html lang="en" data-theme="${defaultTheme}">`);
  });

  it('Daisy sets everything DaisyUI reads, in both modes', () => {
    const daisy = file('daisy');
    for (const v of [...daisyVariables, ...shape]) expect(tokens(daisy), v).toContain(v);
    for (const v of daisyVariables) expect(daisy).toMatch(new RegExp(`${v}: light-dark\\(`));
  });

  it('set only variables Daisy defines, so a typo cannot pass unnoticed', () => {
    const known = tokens(file('daisy'));
    for (const id of ids) for (const t of tokens(file(id))) expect(known, `${t} in ${id}.css`).toContain(t);
  });
});
