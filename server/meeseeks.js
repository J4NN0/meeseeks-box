// Meeseeks from the box. Pressing the box in the room makes one (`create`):
// it waits by the box for an instruction. Given one (`run`), the box starts
// Claude Code on it, headless (`claude -p`), in the folder you picked: it
// edits files there without asking, and anything else it wants to run waits
// for your Allow in its panel (the channel's permission tool, see
// channel/mcp-server.js). Headless, Claude Code doesn't ask whether you trust
// the folder, so the box does: it takes only a folder Claude Code already
// trusts, and never your whole home. Whatever you send it next resumes the
// same conversation, one turn after another. `dismiss` sends it away for
// good, as skipping one you haven't given anything does.
//
// They live as long as this server (`stopAll`), though a conversation one
// started stays on disk for `claude --resume`.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNEL_NAME, MAX_TEXT, boxSocket } from './channel/config.js';
import { CONFIG_FILE, claudeSession, findTranscript, toSession } from './providers/claude.js';
import { HttpError, clip } from './util.js';

const CLAUDE = process.env.MEESEEKS_CLAUDE || 'claude';
const MCP_SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'channel', 'mcp-server.js');
const MAX_MEESEEKS = 12;
const STDERR_KEEP = 2000;

/** id → { id, sessionId, cwd, createdAt, statusAt, ran, started, proc, queue, error } */
const meeseeks = new Map();

export const isBox = (id) => meeseeks.has(id);

function find(id) {
  const m = meeseeks.get(id);
  if (!m) throw new HttpError(404, 'That Meeseeks is gone.');
  return m;
}

/** The box was pressed: a new Meeseeks, waiting for its instruction. */
export function create() {
  if (meeseeks.size >= MAX_MEESEEKS) throw new HttpError(429, 'That’s a lot of Meeseeks already. Give them something to do, or send some away.');
  const now = Date.now();
  const sessionId = randomUUID();
  // The scanner's id for its conversation, so the recap and resume commands match it.
  const id = `claude:${sessionId}`;
  meeseeks.set(id, { id, sessionId, cwd: '', createdAt: now, statusAt: now, ran: false, started: false, proc: null, queue: [], error: '' });
  return { id };
}

/** Gone for good, stopping whatever it was doing. */
export function dismiss({ id }) {
  const m = find(id);
  m.queue = [];
  stop(m.proc);
  meeseeks.delete(id);
  return { ok: true };
}

/** The server is going away: so do they, rather than wait on prompts nobody can answer. */
export function stopAll() {
  for (const m of meeseeks.values()) stop(m.proc);
  meeseeks.clear();
}

/** Stops a turn along with whatever it started (a dev server, a watcher): they share its process group. */
function stop(proc) {
  if (!proc) return;
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); }
}

/**
 * Gives it `text` to do: its first instruction (in folder `cwd`), or the
 * next one, which waits for it to finish what it's on.
 */
export async function run({ id, text, cwd }) {
  const m = find(id);
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message) throw new HttpError(400, 'Tell it what to do.');
  if (message.length > MAX_TEXT) throw new HttpError(413, 'That’s too long for one Meeseeks.');
  if (!m.cwd) {
    const dir = await workFolder(cwd);
    // Another first instruction may have picked a folder while this one was checked.
    if (m.cwd && m.cwd !== dir) throw new HttpError(409, `It’s already working in ${m.cwd}.`);
    m.cwd = dir;
  }
  m.queue.push(message);
  m.error = '';
  next(m);
  return { ok: true, cwd: m.cwd };
}

const MAX_FOLDERS = 400;

/** The folders inside `path` (yours by default), for picking one to work in. Hidden ones aren't listed. */
export async function listFolders(url) {
  const raw = url.searchParams.get('path') || '~';
  let dir;
  try { dir = await folder(raw); } catch { dir = os.homedir(); }
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { throw new HttpError(403, `Can’t look inside ${dir}.`); }
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .slice(0, MAX_FOLDERS);
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? '' : parent, folders };
}

/** An existing folder, `~` being your home. */
async function folder(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new HttpError(400, 'Which folder should it work in?');
  const expanded = raw === '~' || raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(1)) : raw;
  if (!path.isAbsolute(expanded)) throw new HttpError(400, 'Give the folder’s full path (or start it with ~).');
  try {
    const real = await fsp.realpath(expanded);
    if ((await fsp.stat(real)).isDirectory()) return real;
  } catch { /* falls through */ }
  throw new HttpError(400, `There’s no folder ${raw}.`);
}

