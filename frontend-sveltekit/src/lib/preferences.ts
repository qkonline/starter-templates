// Display preferences (PRD R3.2): theme, mode (light, dark or the device's) and text size, per
// device, in localStorage. The inline script in src/app.html applies them before the first
// paint, so it must read the same keys and values as this file; after that, this file changes
// them. The themes themselves are in src/lib/themes/.

import { defaultTheme, isTheme, type Theme } from './themes/index.ts';

export type Mode = 'system' | 'light' | 'dark';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';

export interface Preferences {
  theme: Theme;
  mode: Mode;
  text: TextSize;
}

export const THEME_KEY = 'starter:theme';
export const MODE_KEY = 'starter:mode';
export const TEXT_KEY = 'starter:text';

export const modes: readonly { value: Mode; label: string }[] = [
  { value: 'system', label: 'Device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const textSizes: readonly { value: TextSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Normal' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Larger' },
];

export const defaults: Preferences = { theme: defaultTheme, mode: 'system', text: 'md' };

const isMode = (v: unknown): v is Mode => v === 'system' || v === 'light' || v === 'dark';
const isText = (v: unknown): v is TextSize => v === 'sm' || v === 'md' || v === 'lg' || v === 'xl';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function local(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** What this device chose; anything unknown or unreadable (a theme since removed) is the default. */
export function readPreferences(store: Store | null = local()): Preferences {
  try {
    const theme = store?.getItem(THEME_KEY);
    const mode = store?.getItem(MODE_KEY);
    const text = store?.getItem(TEXT_KEY);
    return {
      theme: isTheme(theme) ? theme : defaults.theme,
      mode: isMode(mode) ? mode : defaults.mode,
      text: isText(text) ? text : defaults.text,
    };
  } catch {
    return { ...defaults };
  }
}

/** Keep the choice; the defaults are stored as nothing, so a new default reaches everyone who never chose. */
export function savePreferences(prefs: Preferences, store: Store | null = local()): void {
  const keep = (key: string, value: string, fallback: string) => {
    if (value === fallback) store?.removeItem(key);
    else store?.setItem(key, value);
  };
  try {
    keep(THEME_KEY, prefs.theme, defaults.theme);
    keep(MODE_KEY, prefs.mode, defaults.mode);
    keep(TEXT_KEY, prefs.text, defaults.text);
  } catch {
    /* Storage blocked: the choice lasts until the page closes. */
  }
}

type Root = Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>;

/**
 * Show the choice on the page: `data-theme`, `data-mode` and `data-text` on <html>, read by
 * src/app.css and the theme files. `data-theme` is always there (src/app.html starts it at the
 * default), so a theme can be previewed inside another by putting it on any element.
 */
export function applyPreferences(
  prefs: Preferences,
  root: Root | null = globalThis.document?.documentElement ?? null,
): void {
  if (!root) return;
  root.setAttribute('data-theme', prefs.theme);
  if (prefs.mode === 'system') root.removeAttribute('data-mode');
  else root.setAttribute('data-mode', prefs.mode);
  if (prefs.text === 'md') root.removeAttribute('data-text');
  else root.setAttribute('data-text', prefs.text);
  syncThemeColor();
}

/** Choose, keep and show at once. */
export function setPreferences(prefs: Preferences): void {
  savePreferences(prefs);
  applyPreferences(prefs);
}

/**
 * The browser's own bar (and an installed app's title bar) in the page's background colour.
 * src/app.html starts with Fusion's colours for light and dark; this sets the one in use.
 */
export function syncThemeColor(doc: Document | undefined = globalThis.document): void {
  if (!doc?.body) return;
  const colour = getComputedStyle(doc.body).backgroundColor;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', colour);
}

/** Keep the bar's colour right when the device switches between light and dark. Returns a stop. */
export function followThemeColor(): () => void {
  const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  syncThemeColor();
  const sync = () => syncThemeColor();
  query?.addEventListener('change', sync);
  return () => query?.removeEventListener('change', sync);
}
