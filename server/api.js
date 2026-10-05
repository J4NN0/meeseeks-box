// The box's API, as connect-style middleware for Vite and the standalone
// server. GET /api/sessions, /api/today and /api/chat read; POST /api/talk and
// /api/permission talk to a session through its channel (channel/client.js).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, talk } from './channel/client.js';
import { scanSessions } from './scanner.js';
import { scanToday } from './today.js';

const LAUNCHER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'claude-box');
const MAX_BODY = 64 * 1024;

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

const sessions = cached(scanSessions, 800);

const reads = {
  '/api/sessions': async () => {
    const { now, sessions: list } = await sessions();
    return { now, sessions: list };
  },
  '/api/today': cached(scanToday, 4000),
  // The panel's conversation with one session; `launcher` is how to start one you can talk to.
  '/api/chat': async (url) => {
    const { chats } = await sessions();
    return { chat: chats.get(url.searchParams.get('id')) || [], launcher: LAUNCHER };
  },
};

const writes = {
  '/api/talk': talk,
  '/api/permission': decide,
};

/**
 * Reads carry your transcripts, so only the box's own page may make them:
 * Vite's dev server would otherwise let any other localhost page read them.
 */
function fromOurPage(req) {
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return false;
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

/**
 * Writes reach your agents, so they also need a JSON body: a cross-site form
 * can't send one without asking first.
 */
const jsonBody = (req) => /^application\/json\b/i.test(req.headers['content-type'] || '');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Too big.'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('Bad JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function apiMiddleware() {
  return async (req, res, next) => {
    // Nothing awaits this handler, so nothing may throw out of it: a path
    // like `//` doesn't even parse.
    let url;
    try { url = new URL(req.url || '/', 'http://x'); } catch { return reply(res, 400, { error: 'Bad URL.' }); }
    const read = reads[url.pathname];
    const write = writes[url.pathname];
    if (!read && !write) return next?.();
    try {
      if (!fromOurPage(req)) return reply(res, 403, { error: 'Only the box can do that.' });
      if (read) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { error: 'GET only.' });
        return reply(res, 200, await read(url));
      }
      if (req.method !== 'POST') return reply(res, 405, { error: 'POST only.' });
      if (!jsonBody(req)) return reply(res, 415, { error: 'JSON only.' });
      return reply(res, 200, await write(await readBody(req)));
    } catch (e) {
      if (!res.headersSent) reply(res, e.status || 500, { error: e.message });
    }
  };
}
