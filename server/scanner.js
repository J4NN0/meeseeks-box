// Discovers running Claude Code and Codex sessions on this machine and
// summarises what each one is doing. Read-only: it never writes to either
// tool's state directory. Each provider lives in ./providers.

import { pruneLogs } from './follow.js';
import { scanClaude } from './providers/claude.js';
import { scanCodex } from './providers/codex.js';

export async function scanSessions() {
  const now = Date.now();
  const [claude, codex] = await Promise.all([
    scanClaude(now).catch((e) => { console.warn('[meeseeks] claude scan failed:', e.message); return []; }),
    scanCodex(now).catch((e) => { console.warn('[meeseeks] codex scan failed:', e.message); return []; }),
  ]);
  pruneLogs();
  const sessions = [...claude, ...codex].sort((a, b) => a.startedAt - b.startedAt);
  return { now, sessions };
}
