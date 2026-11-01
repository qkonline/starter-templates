// The themes this app offers (Account → Display), each a CSS file beside this one that
// src/app.css imports. To add one: make a CSS file under `[data-theme='<id>']` that overrides
// the tokens of fusion.css it changes, import it in
// src/app.css, list it here and in the inline script in src/app.html (a test checks all three
// agree). With a single theme listed, Account → Display shows no choice of theme.

export interface ThemeInfo {
  id: string;
  label: string;
}

export const themes = [{ id: 'fusion', label: 'Fusion' }] as const satisfies readonly ThemeInfo[];

export type Theme = (typeof themes)[number]['id'];

/** The theme a device has until the person picks another; `data-theme` on <html> in src/app.html. */
export const defaultTheme: Theme = 'fusion';

export const isTheme = (v: unknown): v is Theme => themes.some((t) => t.id === v);
