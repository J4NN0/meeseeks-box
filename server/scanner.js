// Discovers running Claude Code and Codex sessions on this machine and
// summarises what each one is doing. Read-only: it never writes to either
// tool's state directory. Each provider lives in ./providers. A session
// started with the box's channel (bin/claude-box) also gets `talk`.

import { syncChannels } from './channel/client.js';
import { pruneLogs } from './follow.js';
import { scanClaude } from './providers/claude.js';
import { scanCodex } from './providers/codex.js';

/**
 * Every running session, and each one's conversation (`chats`, by session
 * id), kept apart since only the agent panel asks for it.
 */
export async function scanSessions() {
  const now = Date.now();
  const [claude, codex] = await Promise.all([
    scanClaude(now).catch((e) => { console.warn('[meeseeks] claude scan failed:', e.message); return []; }),
    scanCodex(now).catch((e) => { console.warn('[meeseeks] codex scan failed:', e.message); return []; }),
  ]);
  pruneLogs();
  syncChannels(claude, now);
  const chats = new Map();
  const sessions = [...claude, ...codex]
    .map(({ chat, ...s }) => {
      chats.set(s.id, chat || []);
      return s;
    })
    .sort((a, b) => a.startedAt - b.startedAt);
  return { now, sessions, chats };
}
