// Display preferences (PRD R3.2): theme and text size, per device, in localStorage. The inline
// script in src/app.html applies them before the first paint, so it must read the same keys
// and values as this file; after that, this file changes them.

export type Theme = 'system' | 'light' | 'dark';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';

export interface Preferences {
  theme: Theme;
  text: TextSize;
}

export const THEME_KEY = 'starter:theme';
export const TEXT_KEY = 'starter:text';

export const themes: readonly { value: Theme; label: string }[] = [
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

export const defaults: Preferences = { theme: 'system', text: 'md' };

const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'light' || v === 'dark';
const isText = (v: unknown): v is TextSize => v === 'sm' || v === 'md' || v === 'lg' || v === 'xl';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function local(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** What this device chose; anything unknown or unreadable is the default. */
export function readPreferences(store: Store | null = local()): Preferences {
  try {
    const theme = store?.getItem(THEME_KEY);
    const text = store?.getItem(TEXT_KEY);
    return { theme: isTheme(theme) ? theme : defaults.theme, text: isText(text) ? text : defaults.text };
  } catch {
    return { ...defaults };
  }
}

/** Keep the choice; the defaults are stored as nothing, so the device's own setting rules. */
export function savePreferences(prefs: Preferences, store: Store | null = local()): void {
  try {
    if (prefs.theme === defaults.theme) store?.removeItem(THEME_KEY);
    else store?.setItem(THEME_KEY, prefs.theme);
    if (prefs.text === defaults.text) store?.removeItem(TEXT_KEY);
    else store?.setItem(TEXT_KEY, prefs.text);
  } catch {
    /* Storage blocked: the choice lasts until the page closes. */
  }
}

type Root = Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>;

/** Show the choice on the page: `data-theme` and `data-text` on <html>, read by src/app.css. */
export function applyPreferences(
  prefs: Preferences,
  root: Root | null = globalThis.document?.documentElement ?? null,
): void {
  if (!root) return;
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  if (prefs.text === 'md') root.removeAttribute('data-text');
  else root.setAttribute('data-text', prefs.text);
}

/** Choose, keep and show at once. */
export function setPreferences(prefs: Preferences): void {
  savePreferences(prefs);
  applyPreferences(prefs);
}
