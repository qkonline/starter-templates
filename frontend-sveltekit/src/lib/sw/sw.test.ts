import { describe, expect, it, vi } from 'vitest';
import { openUrl, readPush } from './push';
import { precacheList, respond } from './respond';

const ORIGIN = 'https://app.test';

function fakeCache() {
  const store = new Map<string, Response>();
  const key = (i: RequestInfo | URL) =>
    new URL(typeof i === 'string' ? i : i instanceof URL ? i : i.url, ORIGIN).pathname;
  return {
    store,
    match: vi.fn(async (i: RequestInfo | URL) => store.get(key(i))?.clone()),
    put: vi.fn(async (i: RequestInfo | URL, r: Response) => void store.set(key(i), r)),
  };
}
const nav = (path: string) => new Request(`${ORIGIN}${path}`, { headers: { accept: 'text/html' } });
const down = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};

describe('the service worker', () => {
  it('precaches the app, the static files and the pages, but not the host’s files', () => {
    expect(
      precacheList(
        '/',
        [{ path: '_app/a.js' }],
        [{ path: 'favicon.svg' }, { path: '_headers' }],
        [{ path: '' }, { path: 'account' }],
      ),
    ).toEqual(['/_app/a.js', '/favicon.svg', '/', '/account']);
  });

  it('serves a precached page from the cache, whatever its query', async () => {
    const cache = fakeCache();
    cache.store.set('/team', new Response('team shell'));
    const fetch = vi.fn();
    const res = await respond(nav('/team?id=t1'), {
      cache,
      fetch,
      precached: new Set(['/team']),
      offlinePath: '/offline',
    });
    expect(await res.text()).toBe('team shell');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the offline page for an unknown page with no network', async () => {
    const cache = fakeCache();
    cache.store.set('/offline', new Response('offline'));
    const res = await respond(nav('/nowhere'), {
      cache,
      fetch: down,
      precached: new Set(),
      offlinePath: '/offline',
    });
    expect(await res.text()).toBe('offline');
  });

  it('keeps good answers and still answers when storing fails', async () => {
    const cache = fakeCache();
    cache.put.mockRejectedValueOnce(new Error('quota'));
    const fetch = vi.fn(async () => new Response('fresh'));
    const res = await respond(nav('/robots.txt'), {
      cache,
      fetch,
      precached: new Set(),
      offlinePath: '/offline',
    });
    expect(await res.text()).toBe('fresh');
  });

  it('reads a push and opens only this site’s pages', () => {
    expect(readPush('{"title":"Hi","body":"B","url":"/team?id=1"}', 'App')).toEqual({
      title: 'Hi',
      body: 'B',
      url: '/team?id=1',
    });
    expect(readPush(null, 'App').title).toBe('App');
    expect(readPush('plain text', 'App')).toEqual({ title: 'App', body: 'plain text', url: null });
    expect(openUrl('/team?id=1', ORIGIN, '/app')).toBe(`${ORIGIN}/team?id=1`);
    expect(openUrl('https://evil.test/', ORIGIN, '/app')).toBe(`${ORIGIN}/app`);
    expect(openUrl('//evil.test', ORIGIN, '/app')).toBe(`${ORIGIN}/app`);
  });

  it('opens only this site, however the address is disguised', () => {
    for (const url of [
      '/\t/evil.test',
      '/\n/evil.test',
      '/\\evil.test',
      '\\\\evil.test',
      '/.//evil.test',
      'javascript:alert(1)',
    ])
      expect(openUrl(url, ORIGIN, '/app')).toBe(`${ORIGIN}/app`);
    expect(openUrl('/%2F%2Fevil.test', ORIGIN, '/app')).toBe(`${ORIGIN}/%2F%2Fevil.test`);
    expect(openUrl(`${ORIGIN}/team?id=1`, ORIGIN, '/app')).toBe(`${ORIGIN}/team?id=1`);
  });
});
