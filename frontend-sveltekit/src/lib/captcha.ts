// Cloudflare Turnstile, loaded only when /auth/methods names it. Explicit rendering, so a widget
// appears exactly where a form puts <Captcha>, and the script loads once per page life.

export interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: (code?: string) => void;
  'timeout-callback'?: () => void;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'flexible' | 'compact';
  action?: string;
  language?: string;
}

export interface Turnstile {
  render(el: HTMLElement | string, options: TurnstileOptions): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
  getResponse(widgetId?: string): string | undefined;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<Turnstile> | null = null;

export function loadTurnstile(): Promise<Turnstile> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser.'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('The security check didn’t load.'));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('The security check didn’t load. Check your connection, then reload the page.'));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Hands out one token per submission: a token works once, so after one is taken the widget is
 * reset and makes the next. Waits when none is ready yet.
 */
export class TokenQueue {
  private current: string | null = null;
  private waiting: { resolve: (t: string) => void; reject: (e: Error) => void }[] = [];
  private failed: Error | null = null;

  constructor(private readonly reset: () => void) {}

  /** The widget produced a token. */
  give(token: string): void {
    this.failed = null;
    const next = this.waiting.shift();
    if (next) {
      next.resolve(token);
      this.reset();
    } else this.current = token;
  }

  /** The token ran out before it was used. */
  expire(): void {
    this.current = null;
  }

  /** The widget couldn't make a token. */
  fail(error: Error): void {
    this.current = null;
    this.failed = error;
    for (const w of this.waiting.splice(0)) w.reject(error);
  }

  /** A fresh token, used once. */
  take(timeoutMs = 60_000): Promise<string> {
    if (this.current) {
      const token = this.current;
      this.current = null;
      this.reset();
      return Promise.resolve(token);
    }
    if (this.failed) {
      const error = this.failed;
      this.failed = null;
      this.reset();
      return Promise.reject(error);
    }
    return new Promise<string>((resolve, reject) => {
      const entry = {
        resolve: (t: string) => {
          clearTimeout(timer);
          resolve(t);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      const timer = setTimeout(() => {
        this.waiting = this.waiting.filter((w) => w !== entry);
        reject(new Error('The security check is taking too long. Try again.'));
      }, timeoutMs);
      this.waiting.push(entry);
    });
  }
}
