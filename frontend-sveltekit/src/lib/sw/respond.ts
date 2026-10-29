// The service worker's answers, kept free of worker globals so the tests use a Map-backed cache
// and a stubbed fetch (adapted from high-yield-prep's exam app).
//
// What was precached at install (the built app, static files, prerendered pages) comes from the
// cache first: the whole app is one version until the person taps "Reload". Anything else on
// this origin goes to the network, with good answers kept for offline. With no network, a page
// falls back to its cached copy, then to the prerendered offline page.

export interface RespondDeps {
  cache: Pick<Cache, 'match' | 'put'>;
  fetch: (request: Request) => Promise<Response>;
  /** Pathnames precached at install. */
  precached: ReadonlySet<string>;
  /** Pathname of the prerendered offline page. */
  offlinePath: string;
}

export function isNavigation(request: Request): boolean {
  if (request.mode === 'navigate') return true;
  return (request.headers.get('accept') ?? '').includes('text/html');
}

/** The pathnames to precache, from `$app/manifest`'s paths (relative to the base path). */
export function precacheList(base: string, ...groups: { path: string }[][]): string[] {
  const root = base.replace(/\/$/, '');
  const paths = groups.flat().map(({ path }) => `${root}/${path.replace(/^\//, '')}`);
  // Files a host reads rather than serves.
  return [...new Set(paths)].filter((p) => !/\/_(headers|redirects)$/.test(p));
}

export async function respond(request: Request, deps: RespondDeps): Promise<Response> {
  const { cache } = deps;
  const url = new URL(request.url);

  if (deps.precached.has(url.pathname)) {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
  }

  let response: Response;
  try {
    response = await deps.fetch(request);
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigation(request)) {
      const offline = await cache.match(deps.offlinePath);
      if (offline) return offline;
    }
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }

  // Outside the try above: a failed write (storage full) isn't a failed request.
  if (response.ok && (response.type === 'basic' || response.type === 'default')) {
    try {
      await cache.put(request, response.clone());
    } catch {
      /* Keeping a copy is an extra; the answer is already in hand. */
    }
  }
  return response;
}
