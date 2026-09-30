// GET /api/sessions and /api/today, as connect-style middleware for Vite and
// the standalone server.

import { scanSessions } from './scanner.js';
import { scanToday } from './today.js';

// Coalesces concurrent requests (several open tabs) into one scan, and reuses
// a result for `maxAge` ms.
function cached(scan, maxAge) {
  let inflight = null;
  let last = null;
  return async () => {
    if (last && Date.now() - last.now < maxAge) return last;
    inflight ||= scan().finally(() => { inflight = null; });
    last = await inflight;
    return last;
  };
}

const routes = {
  '/api/sessions': cached(scanSessions, 800),
  '/api/today': cached(scanToday, 4000),
};

export function apiMiddleware() {
  return async (req, res, next) => {
    const route = routes[req.url?.split('?')[0]];
    if (!route) return next?.();
    try {
      const body = JSON.stringify(await route());
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  };
}
