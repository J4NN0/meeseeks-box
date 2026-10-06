// Discovers running Claude Code and Codex sessions on this machine and
// summarises what each one is doing. Read-only: it never writes to either
// tool's state directory. Each provider lives in ./providers. A session
// started with the box's channel (bin/claude-box) also gets `talk`, and so
// does every Meeseeks the box made itself (./meeseeks.js).

import { syncChannels } from './channel/client.js';
import { pruneLogs } from './follow.js';
import { boxSessionIds, boxSessions } from './meeseeks.js';
import { scanClaude } from './providers/claude.js';
import { scanCodex } from './providers/codex.js';

/**
 * Every running session, and each one's conversation (`chats`, by session
 * id), kept apart since only the agent panel asks for it. `latest()` says
 * whether a newer scan has started since, see syncChannels.
 */
export async function scanSessions(latest = () => true) {
  const now = Date.now();
  const [registered, codex, box] = await Promise.all([
    scanClaude(now, boxSessionIds()).catch((e) => { console.warn('[meeseeks] claude scan failed:', e.message); return []; }),
    scanCodex(now).catch((e) => { console.warn('[meeseeks] codex scan failed:', e.message); return []; }),
    boxSessions(now).catch((e) => { console.warn('[meeseeks] box scan failed:', e.message); return []; }),
  ]);
  pruneLogs();
  const claude = [...registered, ...box];
  syncChannels(claude, now, latest());
  // You talk to the box's own through the box, linked up or not.
  for (const s of box) s.talk = { enabled: true, permission: s.talk?.permission || null };
  const chats = new Map();
  const sessions = [...claude, ...codex]
    .map(({ chat, ...s }) => {
      chats.set(s.id, chat || []);
      return s;
    })
    .sort((a, b) => a.startedAt - b.startedAt);
  return { now, sessions, chats };
}
