// The box's API, as connect-style middleware for Vite and the standalone
// server. GET /api/sessions, /api/today, /api/chat and /api/folders read; POST /api/talk and
// /api/permission talk to a session through its channel (channel/client.js),
// and POST /api/box/* make and run the box's own Meeseeks (meeseeks.js).
// Every request but GET /api/key needs the box's key (key.js), which that
// hands to a browser running as you.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, talk } from './channel/client.js';
import { KEY, keyMatches, sameUser } from './key.js';
import { create, dismiss, isBox, listFolders, run } from './meeseeks.js';
import { scanSessions } from './scanner.js';
import { scanToday } from './today.js';
import { HttpError } from './util.js';

const LAUNCHER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'claude-box');
const MAX_BODY = 64 * 1024;

// Coalesces concurrent requests (several open tabs) into one scan, and reuses
// a result for `maxAge` ms, unless `fresh()` says it's out of date: then a
// scan already under way, which may have missed the change, isn't kept either,
// and `scan` is told so (its argument) before acting on what it found.
function cached(scan, maxAge) {
  let inflight = null;
  let last = null;
  let generation = 0;
  const get = () => {
    if (last && Date.now() - last.now < maxAge) return last;
    if (!inflight) {
      const started = generation;
      const current = scan(() => started === generation)
        .then((result) => {
          if (inflight === current) last = result;
          return result;
        })
        .finally(() => { if (inflight === current) inflight = null; });
      inflight = current;
    }
    return inflight;
  };
  get.fresh = () => {
    last = null;
    inflight = null;
    generation++;
  };
  return get;
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
  '/api/folders': listFolders,
  '/api/key': async (url, req) => {
    if (!(await sameUser(req.socket))) throw new HttpError(403, 'Can’t tell this browser runs as you: open the key link the server printed.');
    return { key: KEY };
  },
};

/** A change you'll want to see on the next poll, not one a moment later. */
const thenRescan = (write) => async (body) => {
  const result = await write(body);
  sessions.fresh();
  return result;
};

const writes = {
  // The box's own Meeseeks take what you say as their next instruction.
  '/api/talk': thenRescan((body) => (isBox(body.id) ? run({ id: body.id, text: body.text }) : talk(body))),
  '/api/permission': decide,
  '/api/box/new': thenRescan(create),
  '/api/box/run': thenRescan(run),
  '/api/box/dismiss': thenRescan(dismiss),
};

/**
 * Only the box's own page may call the API. The key keeps out everyone else
 * on this machine; this keeps out other pages in your own browser, which
 * GET /api/key would otherwise hand it to.
 */
function fromOurPage(req) {
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return false;
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

const NO_KEY = 'This browser doesn’t have the box’s key: open the key link the server printed (in Vite, press u to show it again).';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Too big.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new HttpError(400, 'Bad JSON.')); }
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
      if (url.pathname !== '/api/key' && !keyMatches(req.headers['x-meeseeks-key'])) return reply(res, 401, { error: NO_KEY });
      if (read) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { error: 'GET only.' });
        return reply(res, 200, await read(url, req));
      }
      if (req.method !== 'POST') return reply(res, 405, { error: 'POST only.' });
      return reply(res, 200, await write(await readBody(req)));
    } catch (e) {
      if (!res.headersSent) reply(res, e.status || 500, { error: e.message });
    }
  };
}