/** Whether `dir` is `parent` or inside it. */
function within(dir, parent) {
  const rel = path.relative(parent, dir);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** A folder it may work in, where it edits without asking: not one holding your whole home, and one Claude Code trusts. */
async function workFolder(value) {
  const dir = await folder(value);
  const home = await fsp.realpath(os.homedir()).catch(() => os.homedir());
  if (within(home, dir)) throw new HttpError(400, 'Pick a project folder: it edits files without asking, so not your whole home.');
  if (!(await trusted(dir))) throw new HttpError(403, `Claude Code doesn’t trust ${dir} yet. Run \`claude\` there once and accept, then try again.`);
  return dir;
}

/** Whether you told Claude Code's trust dialog you trust `dir`, or a folder it's in. */
async function trusted(dir) {
  let projects;
  try { projects = JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8')).projects || {}; } catch { return false; }
  for (let d = dir; ; d = path.dirname(d)) {
    if (projects[d]?.hasTrustDialogAccepted === true) return true;
    if (d === path.dirname(d)) return false;
  }
}

/** Starts its next turn, unless it's still on one. */
function next(m) {
  if (m.proc || !m.queue.length || !meeseeks.has(m.id)) return;
  const text = m.queue.shift();
  const env = { MEESEEKS_SOCKET: boxSocket(m.sessionId), MEESEEKS_BOX_PID: String(process.pid) };
  const config = { mcpServers: { [CHANNEL_NAME]: { command: process.execPath, args: [MCP_SERVER], env } } };
  const args = [
    '-p',
    // A first turn that failed early never made the conversation.
    m.started ? '--resume' : '--session-id', m.sessionId,
    '--permission-mode', 'acceptEdits',
    '--permission-prompt-tool', `mcp__${CHANNEL_NAME}__approve`,
    '--mcp-config', JSON.stringify(config),
  ];
  // Started from inside a Claude Code session, the box mustn't pass that on.
  const childEnv = { ...process.env };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  const proc = spawn(CLAUDE, args, { cwd: m.cwd, env: childEnv, stdio: ['pipe', 'ignore', 'pipe'], detached: true });
  m.proc = proc;
  m.ran = true;
  m.statusAt = Date.now();
  let stderr = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-STDERR_KEEP); });
  proc.stdin.on('error', () => {});
  // The prompt goes in on stdin, so one starting with a dash isn't a flag.
  proc.stdin.end(text);
  let finished = false;
  const done = async (error) => {
    if (finished) return;
    finished = true;
    m.started ||= !!(await findTranscript(m.sessionId, m.cwd));
    // So the next turn's link doesn't find this one's socket and give up on it.
    await fsp.rm(boxSocket(m.sessionId), { force: true });
    m.proc = null;
    m.statusAt = Date.now();
    if (error) {
      m.error = error;
      m.queue = [];
    }
    next(m);
  };
  proc.on('error', (e) => done(e.code === 'ENOENT' ? `Couldn’t find \`${CLAUDE}\` to run.` : e.message));
  // Not 'exit': stderr may not have all of it by then.
  proc.on('close', (code, signal) => done(code && !signal ? clip(stderr.trim().split('\n').at(-1), 300) || `Claude Code stopped (exit code ${code}).` : ''));
}

/** Their Claude Code session ids: the registry may list them too, but they're the box's to show. */
export function boxSessionIds() {
  return new Set([...meeseeks.values()].map((m) => m.sessionId));
}

/** Every Meeseeks from the box as a session, the way the scanner lists them. */
export function boxSessions(now) {
  return Promise.all([...meeseeks.values()].map(async (m) => {
    const busy = !!m.proc;
    const s = m.ran
      ? await claudeSession({ pid: m.proc?.pid, sessionId: m.sessionId, cwd: m.cwd, status: busy ? 'busy' : 'idle', startedAt: m.createdAt, statusUpdatedAt: m.statusAt }, now)
      : waiting(m, now);
    s.name = 'Mr. Meeseeks';
    s.box = { state: busy ? 'working' : m.ran ? 'done' : 'new', sessionId: m.sessionId, cwd: m.cwd, queued: m.queue.length, error: m.error };
    if (m.error) s.activity = [...s.activity, { ts: m.statusAt, kind: 'say', icon: '💥', text: m.error }];
    return s;
  }));
}

/** One that hasn't been given anything yet, waiting by the box. */
function waiting(m, now) {
  const reg = { sessionId: m.sessionId, cwd: '', status: 'idle', startedAt: m.createdAt, statusUpdatedAt: m.statusAt, entrypoint: 'box' };
  const activity = [{ ts: m.createdAt, kind: 'say', icon: '📦', text: 'What’s my task?' }];
  return { ...toSession(reg, { activity }, now), title: 'Mr. Meeseeks', project: 'Meeseeks Box', status: 'waiting' };
}
