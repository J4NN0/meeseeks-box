// Follows a JSONL log incrementally. The first read bootstraps from the last
// BOOT_BYTES (enough to cover a day for all but the hugest sessions); later
// reads only parse what was appended since. Lines bigger than
// MAX_LINE (inline screenshots, huge tool outputs) go to the reducer's cheap
// `big` handler instead of JSON.parse.
//
// A reducer is { init(), feed(state, row), big?(line), summary(state) }.

import fsp from 'node:fs/promises';
import { setImmediate as yieldNow } from 'node:timers/promises';
import { StringDecoder } from 'node:string_decoder';
import { MIN } from './util.js';

const BOOT_BYTES = 64 * 1024 * 1024;
// Parsing is synchronous, so a first read of a big log is split into chunks
// with a yield between them: other requests get served meanwhile.
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_LINE = 256 * 1024;

const logs = new Map();
const reading = new Map();

/**
 * Reads what was appended to `file` and returns the reducer's summary. Calls
 * for the same file queue up, so two scans never parse the same bytes twice.
 */
export function follow(file, reducer) {
  const next = (reading.get(file) || Promise.resolve()).catch(() => {}).then(() => readLog(file, reducer));
  reading.set(file, next);
  next.finally(() => { if (reading.get(file) === next) reading.delete(file); }).catch(() => {});
  return next;
}

async function readLog(file, reducer) {
  let st;
  try { st = await fsp.stat(file); } catch { logs.delete(file); return null; }
  let entry = logs.get(file);
  if (!entry || entry.reducer !== reducer || st.size < entry.offset || st.ino !== entry.ino) {
    const offset = Math.max(0, st.size - BOOT_BYTES);
    entry = { reducer, ino: st.ino, offset, skipFirst: offset > 0, carry: '', decoder: new StringDecoder('utf8'), state: reducer.init() };
    logs.set(file, entry);
  }
  entry.seenAt = Date.now();
  if (st.size > entry.offset) {
    const fh = await fsp.open(file, 'r');
    try {
      while (entry.offset < st.size) {
        const len = Math.min(CHUNK_BYTES, st.size - entry.offset);
        const buf = Buffer.alloc(len);
        const { bytesRead } = await fh.read(buf, 0, len, entry.offset);
        if (!bytesRead) break;
        entry.offset += bytesRead;
        const lines = (entry.carry + entry.decoder.write(buf.subarray(0, bytesRead))).split('\n');
        entry.carry = lines.pop();
        if (entry.skipFirst) { lines.shift(); entry.skipFirst = false; }
        for (const line of lines) {
          if (!line) continue;
          let row = null;
          if (line.length > MAX_LINE) row = reducer.big?.(line);
          else try { row = JSON.parse(line); } catch { /* corrupt line */ }
          if (row) reducer.feed(entry.state, row);
        }
        if (entry.offset < st.size) await yieldNow();
      }
    } finally {
      await fh.close();
    }
  }
  return { ...reducer.summary(entry.state), mtimeMs: st.mtimeMs };
}

/** Forgets logs nobody has asked about for a while. */
export function pruneLogs() {
  const cutoff = Date.now() - 10 * MIN;
  for (const [file, e] of logs) if (e.seenAt < cutoff) logs.delete(file);
}
