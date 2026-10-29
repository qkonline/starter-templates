// One thing a person does (a form submission, a button): whether it's running, and what went
// wrong in words to show. Refusals show the backend's own message (PRD R3.1); `rate_limited`
// also holds the button back for the seconds the backend asked.

import { ApiError, cancelled, messageOf } from '#lib/api/errors.ts';

export class Task {
  busy = $state(false);
  error = $state('');
  /** The contract code of the last error, to act on. */
  code = $state<string | null>(null);
  /** Seconds left before trying again is allowed. */
  wait = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  get blocked(): boolean {
    return this.busy || this.wait > 0;
  }

  /** Run `work`; true when it finished without an error. */
  async run(work: () => Promise<unknown>): Promise<boolean> {
    if (this.blocked) return false;
    this.busy = true;
    this.error = '';
    this.code = null;
    try {
      await work();
      return true;
    } catch (e) {
      // A closed passkey prompt is the person's choice, not an error.
      if (cancelled(e)) return false;
      this.error = messageOf(e);
      if (e instanceof ApiError) {
        this.code = e.code;
        if (e.code === 'rate_limited' && e.retryAfter) this.hold(e.retryAfter);
      }
      return false;
    } finally {
      this.busy = false;
    }
  }

  clear(): void {
    this.error = '';
    this.code = null;
  }

  private hold(seconds: number): void {
    if (this.timer) clearInterval(this.timer);
    this.wait = Math.min(seconds, 3600);
    this.timer = setInterval(() => {
      this.wait = Math.max(0, this.wait - 1);
      if (this.wait === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 1000);
  }
}
