// Claude Code keeps a live registry at ~/.claude/sessions/<pid>.json with a
// busy/idle status; the transcript lives in ~/.claude/projects/<cwd>/<id>.jsonl.

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { follow } from '../follow.js';
import { addTokens, endTurn, isTestCommand, journalSummary, newJournal, noteEdit, noteRecap, noteTest, startTurn, touchTurn } from '../journal.js';
import { MAX_ACTIVITY, base, clip, grab, ms, pruneMap, pushActivity, sessionStatus } from '../util.js';

const exec = promisify(execFile);
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
// Global settings live next to ~/.claude, or inside CLAUDE_CONFIG_DIR when set.
const CONFIG_FILE = process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');

function describeTool(name, input = {}) {
  const i = input || {};
  switch (name) {
    case 'Bash': return { icon: '⌨️', text: i.description ? clip(i.description, 90) : `$ ${clip(i.command, 90)}`, cmd: clip(i.command, 200) };
    case 'Read': return { icon: '📖', text: `Reading ${base(i.file_path)}` };
    case 'Edit':
    case 'MultiEdit': return { icon: '✏️', text: `Editing ${base(i.file_path)}` };
    case 'Write': return { icon: '📝', text: `Writing ${base(i.file_path)}` };
    case 'NotebookEdit': return { icon: '📓', text: `Editing ${base(i.notebook_path)}` };
    case 'Grep': return { icon: '🔍', text: `Grep “${clip(i.pattern, 50)}”` };
    case 'Glob': return { icon: '🔍', text: `Glob ${clip(i.pattern, 60)}` };
    case 'WebFetch': return { icon: '🌐', text: `Fetching ${clip(i.url, 70)}` };
    case 'WebSearch': return { icon: '🌐', text: `Searching “${clip(i.query, 60)}”` };
    case 'Agent':
    case 'Task': return { icon: '🧬', text: `Summoning helper: ${clip(i.description || i.prompt, 70)}` };
    case 'TodoWrite': return { icon: '✅', text: 'Updating the todo list' };
    case 'Skill': return { icon: '🎓', text: `Using skill ${clip(i.skill, 50)}` };
    case 'AskUserQuestion': return { icon: '🙋', text: 'Asking you a question' };
    case 'ExitPlanMode': return { icon: '🗺️', text: 'Presenting a plan' };
    default: {
      const short = name.startsWith('mcp__') ? name.split('__').slice(1).join(' · ') : name;
      return { icon: '🔧', text: clip(short, 80) };
    }
  }
}

