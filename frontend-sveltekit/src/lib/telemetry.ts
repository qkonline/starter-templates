// Error tracking without a third party (PRD R7.2): uncaught errors and unhandled rejections go
// to the backend's `/telemetry/errors` with the build version. Deduplicated here (the same
// message and first stack line is sent once per page life), held to a few a minute, and never
// throws: reporting must not cause more errors.

export interface ErrorReportBody {
  message: string;
  stack?: string;
  url?: string;
  release?: string;
}

export interface ReporterOptions {
  /** Send one report. May fail; failures are ignored. */
  send: (report: ErrorReportBody) => Promise<unknown> | void;
  release: string;
  /** The page's address, scrubbed of codes and tokens. */
  url: () => string;
  now?: () => number;
  /** At most this many reports a minute… */
  perMinute?: number;
  /** …and this many in one page life. */
  total?: number;
  /** Errors that aren't bugs (a refusal from the backend, being offline). */
  ignore?: (error: unknown) => boolean;
}

/** Noise that says nothing about the app: browser extensions, cross-origin scripts, resize loops. */
const ignored = [/^Script error\.?$/i, /ResizeObserver loop/i, /^Load failed$/i, /extension:\/\//i];

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + '…' : text);

/** Turn whatever was thrown into a message and a stack. */
export function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

/** What makes two reports the same: the message and the first line of the stack below it. */
export function fingerprint(report: { message: string; stack?: string }): string {
  const frame =
    report.stack
      ?.split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.includes(report.message)) ?? '';
  return `${report.message}\n${frame}`;
}

export function createReporter(options: ReporterOptions) {
  const now = options.now ?? Date.now;
  const perMinute = options.perMinute ?? 5;
  const total = options.total ?? 30;
  const seen = new Set<string>();
  let sent = 0;
  let window: number[] = [];

  /** Report one error. Returns whether it was sent. Never throws. */
  function report(error: unknown): boolean {
    try {
      if (options.ignore?.(error)) return false;
      const { message, stack } = describe(error);
      if (!message || ignored.some((re) => re.test(message) || (stack ? re.test(stack) : false)))
        return false;
      const key = fingerprint({ message, stack });
      if (seen.has(key)) return false;
      const t = now();
      window = window.filter((at) => t - at < 60_000);
      if (window.length >= perMinute || sent >= total) return false;
      seen.add(key);
      window.push(t);
      sent++;
      const body: ErrorReportBody = {
        message: clip(message, 1000),
        ...(stack ? { stack: clip(stack, 8000) } : {}),
        url: clip(options.url(), 1000),
        release: clip(options.release, 100),
      };
      Promise.resolve()
        .then(() => options.send(body))
        .catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  return { report };
}

export type Reporter = ReturnType<typeof createReporter>;

/** Report the page's uncaught errors and unhandled rejections. Returns a function that stops. */
export function listen(reporter: Reporter, target: Window = globalThis.window): () => void {
  const onError = (e: ErrorEvent) => reporter.report(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reporter.report(e.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
