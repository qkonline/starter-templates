// The app's error reporter (#lib/telemetry.ts), sending to the backend this build points at.
// The root layout starts it; call `reportError(e)` for an error caught but still worth knowing.

import { version } from '$app/env';
import { PUBLIC_API_URL } from '$app/env/public';
import { ApiError } from '#lib/api/errors.ts';
import { scrubUrl } from '#lib/analytics/index.ts';
import { readToken } from '#lib/device.ts';
import { createReporter, listen } from '#lib/telemetry.ts';

const reporter = createReporter({
  release: version,
  url: () => scrubUrl(location.href),
  // A refusal or no connection is the app working as meant, not a bug.
  ignore: (e) => e instanceof ApiError && (e.status === 0 || e.status < 500),
  send: (body) => {
    const token = readToken();
    // Raw fetch rather than the API client: a failure here must not reach the sign-out hooks.
    return fetch(`${PUBLIC_API_URL}/telemetry/errors`, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  },
});

export const reportError = (error: unknown): void => void reporter.report(error);

/** Listen for uncaught errors; returns a function that stops. */
export const startErrorReporting = (): (() => void) => listen(reporter);
