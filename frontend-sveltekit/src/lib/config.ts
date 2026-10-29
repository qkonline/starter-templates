// What an app built from this template changes first.

/** Shown in the header, page titles and file names. */
export const appName = 'Starter';

/**
 * Where a person lands after signing in, unless they were on their way somewhere else. A path
 * as `resolve()` from `$app/paths` takes it: no leading slash. (Typed by its value rather than
 * `Path` so the service worker, which has no route types, can import this file.)
 */
export const homePath = 'app' as const;
