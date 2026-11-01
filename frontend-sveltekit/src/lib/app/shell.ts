// THE APP'S OWN FILE: what it adds to the shell the core draws. The core reads this and never
// changes it, so a later release of the template merges without touching it.

/** Links in the signed-in header, after Home. `match: 'prefix'` marks it current on its sub-pages too. */
export const appNav: { label: string; path: string; match?: 'exact' | 'prefix' }[] = [
  // { label: 'Appointments', path: 'appointments', match: 'prefix' },
];

/**
 * The app's own pages that check a stale session themselves (like /signin): a `signed_out`
 * reply there doesn't send the person to sign in. Most app pages are behind sign-in and need
 * nothing here.
 */
export const appPublicPaths: string[] = [];

/**
 * localStorage keys that are settings of the device, not the person (kept when someone else
 * signs in), beside the core's theme, mode and text size.
 */
export const appDeviceKeys: string[] = [];
