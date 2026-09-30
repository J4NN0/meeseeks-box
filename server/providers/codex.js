// Codex has no per-session registry, so a rollout in ~/.codex/sessions counts
// as live when a codex process is running and the rollout was touched recently.

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { follow } from '../follow.js';
import { MAX_ACTIVITY, MIN, SLEEP_AFTER_MS, base, clip, envNumber, ms, pruneMap, pushActivity, readHead, sessionStatus } from '../util.js';

const exec = promisify(execFile);
const CODEX_DIR = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const CODEX_WINDOW_MS = envNumber('MEESEEKS_CODEX_WINDOW_MIN', 45) * MIN;

function describeCall(name, args) {
  const raw = typeof args === 'string' ? args : JSON.stringify(args || {});
  const patch = raw.match(/\*\*\* (Update|Add|Delete) File: ([^\\\n"]+)/);
  if (patch) return { icon: patch[1] === 'Add' ? '📝' : '✏️', text: `${patch[1] === 'Add' ? 'Writing' : patch[1] === 'Delete' ? 'Deleting' : 'Editing'} ${base(patch[2])}` };
  const cmd = raw.match(/\\?"(?:cmd|command)\\?"\s*:\s*\\?"((?:[^"\\]|\\.)*?)\\?"/);
  if (cmd) {
    const c = cmd[1].replace(/\\\\n|\\n/g, ' ').replace(/\\+"/g, '"');
    return { icon: '⌨️', text: `$ ${clip(c, 90)}`, cmd: clip(c, 200) };
  }
  switch (name) {
    case 'spawn_agent': return { icon: '🧬', text: 'Summoning a helper agent' };
    case 'wait_agent':
    case 'wait': return { icon: '⏳', text: 'Waiting on helpers' };
    case 'update_plan': return { icon: '✅', text: 'Updating the plan' };
    case 'view_image': return { icon: '🖼️', text: 'Looking at an image' };
    case 'web_search': return { icon: '🌐', text: 'Searching the web' };
    default: return { icon: '🔧', text: clip(name, 80) };
  }
}

const NOISE = /^(<environment_context|<user_instructions|<permissions|<turn_aborted|# AGENTS\.md|<INSTRUCTIONS>|<collaboration)/;

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((c) => c?.text || '').join(' ');
}

export const codexReducer = {
  init: () => ({ activity: [], helpers: new Set(), busy: false, turnStartedAt: 0, lastAt: 0, model: '', context: 0, total: 0, firstPrompt: '', branch: '' }),

  feed(st, r) {
    const ts = ms(r.timestamp);
    if (ts) st.lastAt = Math.max(st.lastAt, ts);
    const p = r.payload || {};
    if (r.type === 'turn_context' && p.model) st.model = p.model;
    if (r.type === 'session_meta' && p.git?.branch) st.branch = p.git.branch;

    if (r.type === 'event_msg') {
      if (p.type === 'task_started') { st.busy = true; st.turnStartedAt = ts; }
      else if (p.type === 'task_complete' || p.type === 'turn_aborted') { st.busy = false; st.helpers.clear(); }
      else if (p.type === 'token_count' && p.info) {
        st.total = p.info.total_token_usage?.total_tokens || st.total;
        st.context = p.info.last_token_usage?.input_tokens || st.context;
      } else if (p.type === 'thread_settings_applied' && p.thread_settings?.model) st.model = p.thread_settings.model;
    }

    if (r.type === 'response_item') {
      if (p.type === 'message') {
        const text = contentText(p.content).trim();
        if (!text || NOISE.test(text)) return;
        if (p.role === 'user') {
          st.firstPrompt ||= text;
          pushActivity(st.activity, { ts, kind: 'prompt', icon: '🧑', text: clip(text, 160) });
        } else if (p.role === 'assistant') {
          pushActivity(st.activity, { ts, kind: 'say', icon: '💬', text: clip(text, 160) });
        }
      } else if (p.type === 'reasoning') {
        pushActivity(st.activity, { ts, kind: 'think', icon: '🤔', text: 'Thinking…' });
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
        const name = p.name || 'shell';
        if (name === 'spawn_agent') st.helpers.add(p.call_id || ts);
        pushActivity(st.activity, { ts, kind: 'tool', tool: name, ...describeCall(name, p.arguments ?? p.input ?? p.action) });
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
    activity: st.activity.slice(-MAX_ACTIVITY),
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

async function recentRollouts(now) {
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
      const p = path.join(dir, f);
      try {
        const st = await fsp.stat(p);
        if (now - st.mtimeMs < CODEX_WINDOW_MS) out.push(p);
      } catch { /* vanished */ }
    }
  }
  return out;
}

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
      activity: info.activity || [],
    });
  }
  pruneMap(metaCache, new Set(rollouts));
  return sessions;
}
