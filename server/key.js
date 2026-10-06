// The box's key. Writes to the API start and steer agents as you, and
// 127.0.0.1 is open to every user on this machine, so writes need the key.
// It's kept in a file only you can read. The server hands it to a browser
// running as you (`sameUser`, GET /api/key); where it can't tell, the link it
// prints (`#key=…`, which never goes over the wire) brings it instead. The
// page keeps it and sends it with each write (src/data/api.js).

import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const FILE = process.env.MEESEEKS_KEY_FILE || path.join(os.homedir(), '.meeseeks-box', 'key');
const LOOPBACK = /^(?:127\.|::1$|::ffff:127\.)/;

function load() {
  try {
    const key = fs.readFileSync(FILE, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(key)) {
      fs.chmodSync(FILE, 0o600);
      return key;
    }
  } catch { /* first run */ }
  const key = randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(FILE, `${key}\n`, { mode: 0o600 });
  return key;
}

export const KEY = load();

export function keyMatches(value) {
  const given = Buffer.from(typeof value === 'string' ? value : '');
  const key = Buffer.from(KEY);
  return given.length === key.length && timingSafeEqual(given, key);
}

/** The page at `url`, handing your browser the key. */
export const keyLink = (url) => `${url.replace(/\/$/, '')}/#key=${KEY}`;

/** Whether the other end of `socket` is a process on this machine running as you, as your browser is. */
export async function sameUser(socket) {
  const { remoteAddress = '', remotePort, localPort } = socket;
  if (!LOOPBACK.test(remoteAddress) || !remotePort) return false;
  try {
    const uid = process.platform === 'linux' ? await procOwner(remotePort, localPort) : await lsofOwner(remotePort, localPort);
    return uid === process.getuid();
  } catch {
    return false; // no way to tell: the link it is
  }
}

/** The user running the process at the client end (`port`) of a connection to `serverPort`, per lsof (macOS). */
async function lsofOwner(port, serverPort) {
  const { stdout } = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:ESTABLISHED', '-Fpun']);
  let uid = null;
  for (const line of stdout.split('\n')) {
    if (line[0] === 'p') uid = null;
    else if (line[0] === 'u') uid = Number(line.slice(1));
    // `n<local>-><remote>`: the client's own end starts at `port`.
    else if (line[0] === 'n' && line.includes(`:${port}->`) && line.endsWith(`:${serverPort}`)) return uid;
  }
  return null;
}

/** The same, from the kernel's connection tables (Linux), which list each one's owner. */
async function procOwner(port, serverPort) {
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let table;
    try { table = await fsp.readFile(file, 'utf8'); } catch { continue; }
    for (const row of table.split('\n').slice(1)) {
      // sl local_address rem_address st tx:rx tr:when retrnsmt uid …; st 01 is ESTABLISHED.
      const f = row.trim().split(/\s+/);
      if (f[1]?.endsWith(`:${hex(port)}`) && f[2]?.endsWith(`:${hex(serverPort)}`) && f[3] === '01') return Number(f[7]);
    }
  }
  return null;
}
