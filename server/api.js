// GET /api/sessions, as connect-style middleware for Vite and the standalone server.

import { scanSessions } from './scanner.js';

// Coalesces concurrent requests (several open tabs) into one scan.
let inflight = null;
let lastResult = null;
async function getSessions() {
  if (lastResult && Date.now() - lastResult.now < 800) return lastResult;
  inflight ||= scanSessions().finally(() => { inflight = null; });
  lastResult = await inflight;
  return lastResult;
}

export function apiMiddleware() {
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/sessions') return next?.();
    try {
      const body = JSON.stringify(await getSessions());
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  };
}
