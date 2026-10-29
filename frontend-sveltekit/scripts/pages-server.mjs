// Serves build/ the way Cloudflare Pages does, for the e2e tests and for trying a build locally:
// `/account` from account.html, `/account.html` redirected to `/account`, `_headers` applied
// (splats, and `! Name` to detach), 404.html with status 404 for anything that isn't a file.
// Not a production server. `npm run serve` (port 4180, or PORT / HOST).

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve('build');
const port = Number(process.env.PORT ?? 4180);
const host = process.env.HOST ?? 'localhost';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** `_headers` as [pattern, [[name, value | null]]], null meaning detach. */
function readRules() {
  const file = join(root, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(
        '^' +
          line
            .trim()
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/:\w+/g, '[^/]+') +
          '$',
      );
      rules.push([pattern, []]);
    } else if (rules.length) {
      const t = line.trim();
      if (t.startsWith('!')) rules.at(-1)[1].push([t.slice(1).trim().toLowerCase(), null]);
      else {
        const i = t.indexOf(':');
        rules.at(-1)[1].push([t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]);
      }
    }
  }
  return rules;
}

function headersFor(path) {
  const out = new Map();
  for (const [pattern, entries] of readRules()) {
    if (!pattern.test(path)) continue;
    for (const [name, value] of entries) {
      if (value === null) out.delete(name);
      else out.set(name, out.has(name) ? `${out.get(name)}, ${value}` : value);
    }
  }
  return out;
}

/** The file for `path` inside build/, or null; never anything outside it (`/../`, `%2e%2e`). */
function file(path) {
  const full = resolve(root, `.${sep}${path}`);
  if (!full.startsWith(root + sep)) return null;
  try {
    return statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    // A broken escape such as `/%E0%A4%A` names no file; say so rather than crash.
    res.writeHead(400).end('Bad request');
    return;
  }
  if (path.endsWith('.html')) {
    const clean = path.replace(/(index)?\.html$/, '');
    res.writeHead(308, { location: clean + url.search }).end();
    return;
  }
  let status = 200;
  let found =
    (path !== '/' && file(path)) || file(path.replace(/\/$/, '') + '.html') || file(join(path, 'index.html'));
  if (!found || /\/_(headers|redirects)$/.test(path)) {
    status = 404;
    found = file('404.html');
  }
  if (!found) {
    res.writeHead(404).end('Not found');
    return;
  }
  const headers = Object.fromEntries(headersFor(path));
  headers['content-type'] ??= types[extname(found)] ?? 'application/octet-stream';
  res.writeHead(status, headers);
  if (req.method === 'HEAD') res.end();
  else createReadStream(found).pipe(res);
}).listen(port, host, () => console.log(`Serving build/ like Cloudflare Pages at http://${host}:${port}`));
