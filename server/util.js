// Helpers shared by the session providers.

import fsp from 'node:fs/promises';
import path from 'node:path';

export const MIN = 60_000;
export const MAX_ACTIVITY = 40;

/** A numeric env var, or the fallback when it is unset or not a number. */
export function envNumber(name, fallback) {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
}

export const SLEEP_AFTER_MS = envNumber('MEESEEKS_SLEEP_AFTER_MIN', 15) * MIN;

/** working while busy; otherwise waiting, or sleeping once idle long enough. */
export function sessionStatus(busy, lastAt, now) {
  if (busy) return 'working';
  return now - lastAt > SLEEP_AFTER_MS ? 'sleeping' : 'waiting';
}

export const clip = (s, n = 140) => {
  if (!s) return '';
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
};

export const base = (p) => (p ? path.basename(String(p)) : '');
export const ms = (ts) => (ts ? Date.parse(ts) || 0 : 0);

export async function readHead(file, bytes = 64 * 1024) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

/** Pulls a JSON string value out of a line too big to parse. */
export function grab(text, re) {
  const m = text.match(re);
  if (!m) return '';
  try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
}

export function pushActivity(list, item) {
  const prev = list[list.length - 1];
  // Collapse runs of "thinking" so the feed stays readable.
  if (item.kind === 'think' && prev?.kind === 'think') { prev.ts = item.ts; return; }
  list.push(item);
  if (list.length > MAX_ACTIVITY * 2) list.splice(0, list.length - MAX_ACTIVITY);
}

/** Drops cache entries whose key was not seen in the latest scan. */
export function pruneMap(map, seen) {
  for (const key of map.keys()) if (!seen.has(key)) map.delete(key);
}

/** An error the API answers with `status`. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
