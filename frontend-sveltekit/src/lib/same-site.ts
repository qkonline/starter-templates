// Is an address a page on this site? Used for `?next=`, notification links and pushes, which
// all come from outside the code (the address bar, the backend, a push payload).
//
// The address is resolved the way the browser will resolve it, with `new URL`, rather than
// checked by its first characters: the URL parser drops tabs and newlines and reads `\` as `/`,
// so `/\t/evil.example` and `/\evil.example` both lead to evil.example. No imports, so the
// service worker can use it too.

/**
 * `url` as a path on `origin` (path, query and hash), or null when it would lead anywhere else.
 * `origin` only anchors relative addresses; any origin of the right form works.
 */
export function sameSitePath(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  let base: URL;
  let resolved: URL;
  try {
    base = new URL(origin);
    resolved = new URL(url, base);
  } catch {
    return null;
  }
  if (resolved.origin !== base.origin) return null;
  const path = resolved.pathname + resolved.search + resolved.hash;
  // A path that itself starts with `//` would be read as another host where it's used next.
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}
