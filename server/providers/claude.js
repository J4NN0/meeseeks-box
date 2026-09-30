// Claude Code keeps a live registry at ~/.claude/sessions/<pid>.json with a
// busy/idle status; the transcript lives in ~/.claude/projects/<cwd>/<id>.jsonl.

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { follow } from '../follow.js';
import { MAX_ACTIVITY, base, clip, grab, ms, pruneMap, pushActivity, sessionStatus } from '../util.js';

const exec = promisify(execFile);
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

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

// Harness-injected parts (reminders, command echoes) are not the user talking.
function userText(content) {
  const parts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((c) => c?.type === 'text').map((c) => c.text) : [];
  return parts.map((t) => String(t).trim()).filter((t) => t && !NOISE.test(t)).join(' ');
}

export const claudeReducer = {
  init: () => ({ activity: [], pending: new Map(), title: '', lastPrompt: '', model: '', branch: '', turnStartedAt: 0, lastAt: 0, context: 0, outTokens: 0 }),

  feed(st, r) {
    const ts = ms(r.timestamp);
    if (ts) st.lastAt = Math.max(st.lastAt, ts);
    if (r.gitBranch) st.branch = r.gitBranch;
    if (r.type === 'ai-title' && r.aiTitle) st.title = r.aiTitle;
    if (r.type === 'last-prompt' && r.lastPrompt) st.lastPrompt = r.lastPrompt;

    if (r.type === 'user' && r.message) {
      const c = r.message.content;
      if (Array.isArray(c)) for (const part of c) if (part?.type === 'tool_result') st.pending.delete(part.tool_use_id);
      const text = userText(c).trim();
      if (text && !r.isMeta && !r.isCompactSummary) {
        st.turnStartedAt = ts || st.turnStartedAt;
        pushActivity(st.activity, { ts, kind: 'prompt', icon: '🧑', text: clip(text, 160) });
      }
    }

    if (r.type === 'assistant' && r.message) {
      const m = r.message;
      if (m.model && !m.model.startsWith('<')) st.model = m.model;
      if (m.usage) {
        const u = m.usage;
        st.context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        st.outTokens += u.output_tokens || 0;
      }
      for (const part of m.content || []) {
        if (part.type === 'thinking') pushActivity(st.activity, { ts, kind: 'think', icon: '🤔', text: 'Thinking…' });
        else if (part.type === 'text' && part.text?.trim()) pushActivity(st.activity, { ts, kind: 'say', icon: '💬', text: clip(part.text, 160) });
        else if (part.type === 'tool_use') {
          st.pending.set(part.id, part.name);
          pushActivity(st.activity, { ts, kind: 'tool', tool: part.name, ...describeTool(part.name, part.input) });
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
    const timestamp = line.slice(-1000).match(/"timestamp":"([^"]+)"/)?.[1];
    if (type === 'user') {
      const ids = [...line.matchAll(/"tool_use_id":"([^"]+)"/g)].map((m) => ({ type: 'tool_result', tool_use_id: m[1] }));
      if (ids.length) return { type, timestamp, message: { content: ids } };
      const text = grab(head, /"type":"text","text":"((?:[^"\\]|\\.){1,400})/);
      return { type, timestamp, message: { content: [{ type: 'text', text: `🖼️ ${text || '(attachment)'}` }] } };
    }
    const id = head.match(/"type":"tool_use","id":"([^"]+)"/)?.[1];
    const name = head.match(/"type":"tool_use","id":"[^"]+","name":"([^"]+)"/)?.[1];
    if (!id || !name) return { type, timestamp, message: { content: [] } };
    return { type, timestamp, message: { content: [{ type: 'tool_use', id, name, input: { file_path: grab(head, /"file_path":"((?:[^"\\]|\\.)+)"/) } }] } };
  },

  summary: (st) => ({
    title: st.title,
    lastPrompt: st.lastPrompt,
    model: st.model,
    branch: st.branch,
    turnStartedAt: st.turnStartedAt,
    lastAt: st.lastAt,
    context: st.context,
    outTokens: st.outTokens,
    helpers: [...st.pending.values()].filter((n) => n === 'Agent' || n === 'Task').length,
    activity: st.activity.slice(-MAX_ACTIVITY),
  }),
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
      activity: info.activity || [],
    });
  }
  pruneMap(transcriptPaths, seenIds);
  pruneMap(pidVerdicts, seenPids);
  return sessions;
}