const NOISE = /^(<command-|<local-command|<system-reminder|<task-notification|\[Request interrupted|Caveat:)/;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

function textParts(content) {
  if (typeof content === 'string') return [content];
  return Array.isArray(content) ? content.filter((c) => c?.type === 'text').map((c) => String(c.text)) : [];
}

// Harness-injected parts (reminders, command echoes) are not the user talking.
function userText(content) {
  return textParts(content).map((t) => t.trim()).filter((t) => t && !NOISE.test(t)).join(' ');
}

function resultText(content) {
  return typeof content === 'string' ? content : textParts(content).join('\n');
}

/** What a pending tool call is waiting for, if you're the one it waits on. */
function askOf(name, input = {}) {
  if (name === 'AskUserQuestion') return { kind: 'question', text: clip(input?.questions?.[0]?.question || 'Has a question for you', 300) };
  if (name === 'ExitPlanMode') return { kind: 'plan', text: 'Wants you to approve a plan' };
  const d = describeTool(name, input);
  return { kind: 'tool', text: d.cmd ? `$ ${d.cmd}` : d.text };
}

export const claudeReducer = {
  init: () => ({
    activity: [], pending: new Map(), tests: new Map(), usageIds: [], journal: newJournal(),
    title: '', lastPrompt: '', model: '', branch: '', cwd: '', lastSay: null,
    turnStartedAt: 0, lastAt: 0, context: 0, outTokens: 0,
  }),

  feed(st, r) {
    const ts = ms(r.timestamp);
    if (ts) st.lastAt = Math.max(st.lastAt, ts);
    if (r.gitBranch) st.branch = r.gitBranch;
    if (r.cwd) st.cwd = r.cwd;
    if (r.type === 'ai-title' && r.aiTitle) st.title = r.aiTitle;
    if (r.type === 'last-prompt' && r.lastPrompt) st.lastPrompt = r.lastPrompt;
    // Sidechain rows in a main transcript belong to a subagent; in a subagent's
    // own log every row is one, and that log is all we read.
    if (r.isSidechain && !st.subagent) return;
    const j = st.journal;

    if (r.type === 'system') {
      if (r.subtype === 'turn_duration') endTurn(j, ts);
      else if (r.subtype === 'away_summary' && typeof r.content === 'string') noteRecap(j, ts, r.content);
      return;
    }

    if (r.type === 'user' && r.message) {
      const c = r.message.content;
      if (Array.isArray(c)) {
        for (const part of c) {
          if (part?.type !== 'tool_result') continue;
          st.pending.delete(part.tool_use_id);
          touchTurn(j, ts);
          const test = st.tests.get(part.tool_use_id);
          if (test) {
            st.tests.delete(part.tool_use_id);
            noteTest(j, ts, test, resultText(part.content), { isError: part.is_error });
          }
        }
      }
      const text = userText(c).trim();
      if (text && !r.isMeta && !r.isCompactSummary) {
        st.turnStartedAt = ts || st.turnStartedAt;
        startTurn(j, ts, text);
        pushActivity(st.activity, { ts, kind: 'prompt', icon: '🧑', text: clip(text, 160) });
      } else if (textParts(c).some((t) => t.trimStart().startsWith('<task-notification'))) {
        startTurn(j, ts, '🔔 A background task reported back');
      }
    }

    if (r.type === 'assistant' && r.message) {
      const m = r.message;
      touchTurn(j, ts, true);
      if (m.model && !m.model.startsWith('<')) st.model = m.model;
      // One API response is logged as several rows (one per content block),
      // each repeating the same usage: count it once.
      if (m.usage && !(m.id && st.usageIds.includes(m.id))) {
        const u = m.usage;
        const input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        st.context = input;
        st.outTokens += u.output_tokens || 0;
        addTokens(j, ts, input + (u.output_tokens || 0));
        if (m.id) {
          st.usageIds.push(m.id);
          if (st.usageIds.length > 16) st.usageIds.shift();
        }
      }
      for (const part of m.content || []) {
        if (part.type === 'thinking') pushActivity(st.activity, { ts, kind: 'think', icon: '🤔', text: 'Thinking…' });
        else if (part.type === 'text' && part.text?.trim()) {
          st.lastSay = { ts, text: clip(part.text, 400) };
          pushActivity(st.activity, { ts, kind: 'say', icon: '💬', text: clip(part.text, 160) });
        } else if (part.type === 'tool_use') {
          const input = part.input || {};
          st.pending.set(part.id, { name: part.name, ...askOf(part.name, input) });
          if (EDIT_TOOLS.has(part.name)) noteEdit(j, input.file_path || input.notebook_path, ts);
          if (part.name === 'Bash' && isTestCommand(input.command)) st.tests.set(part.id, input.command);
          pushActivity(st.activity, { ts, kind: 'tool', tool: part.name, ...describeTool(part.name, input) });
        }
      }
    }
  },

  // Huge rows are almost always tool results carrying screenshots, or a Write
  // with a big file. Keep what matters: which tool calls finished, and when.
  big(line) {
    const head = line.slice(0, 4000);
    const type = head.match(/"type":"(user|assistant)"/)?.[1];
    if (!type) return null;
    const tail = line.slice(-1000);
    const timestamp = tail.match(/"timestamp":"([^"]+)"/)?.[1];
    const isSidechain = /"isSidechain":true/.test(head) || /"isSidechain":true/.test(tail);
    if (type === 'user') {
      const isError = /"is_error":true/.test(line) ? true : undefined;
      const ids = [...line.matchAll(/"tool_use_id":"([^"]+)"/g)].map((m) => ({ type: 'tool_result', tool_use_id: m[1], is_error: isError }));
      if (ids.length) return { type, timestamp, isSidechain, message: { content: ids } };
      const text = grab(head, /"type":"text","text":"((?:[^"\\]|\\.){1,400})/);
      return { type, timestamp, isSidechain, message: { content: [{ type: 'text', text: `🖼️ ${text || '(attachment)'}` }] } };
    }
    const id = head.match(/"type":"tool_use","id":"([^"]+)"/)?.[1];
    const name = head.match(/"type":"tool_use","id":"[^"]+","name":"([^"]+)"/)?.[1];
    if (!id || !name) return { type, timestamp, isSidechain, message: { content: [] } };
    return { type, timestamp, isSidechain, message: { content: [{ type: 'tool_use', id, name, input: { file_path: grab(head, /"file_path":"((?:[^"\\]|\\.)+)"/) } }] } };
  },

  summary: (st) => {
    const pending = [...st.pending.values()];
    const ask = pending.filter((p) => p.name !== 'Agent' && p.name !== 'Task').at(-1);
    return {
      title: st.title,
      lastPrompt: st.lastPrompt,
      model: st.model,
      branch: st.branch,
      cwd: st.cwd,
      turnStartedAt: st.turnStartedAt,
      lastAt: st.lastAt,
      context: st.context,
      outTokens: st.outTokens,
      helpers: pending.filter((p) => p.name === 'Agent' || p.name === 'Task').length,
      lastMessage: st.lastSay,
      ask: ask ? { kind: ask.kind, text: ask.text } : null,
      activity: st.activity.slice(-MAX_ACTIVITY),
      journal: st.journal,
    };
  },
};

const transcriptPaths = new Map();
async function findTranscript(sessionId, cwd) {
  const projects = path.join(CLAUDE_DIR, 'projects');
  const guess = path.join(projects, String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
  const cached = transcriptPaths.get(sessionId);
  for (const candidate of [cached, guess]) {
    if (!candidate) continue;
    try { await fsp.access(candidate); transcriptPaths.set(sessionId, candidate); return candidate; } catch { /* keep looking */ }
  }
  try {
    for (const dir of await fsp.readdir(projects)) {
      const p = path.join(projects, dir, `${sessionId}.jsonl`);
      try { await fsp.access(p); transcriptPaths.set(sessionId, p); return p; } catch { /* next */ }
    }
  } catch { /* no projects dir */ }
  return null;
}

// A pid can be recycled by the OS, so the registry's procStart is compared
// against the live process start time (once per pid).
const pidVerdicts = new Map();
async function isSameProcess(pid, procStart) {
  try { process.kill(pid, 0); } catch (e) { if (e.code !== 'EPERM') { pidVerdicts.delete(pid); return false; } }
  if (!procStart) return true;
  const known = pidVerdicts.get(pid);
  if (known && known.procStart === procStart) return known.ok;
  let ok = true;
  try {
    // The registry records procStart in UTC; ps prints local time by default.
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const starts = await Promise.all(
      [{ ...process.env, TZ: 'UTC' }, process.env].map((env) =>
        exec('ps', ['-o', 'lstart=', '-p', String(pid)], { env }).then((r) => norm(r.stdout)),
      ),
    );
    ok = starts.includes(norm(procStart));
  } catch { /* ps unavailable: trust kill(0) */ }
  pidVerdicts.set(pid, { procStart, ok });
  return ok;
}

export async function scanClaude(now) {
  const dir = path.join(CLAUDE_DIR, 'sessions');
  let files;
  try { files = await fsp.readdir(dir); } catch { return []; }

  const sessions = [];
  const seenIds = new Set();
  const seenPids = new Set();
  for (const f of files) {
    if (!/^\d+\.json$/.test(f)) continue;
    let reg;
    try { reg = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!reg?.sessionId || !reg.pid) continue;
    seenIds.add(reg.sessionId);
    seenPids.add(reg.pid);
    if (!(await isSameProcess(reg.pid, reg.procStart))) continue;

    const transcript = await findTranscript(reg.sessionId, reg.cwd);
    // An unreadable transcript still leaves the registry entry to show.
    const info = (transcript && (await follow(transcript, claudeReducer).catch(() => null))) || { activity: [] };
    const busy = reg.status === 'busy';
    const lastAt = Math.max(info.lastAt || 0, reg.statusUpdatedAt || 0, reg.updatedAt || 0);

    sessions.push({
      id: `claude:${reg.sessionId}`,
      provider: 'claude',
      pid: reg.pid,
      name: reg.name || '',
      title: info.title || clip(info.lastPrompt, 60) || reg.name || base(reg.cwd),
      cwd: reg.cwd,
      project: base(reg.cwd),
      branch: info.branch || '',
      model: info.model || '',
      status: sessionStatus(busy, lastAt, now),
      rawStatus: reg.status,
      startedAt: reg.startedAt || 0,
      statusSince: reg.statusUpdatedAt || lastAt,
      turnStartedAt: busy ? info.turnStartedAt || reg.statusUpdatedAt || 0 : 0,
      lastActivityAt: lastAt,
      contextTokens: info.context || 0,
      outputTokens: info.outTokens || 0,
      helpers: busy ? info.helpers || 0 : 0,
      entrypoint: reg.entrypoint || '',
      version: reg.version || '',
      lastMessage: info.lastMessage || null,
      ask: busy ? null : info.ask || null,
      activity: info.activity || [],
    });
  }
  pruneMap(transcriptPaths, seenIds);
  pruneMap(pidVerdicts, seenPids);
  return sessions;
}

async function listDir(dir) {
  try { return await fsp.readdir(dir); } catch { return []; }
}

async function mtime(file) {
  try { return (await fsp.stat(file)).mtimeMs; } catch { return 0; }
}

const subagentReducer = { ...claudeReducer, init: () => ({ ...claudeReducer.init(), subagent: true }) };

/**
 * Every session that did something since `since`, running or not. A session's
 * subagents log to their own files; their tokens count toward the session.
 */
export async function claudeToday(since) {
  const projects = path.join(CLAUDE_DIR, 'projects');
  const sessions = [];
  for (const dir of await listDir(projects)) {
    const folder = path.join(projects, dir);
    for (const f of await listDir(folder)) {
      if (!f.endsWith('.jsonl')) continue;
      const file = path.join(folder, f);
      if ((await mtime(file)) < since) continue;
      const info = await follow(file, claudeReducer).catch(() => null);
      if (!info) continue;
      const day = journalSummary(info.journal, since);
      const id = f.slice(0, -'.jsonl'.length);
      let tokens = day.tokens;
      const subDir = path.join(folder, id, 'subagents');
      for (const sub of await listDir(subDir)) {
        const subFile = path.join(subDir, sub);
        if (!sub.endsWith('.jsonl') || (await mtime(subFile)) < since) continue;
        const subInfo = await follow(subFile, subagentReducer).catch(() => null);
        if (subInfo) tokens += journalSummary(subInfo.journal, since).tokens;
      }
      if (!day.turns.length && !tokens) continue;
      sessions.push({
        id: `claude:${id}`,
        provider: 'claude',
        cwd: info.cwd,
        title: info.title || clip(info.lastPrompt, 60) || base(info.cwd),
        lastAt: info.lastAt,
        ...day,
        tokens,
      });
    }
  }
  return sessions;
}

const LIMIT_NAMES = { session: '5h', weekly_all: 'week' };
function limitName(kind) {
  if (LIMIT_NAMES[kind]) return LIMIT_NAMES[kind];
  const m = /^weekly_(\w+)$/.exec(kind || '');
  return m ? `week ${m[1][0].toUpperCase()}${m[1].slice(1)}` : String(kind || '?');
}

// Claude Code only refreshes the snapshot when it fetches your usage (running
// /usage does), and itself stops trusting it after an hour.
const LIMITS_TRUSTED_MS = 3_600_000;

let limitsCache = { key: '', value: null };
/**
 * Your plan's usage limits, as Claude Code last fetched them. It caches them
 * in its global config (cachedUsageUtilization); only that block is read. It's
 * a snapshot: `at` says when it was taken, `staleAt` when to stop trusting it.
 */
export async function claudeLimits() {
  let st;
  try { st = await fsp.stat(CONFIG_FILE); } catch { return null; }
  const key = `${st.mtimeMs}:${st.size}`;
  if (limitsCache.key === key) return limitsCache.value;
  let value = null;
  try {
    const cached = JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8')).cachedUsageUtilization;
    const u = cached?.utilization;
    if (u) {
      const windows = Array.isArray(u.limits) && u.limits.length
        ? u.limits.map((l) => ({ name: limitName(l.kind), usedPercent: Number(l.percent) || 0, resetsAt: Date.parse(l.resets_at) || 0 }))
        : [['5h', u.five_hour], ['week', u.seven_day]].filter(([, w]) => w).map(([name, w]) => ({ name, usedPercent: Number(w.utilization) || 0, resetsAt: Date.parse(w.resets_at) || 0 }));
      const at = Number(cached.fetchedAtMs) || 0;
      value = { at, staleAt: at + LIMITS_TRUSTED_MS, live: false, windows };
    }
  } catch { /* caught mid-write: the next change retries */ }
  limitsCache = { key, value };
  return value;
}
