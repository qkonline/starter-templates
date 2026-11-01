import { describe, expect, it } from 'vitest';
import appCss from '../../app.css?raw';
import appHtml from '../../app.html?raw';
import { defaultTheme, themes } from './index.ts';

// Each theme's file, by its name: fusion.css → 'fusion'.
const files: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true })).map(
    ([path, css]) => [path.slice(2, -4), css],
  ),
);

const ids = themes.map((t) => t.id);
const file = (id: string) => files[id] ?? '';

describe('themes', () => {
  it('have a file each, which app.css imports', () => {
    expect(Object.keys(files).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(appCss).toContain(`@import './lib/themes/${id}.css';`);
  });

  it('style only what carries their own id', () => {
    for (const id of ids) {
      const selectors = file(id).match(/^[^\s/*@}][^{]*(?=\{)/gm) ?? [];
      for (const s of selectors.join(',').split(',')) {
        expect(s.trim(), `${id}.css`).toMatch(
          new RegExp(
            `^${id === 'fusion' ? `(:root|\\[data-theme='fusion'\\])` : `\\[data-theme='${id}'\\]`}`,
          ),
        );
      }
    }
  });

  it('are the ones the script in app.html knows, with the default on <html>', () => {
    const list = appHtml.match(/var themes = \[([^\]]*)\]/)?.[1];
    expect(list?.split(',').map((s) => s.trim().slice(1, -1))).toEqual(ids);
    expect(appHtml).toContain(`<html lang="en" data-theme="${defaultTheme}">`);
  });

  it('set only tokens Fusion defines, so a typo cannot pass unnoticed', () => {
    const tokens = (css: string) => new Set(css.match(/--[a-z0-9-]+(?=:)/g));
    const known = tokens(file('fusion'));
    for (const id of ids) for (const t of tokens(file(id))) expect(known, `${t} in ${id}.css`).toContain(t);
  });
});
