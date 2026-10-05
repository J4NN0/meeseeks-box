// The conversation, for the agent panel: what you said, what the agent said
// back, and what it did in between (the files it edited, the commands it
// ran). Kept next to each provider's live summary; the panel reads it
// through /api/chat.

import { base } from './util.js';

const MAX_ENTRIES = 40;
const MAX_TEXT = 6000;
const MAX_FILES = 12;

export function newChat() {
  return { list: [], did: null };
}

/** Long text cut down, keeping its lines (unlike util's clip). */
function trimText(text) {
  const t = String(text || '').trim();
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1)}…` : t;
}

// A message pushed in through a channel, the box's own included.
const CHANNEL = /^<channel\s+source="([^"]*)"[^>]*>\n?([\s\S]*?)\n?<\/channel>\s*$/;

/** A channel message's text and where it came from, or null if `text` isn't one. */
export function channelMessage(text) {
  const m = CHANNEL.exec(String(text || '').trim());
  return m ? { source: m[1], text: m[2].trim() } : null;
}

function push(chat, entry) {
  chat.list.push(entry);
  if (chat.list.length > MAX_ENTRIES * 2) chat.list.splice(0, chat.list.length - MAX_ENTRIES);
}

/** What the agent did since your last prompt, closed off as an entry of its own. */
function closeDid(chat) {
  if (chat.did) push(chat, didEntry(chat.did));
  chat.did = null;
}

function didEntry(did) {
  return { ts: did.ts, who: 'did', files: [...did.files].slice(-MAX_FILES), moreFiles: Math.max(0, did.files.size - MAX_FILES), commands: did.commands, steps: did.steps };
}

/** You sent a prompt; `via` names the channel it came through, if any. */
export function noteYou(chat, ts, text, via = '') {
  closeDid(chat);
  push(chat, { ts, who: 'you', text: trimText(text), ...(via ? { via } : {}) });
}

export function noteAgent(chat, ts, text) {
  push(chat, { ts, who: 'agent', text: trimText(text) });
}

/** The agent used a tool: the `files` it edited, and whether it ran a `command`. */
export function noteStep(chat, ts, { files = [], command = false } = {}) {
  chat.did ||= { ts, files: new Set(), commands: 0, steps: 0 };
  const did = chat.did;
  did.ts = ts || did.ts;
  did.steps++;
  if (command) did.commands++;
  for (const file of files) {
    const name = base(file);
    did.files.delete(name);
    did.files.add(name);
  }
}

/** The last entries, with what the agent has done so far this turn at the end. */
export function chatSummary(chat) {
  const list = chat.list.slice(-MAX_ENTRIES);
  return chat.did ? [...list, didEntry(chat.did)] : list;
}
