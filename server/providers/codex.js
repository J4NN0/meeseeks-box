// Codex has no per-session registry, so a rollout in ~/.codex/sessions counts
// as live when a codex process is running and the rollout was touched recently.

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { follow } from '../follow.js';
import { addTokens, endTurn, isTestCommand, journalSummary, newJournal, noteEdit, noteTest, promptTurn, startTurn, touchTurn } from '../journal.js';
import { MAX_ACTIVITY, MIN, SLEEP_AFTER_MS, base, clip, envNumber, ms, pruneMap, pushActivity, readHead, sessionStatus } from '../util.js';

const exec = promisify(execFile);
const CODEX_DIR = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const CODEX_WINDOW_MS = envNumber('MEESEEKS_CODEX_WINDOW_MIN', 45) * MIN;

/** The raw text of a call's arguments, whatever shape this Codex version logs. */
function rawArgs(args) {
  return typeof args === 'string' ? args : JSON.stringify(args || {});
}

// Shell commands appear as {"command": ["bash", "-lc", "..."]} or {"cmd": "..."}
// in older rollouts, and inside JS like tools.exec_command({cmd: "..."}) in newer.
function commandOf(raw) {
  const str = raw.match(/(?:\bcmd|"cmd"|\\"cmd\\")\s*:\s*("(?:[^"\\]|\\.)*")/)?.[1];
  if (str) {
    try { return JSON.parse(str); } catch { return str.slice(1, -1); }
  }
  const list = raw.match(/"command"\s*:\s*(\[(?:[^\]"]|"(?:[^"\\]|\\.)*")*\])/)?.[1];
  if (list) {
    try { const argv = JSON.parse(list); return String(argv.at(-1) || ''); } catch { /* fall through */ }
  }
  return '';
}

const PATCH_FILE = /\*\*\* (Update|Add|Delete) File: ([^\n\\"'`]+)/g;

function describeCall(name, args) {
  const raw = rawArgs(args);
  const patch = PATCH_FILE.exec(raw);
  PATCH_FILE.lastIndex = 0;
  if (patch) return { icon: patch[1] === 'Add' ? '📝' : '✏️', text: `${patch[1] === 'Add' ? 'Writing' : patch[1] === 'Delete' ? 'Deleting' : 'Editing'} ${base(patch[2].trim())}` };
  const cmd = commandOf(raw).replace(/\s+/g, ' ').trim();
  if (cmd) return { icon: '⌨️', text: `$ ${clip(cmd, 90)}`, cmd: clip(cmd, 200) };
  // Newer Codex wraps every tool in a JS `exec` call: name it by what it calls.
  if (name === 'exec') name = raw.match(/tools\.(\w+)/)?.[1] || name;
  if (name.startsWith('mcp__')) return { icon: '🔧', text: clip(name.split('__').slice(1).join(' · '), 80) };
  switch (name) {
    case 'spawn_agent': return { icon: '🧬', text: 'Summoning a helper agent' };
    case 'wait_agent':
    case 'wait': return { icon: '⏳', text: 'Waiting on helpers' };
    case 'update_plan': return { icon: '✅', text: 'Updating the plan' };
    case 'view_image': return { icon: '🖼️', text: 'Looking at an image' };
    case 'web_search':
    case 'web__run': return { icon: '🌐', text: 'Searching the web' };
    case 'image_gen__imagegen': return { icon: '🎨', text: 'Generating an image' };
    case 'exec': return { icon: '⌨️', text: 'Running a script' };
    default: return { icon: '🔧', text: clip(name, 80) };
  }
}

function outputText(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.map((o) => o?.text || '').join('\n');
  return output?.output || output?.content || '';
}

const NOISE = /^(<environment_context|<user_instructions|<permissions|<turn_aborted|# AGENTS\.md|<INSTRUCTIONS>|<collaboration)/;

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((c) => c?.text || '').join(' ');
}

export const codexReducer = {
  init: () => ({
    activity: [], helpers: new Set(), tests: new Map(), journal: newJournal(), busy: false, turnStartedAt: 0, lastAt: 0,
    model: '', context: 0, total: 0, lastTotal: null, firstPrompt: '', branch: '', lastSay: null, limits: null,
  }),

  feed(st, r) {
    const ts = ms(r.timestamp);
    if (ts) st.lastAt = Math.max(st.lastAt, ts);
    const p = r.payload || {};
    if (r.type === 'turn_context' && p.model) st.model = p.model;
    if (r.type === 'session_meta' && p.git?.branch) st.branch = p.git.branch;

    const j = st.journal;

    if (r.type === 'event_msg') {
      if (p.type === 'task_started') {
        st.busy = true;
        st.turnStartedAt = ts;
        startTurn(j, ts, '');
      } else if (p.type === 'task_complete' || p.type === 'turn_aborted') {
        st.busy = false;
        st.helpers.clear();
        endTurn(j, ts);
        if (p.last_agent_message) st.lastSay = { ts, text: clip(p.last_agent_message, 400) };
      } else if (p.type === 'token_count') {
        if (p.info) {
          const total = p.info.total_token_usage?.total_tokens || 0;
          // Totals are cumulative; today's share is what they grew by today.
          const before = st.lastTotal ?? total - (p.info.last_token_usage?.total_tokens || 0);
          if (total > before) addTokens(j, ts, total - before);
          if (total) st.lastTotal = total;
          st.total = total || st.total;
          st.context = p.info.last_token_usage?.input_tokens || st.context;
        }
        if (p.rate_limits?.primary || p.rate_limits?.secondary) st.limits = { at: ts, ...p.rate_limits };
      } else if (p.type === 'thread_settings_applied' && p.thread_settings?.model) st.model = p.thread_settings.model;
    }

    if (r.type === 'response_item') {
      if (p.type === 'message') {
        const text = contentText(p.content).trim();
        if (!text || NOISE.test(text)) return;
        if (p.role === 'user') {
          st.firstPrompt ||= text;
          promptTurn(j, ts, text);
          pushActivity(st.activity, { ts, kind: 'prompt', icon: '🧑', text: clip(text, 160) });
        } else if (p.role === 'assistant') {
          touchTurn(j, ts);
          st.lastSay = { ts, text: clip(text, 400) };
          pushActivity(st.activity, { ts, kind: 'say', icon: '💬', text: clip(text, 160) });
        }
      } else if (p.type === 'reasoning') {
        touchTurn(j, ts);
        pushActivity(st.activity, { ts, kind: 'think', icon: '🤔', text: 'Thinking…' });
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
        const name = p.name || 'shell';
        const args = p.arguments ?? p.input ?? p.action;
        const raw = rawArgs(args);
        touchTurn(j, ts);
        if (name === 'spawn_agent') st.helpers.add(p.call_id || ts);
        for (const m of raw.matchAll(PATCH_FILE)) noteEdit(j, m[2].trim(), ts);
        const cmd = commandOf(raw);
        if (p.call_id && isTestCommand(cmd)) st.tests.set(p.call_id, cmd);
        pushActivity(st.activity, { ts, kind: 'tool', tool: name, ...describeCall(name, args) });
      } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output' || p.type === 'local_shell_call_output') {
        touchTurn(j, ts);
        const cmd = st.tests.get(p.call_id);
        if (cmd) {
          st.tests.delete(p.call_id);
          const out = outputText(p.output);
          const exitCode = Number(String(out).match(/"exit_code"\s*:\s*(\d+)/)?.[1] ?? NaN);
          noteTest(j, ts, cmd, out, Number.isFinite(exitCode) ? { exitCode } : {});
        }
      }
    }
  },

  // Rollout rows start with the timestamp, so a prefix is enough to keep the
  // clock moving; big tool calls (patches) still get a description.
  big(line) {
    const head = line.slice(0, 4000);
    const timestamp = head.match(/"timestamp":"([^"]+)"/)?.[1];
    const call = head.match(/"type":"response_item","payload":\{"type":"(function_call|custom_tool_call)"/);
    if (call) return { timestamp, type: 'response_item', payload: { type: call[1], name: head.match(/"name":"([^"]+)"/)?.[1], arguments: head } };
    return { timestamp, type: 'noop' };
  },

  summary: (st) => ({
    busy: st.busy,
    turnStartedAt: st.turnStartedAt,
    lastAt: st.lastAt,
    model: st.model,
    context: st.context,
    total: st.total,
    firstPrompt: st.firstPrompt,
    branch: st.branch,
    helpers: st.helpers.size,
    lastMessage: st.lastSay,
    limits: st.limits,
    activity: st.activity.slice(-MAX_ACTIVITY),
    journal: st.journal,
  }),
};

// session_meta is the first line of a rollout and never changes.
const metaCache = new Map();
async function readMeta(file) {
  if (metaCache.has(file)) return metaCache.get(file);
  const head = await readHead(file);
  const pick = (re) => head.match(re)?.[1] || '';
  const meta = {
    id: pick(/"id":"([^"]+)"/),
    cwd: pick(/"cwd":"([^"]+)"/),
    originator: pick(/"originator":"([^"]+)"/),
    source: pick(/"source":"([^"]+)"/),
    cliVersion: pick(/"cli_version":"([^"]+)"/),
    startedAt: ms(pick(/"timestamp":"([^"]+)"/)),
  };
  if (meta.id) metaCache.set(file, meta);
  return meta;
}

