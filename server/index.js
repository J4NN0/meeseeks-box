// Standalone server for the built app: serves dist/ and the session API.
// Binds to localhost only, since the API exposes your transcripts and can
// prompt your agents (api.js also checks requests come from our own page).

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMiddleware } from './api.js';
import { envNumber } from './util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = envNumber('PORT', 5199);
const host = process.env.HOST || '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const api = apiMiddleware();

// Only answer to our own hostnames, so a DNS-rebinding page can't read the API.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `${host}:${port}`]);

async function serveStatic(req, res) {
  let file;
  try {
    file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    if ((await fsp.stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(root, 'index.html');
  }
  try {
    const body = await fsp.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Run `npm run build` first.');
  }
}

http
  .createServer((req, res) => {
    if (!allowedHosts.has(req.headers.host)) { res.writeHead(403).end(); return; }
    api(req, res, () => serveStatic(req, res));
  })
  .listen(port, host, () => console.log(`🟦 Meeseeks Box running at http://${host}:${port}`));
