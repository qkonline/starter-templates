// Errors SvelteKit catches itself (in a load or while navigating) never reach `window`, so they
// are reported here; uncaught ones are reported by the root layout (#lib/report.ts). Only
// errors from our own code: SvelteKit's 404s and `error()` calls are the app working as meant.
import type { HandleClientError } from '@sveltejs/kit/hooks';
import { reportError } from '#lib/report.ts';

export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind === 'unknown') reportError(error);
};