let titles = { key: '', map: new Map() };
async function loadTitles() {
  const file = path.join(CODEX_DIR, 'session_index.jsonl');
  let st;
  try { st = await fsp.stat(file); } catch { return titles.map; }
  const key = `${st.mtimeMs}:${st.size}`;
  if (titles.key === key) return titles.map;
  const map = new Map();
  for (const line of (await fsp.readFile(file, 'utf8')).split('\n')) {
    if (!line) continue;
    try { const r = JSON.parse(line); if (r.id && r.thread_name) map.set(r.id, r.thread_name); } catch { /* skip */ }
  }
  titles = { key, map };
  return map;
}

let codexProc = { at: 0, running: false };
async function codexRunning(now) {
  if (now - codexProc.at < 5000) return codexProc.running;
  let running = false;
  try {
    const { stdout } = await exec('ps', ['-Ao', 'comm=']);
    running = stdout.split('\n').some((l) => /(^|\/)codex$/i.test(l.trim()));
  } catch { running = true; }
  codexProc = { at: now, running };
  return running;
}

/** Rollouts touched since `since`, newest first. */
async function rolloutsSince(since, now) {
  const root = path.join(CODEX_DIR, 'sessions');
  const out = [];
  // Rollouts are filed by start date, but long sessions keep writing to old
  // folders, so walk the last few days and filter by mtime.
  for (let d = 0; d < 7; d++) {
    const day = new Date(now - d * 86_400_000);
    const dir = path.join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    let files;
    try { files = await fsp.readdir(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const file = path.join(dir, f);
      try {
        const { mtimeMs } = await fsp.stat(file);
        if (mtimeMs >= since) out.push({ file, mtimeMs });
      } catch { /* vanished */ }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const recentRollouts = async (now) => (await rolloutsSince(now - CODEX_WINDOW_MS, now)).map((r) => r.file);

export async function scanCodex(now) {
  if (!(await codexRunning(now))) return [];
  const threadTitles = await loadTitles();
  const rollouts = await recentRollouts(now);
  const sessions = [];
  for (const file of rollouts) {
    const meta = await readMeta(file).catch(() => null);
    if (!meta?.id) continue;
    const info = await follow(file, codexReducer).catch(() => null);
    if (!info) continue;
    const lastAt = Math.max(info.lastAt || 0, info.mtimeMs || 0);
    // A turn that has been silent for a long time was most likely killed.
    const busy = info.busy && now - lastAt < SLEEP_AFTER_MS;
    sessions.push({
      id: `codex:${meta.id}`,
      provider: 'codex',
      name: '',
      title: threadTitles.get(meta.id) || clip(info.firstPrompt, 60) || base(meta.cwd),
      cwd: meta.cwd,
      project: base(meta.cwd),
      branch: info.branch || '',
      model: info.model || '',
      status: sessionStatus(busy, lastAt, now),
      rawStatus: info.busy ? 'busy' : 'idle',
      startedAt: meta.startedAt,
      statusSince: busy ? info.turnStartedAt : lastAt,
      turnStartedAt: busy ? info.turnStartedAt : 0,
      lastActivityAt: lastAt,
      contextTokens: info.context || 0,
      outputTokens: info.total || 0,
      helpers: busy ? info.helpers : 0,
      entrypoint: meta.originator || meta.source || '',
      version: meta.cliVersion || '',
      lastMessage: info.lastMessage || null,
      ask: null,
      activity: info.activity || [],
    });
  }
  return sessions;
}

/**
 * Every rollout that did something since `since`, plus the latest usage limits
 * Codex reported this week (read from the newest rollout even if it's older).
 */
export async function codexToday(since, now) {
  const threadTitles = await loadTitles();
  const week = await rolloutsSince(now - 7 * 86_400_000, now);
  const sessions = [];
  let limits = null;
  for (const [i, { file, mtimeMs }] of week.entries()) {
    if (mtimeMs < since && i > 0) break;
    const meta = await readMeta(file).catch(() => null);
    if (!meta?.id) continue;
    const info = await follow(file, codexReducer).catch(() => null);
    if (!info) continue;
    if (info.limits && (!limits || info.limits.at > limits.at)) limits = info.limits;
    if (mtimeMs < since) continue;
    const day = journalSummary(info.journal, since);
    if (!day.turns.length && !day.tokens) continue;
    sessions.push({
      id: `codex:${meta.id}`,
      provider: 'codex',
      cwd: meta.cwd,
      title: threadTitles.get(meta.id) || clip(info.firstPrompt, 60) || base(meta.cwd),
      lastAt: Math.max(info.lastAt || 0, mtimeMs),
      ...day,
    });
  }
  pruneMap(metaCache, new Set(week.map((r) => r.file)));
  // Codex logs its limits with every response, so a window that reset since
  // the last reading really is unused (`live`).
  return { sessions, limits: limits && { at: limits.at, live: true, windows: [limits.primary, limits.secondary].filter(Boolean).map(limitWindow) } };
}

function limitWindow(w) {
  const minutes = Number(w.window_minutes) || 0;
  const name = minutes === 10080 ? 'week' : minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
  return { name, usedPercent: Number(w.used_percent) || 0, resetsAt: (Number(w.resets_at) || 0) * 1000 };
}
