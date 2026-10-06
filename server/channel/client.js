// The box's end of the channel (mcp-server.js): a link to each running Claude
// Code session that has one, over the socket it opened. Through it you send
// the session a prompt, and see and answer its permission prompts.

import fs from 'node:fs';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../util.js';
import { MAX_TEXT, boxSocket, channelSocket } from './config.js';

const RETRY_MS = 3000;
// A Meeseeks from the box opens its socket at the start of each turn: look again soon.
const BOX_RETRY_MS = 500;
const SENT_TIMEOUT_MS = 3000;
// Permission prompts answered in the terminal: the session moved on.
const SETTLE_GRACE_MS = 2500;

class Link {
  constructor(pid, file) {
    this.pid = pid;
    this.ready = false;
    this.enabled = false;
    this.closed = false;
    this.permissions = new Map();
    this.waiting = new Map(); // message id → resolve, until the channel has it
    this.socket = net.createConnection(file);
    this.socket.setEncoding('utf8');
    let carry = '';
    this.socket.on('data', (chunk) => {
      const lines = (carry + chunk).split('\n');
      carry = lines.pop();
      for (const line of lines) {
        try { this.receive(JSON.parse(line)); } catch { /* not JSON: ignore it */ }
      }
    });
    this.socket.on('error', () => {});
    this.socket.on('close', () => {
      this.ready = false;
      this.closed = true;
      for (const done of this.waiting.values()) done(false);
      this.waiting.clear();
    });
  }

  receive(msg) {
    if (msg.type === 'hello') {
      this.ready = true;
      this.enabled = msg.enabled !== false;
    } else if (msg.type === 'permission') {
      this.permissions.set(msg.request_id, msg);
    } else if (msg.type === 'settled') {
      this.permissions.delete(msg.request_id);
    } else if (msg.type === 'sent') {
      this.waiting.get(msg.id)?.(true);
      this.waiting.delete(msg.id);
    }
  }

  send(msg) {
    this.socket.write(JSON.stringify(msg) + '\n');
  }

  /** Resolves true once the channel has handed `text` to Claude Code. */
  say(text) {
    const id = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.waiting.delete(id); resolve(false); }, SENT_TIMEOUT_MS);
      this.waiting.set(id, (ok) => { clearTimeout(timer); resolve(ok); });
      this.send({ type: 'say', id, text });
    });
  }

  close() {
    this.socket.destroy();
  }
}

const links = new Map(); // pid → Link
const retryAt = new Map(); // pid → when to look for its socket again
const sessionPids = new Map(); // session id → pid, as of the last scan

/**
 * Whether a permission prompt was answered without us (in the terminal):
 * never, for a session the box started (`held`: it has no terminal); else
 * the transcript moved on (the tool ran, or was refused), the session's
 * status changed while it works, or it's idle with no tool call waiting.
 */
function settled(p, session, now) {
  if (p.held) return false;
  if (session.transcriptAt > p.at) return true;
  if (session.rawStatus === 'busy') return session.statusSince > p.at;
  return session.ask?.kind !== 'tool' && now - p.at > SETTLE_GRACE_MS;
}

/** The permission prompt still open, if the session is still stuck on it. */
function openPermission(link, session, now) {
  let latest = null;
  for (const [id, p] of link.permissions) {
    if (settled(p, session, now)) link.permissions.delete(id);
    else if (!latest || p.at > latest.at) latest = p;
  }
  return latest && { requestId: latest.request_id, tool: latest.tool_name, description: latest.description, input: latest.input_preview, at: latest.at };
}

/**
 * Links up with the channel of every Claude Code session that has one, and
 * notes on each session whether you can talk to it (`talk`). A scan overtaken
 * by a newer one (`latest` false) may have missed sessions, so it closes no links.
 */
export function syncChannels(sessions, now = Date.now(), latest = true) {
  const seen = new Set();
  if (latest) sessionPids.clear();
  for (const s of sessions) {
    if (s.provider !== 'claude' || !s.pid) continue;
    seen.add(s.pid);
    if (latest) sessionPids.set(s.id, s.pid);
    let link = links.get(s.pid);
    if (link?.closed) {
      links.delete(s.pid);
      link = null;
    }
    if (!link && now >= (retryAt.get(s.pid) || 0)) {
      retryAt.set(s.pid, now + (s.box ? BOX_RETRY_MS : RETRY_MS));
      const file = s.box ? boxSocket(s.box.sessionId) : channelSocket(s.pid);
      if (fs.existsSync(file)) links.set(s.pid, (link = new Link(s.pid, file)));
    }
    s.talk = link?.ready ? { enabled: link.enabled, permission: openPermission(link, s, now) } : null;
  }
  if (!latest) return;
  for (const [pid, link] of links) {
    if (seen.has(pid)) continue;
    link.close();
    links.delete(pid);
  }
  for (const pid of retryAt.keys()) if (!seen.has(pid)) retryAt.delete(pid);
}

function linkFor(id) {
  const link = links.get(sessionPids.get(id));
  return link?.ready ? link : null;
}

/** Sends `text` to the session as your next prompt. */
export async function talk({ id, text }) {
  const link = linkFor(id);
  if (!link) throw new HttpError(409, "This session isn't connected to the box.");
  if (!link.enabled) throw new HttpError(409, 'This session was started without the channel switched on.');
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message) throw new HttpError(400, 'Nothing to send.');
  if (message.length > MAX_TEXT) throw new HttpError(413, 'That message is too long.');
  if (!(await link.say(message))) throw new HttpError(504, "The session didn't take the message.");
  return { ok: true };
}

/** Allows or denies the permission prompt `requestId`. */
export function decide({ id, requestId, behavior }) {
  const link = linkFor(id);
  if (!link) throw new HttpError(409, "This session isn't connected to the box.");
  if (behavior !== 'allow' && behavior !== 'deny') throw new HttpError(400, 'Allow or deny?');
  if (!link.permissions.has(requestId)) throw new HttpError(410, 'That prompt has already been answered.');
  link.send({ type: 'verdict', request_id: requestId, behavior });
  link.permissions.delete(requestId);
  return { ok: true };
}
