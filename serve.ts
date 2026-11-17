// Pulse — a tiny local static server for testing the dashboard.
//
// Serves the built output in out/ on http://localhost:8080 (or --port <n>).
// Run main.ts first so out/ exists. No build step, no network: it only reads
// files under out/.
//   node serve.ts [--port 8080]

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'out');
const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) || 8080 : 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const raw = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const rel = normalize(raw).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '');
  let path = join(root, rel === '' ? 'dashboard' : rel);
  if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) path = join(path, 'index.html');
  if (!resolve(path).startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found\n');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});

server.listen(port, () => {
  process.stdout.write(`pulse radar: serving ${root} on http://localhost:${port}/\n`);
});
