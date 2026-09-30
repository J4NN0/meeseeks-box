// What happened since midnight, for the whiteboard (per-project recap and a
// timeline of turns) and the TV (usage limits and tokens). Sessions that
// already ended count too. Projects are grouped by git repository, or by
// directory outside one.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { startOfDay } from './journal.js';
import { claudeLimits, claudeToday } from './providers/claude.js';
import { codexToday } from './providers/codex.js';
import { repoRoot, repoState } from './git.js';
import { base } from './util.js';

// git reports the real path (/private/tmp, not /tmp); a session keeps the
// path it was started in. Edits are matched against the resolved one.
const realDir = (dir) => fsp.realpath(dir).catch(() => dir);

const inside = (rel) => rel && !rel.startsWith('..') && !path.isAbsolute(rel);

/** `file` relative to the project `key`, or null when it's outside. */
function projectPath(key, s, file) {
  const abs = path.resolve(s.cwd || key, file);
  const rel = path.relative(key, abs);
  if (inside(rel)) return rel;
  if (!s.cwd) return null;
  // Written under the session's unresolved cwd: rebase onto the real one.
  const rebased = path.relative(key, path.join(s.realCwd, path.relative(s.cwd, abs)));
  return inside(rebased) ? rebased : null;
}

const latest = (items) => items.filter(Boolean).sort((a, b) => b.ts - a.ts)[0] || null;

export async function scanToday() {
  const now = Date.now();
  const since = startOfDay(now);
  const [claude, codex, claudeLimit] = await Promise.all([
    claudeToday(since).catch((e) => { console.warn('[meeseeks] claude day scan failed:', e.message); return []; }),
    codexToday(since, now).catch((e) => { console.warn('[meeseeks] codex day scan failed:', e.message); return { sessions: [], limits: null }; }),
    claudeLimits().catch(() => null),
  ]);
  const sessions = [...claude, ...codex.sessions];

  const groups = new Map();
  for (const s of sessions) {
    const root = s.cwd ? await repoRoot(s.cwd) : null;
    s.realCwd = root ? await realDir(s.cwd) : s.cwd;
    const key = root || s.cwd || '';
    s.projectKey = key;
    if (!groups.has(key)) groups.set(key, { key, root, sessions: [] });
    groups.get(key).sessions.push(s);
  }

  const projects = await Promise.all([...groups.values()].map(async (g) => {
    const repo = g.root ? await repoState(g.root, since).catch(() => null) : null;
    // Files the agents edited, relative to the project, with who touched them.
    const edited = new Map();
    for (const s of g.sessions) {
      for (const e of s.edits) {
        const rel = projectPath(g.key, s, e.file);
        if (!rel) continue;
        const prev = edited.get(rel) || { path: rel, ts: 0, by: [] };
        prev.ts = Math.max(prev.ts, e.ts);
        if (!prev.by.includes(s.id)) prev.by.push(s.id);
        edited.set(rel, prev);
      }
    }
    const changes = repo?.changes && {
      ...repo.changes,
      list: repo.changes.list.map((f) => ({ ...f, by: edited.get(f.path)?.by || [] })),
    };
    return {
      key: g.key,
      name: base(g.key) || 'unknown',
      repo: !!g.root,
      branch: repo?.branch || '',
      changes: changes || null,
      commits: repo?.commits || [],
      edited: [...edited.values()].sort((a, b) => b.ts - a.ts),
      test: latest(g.sessions.flatMap((s) => s.tests.map((t) => ({ ...t, sessionId: s.id })))),
      recap: latest(g.sessions.map((s) => s.recap && { ...s.recap, sessionId: s.id })),
      sessionIds: g.sessions.map((s) => s.id),
      lastAt: Math.max(...g.sessions.map((s) => s.lastAt || 0)),
    };
  }));
  projects.sort((a, b) => b.lastAt - a.lastAt);

  const tokens = { claude: 0, codex: 0 };
  for (const s of sessions) tokens[s.provider] += s.tokens || 0;

  return {
    now,
    since,
    sessions: sessions
      .map(({ edits, tests, cwd, realCwd, ...s }) => ({ ...s, project: base(s.projectKey), edits: edits.length, test: tests.at(-1) || null }))
      .sort((a, b) => b.lastAt - a.lastAt),
    projects,
    tokens,
    limits: { claude: claudeLimit, codex: codex.limits },
  };
}
