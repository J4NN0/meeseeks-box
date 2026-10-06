#!/usr/bin/env node
// The Meeseeks Box channel. Claude Code starts one of these, as an MCP server
// on stdio, in each session you open with bin/claude-box. It lets the box talk
// to that session: what you type in the agent's panel arrives in the session
// as your next prompt, and the session's permission prompts reach the box, so
// you can allow or deny them there as well as in the terminal.
// See https://code.claude.com/docs/en/channels-reference
//
// The box (client.js) connects to a socket named after the session's pid
// (CHANNEL_DIR in config.js), which only you can open, and speaks newline-delimited JSON:
//   box → here:  { type: 'say', id, text }
//                { type: 'verdict', request_id, behavior: 'allow' | 'deny' }
//   here → box:  { type: 'hello', pid, enabled }
//                { type: 'sent', id }  once a message is handed to Claude Code
//                { type: 'permission', request_id, tool_name, description, input_preview, at, held? }
//                  (held: only the box can answer it, see below)
//                { type: 'settled', request_id }  once a verdict is handed over
//
// A session the box starts itself (../meeseeks.js) has no terminal: there
// the box runs this with MEESEEKS_SOCKET set, as its permission prompt tool
// (`approve`) rather than as a channel, and every prompt waits for the box,
// unless the box is gone (MEESEEKS_BOX_PID) or can't reach the socket.
//
// stdout is the MCP transport: nothing else may be written to it.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CHANNEL_DIR, CHANNEL_NAME, MAX_LINE, MAX_TEXT, channelSocket } from './config.js';

const exec = promisify(execFile);
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const VERSION = '0.1.0';
// Revisions we speak. Claude Code doesn't register a channel that negotiates
// 2026-07-28, so that one stays off the list.
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const REQUEST_ID = /^[a-km-z]{5}$/;
const MAX_OPEN = 8;
/** Set by the box for a session it started: where to listen, and that we're its permission tool. */
const BOX_SOCKET = process.env.MEESEEKS_SOCKET || '';
/** The box's server, which answers the prompts of a session it started. */
const BOX_PID = Number(process.env.MEESEEKS_BOX_PID) || 0;
/** The most of a tool's input a prompt carries: the panel shows less still. */
const MAX_PREVIEW = 4000;

const INSTRUCTIONS = [
  `Messages from the Meeseeks Box arrive as <channel source="${CHANNEL_NAME}">.`,
  'The Meeseeks Box is a dashboard on this machine that shows this session, and each message is from the user, typed there instead of in this terminal.',
  'Treat it as the user\'s next prompt and answer here in the session as usual: there is no reply tool, the box reads your answer from the session.',
].join(' ');

const log = (...args) => console.error('[meeseeks channel]', ...args);

// MCP over stdio ------------------------------------------------------------

let ready = false; // Claude Code sent `initialized`
const queue = []; // notifications waiting for it

function write(msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
}

function notify(method, params) {
  if (ready) write({ method, params });
  else queue.push({ method, params });
}

function onRequest({ id, method, params }) {
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    write({
      id,
      result: {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: BOX_SOCKET ? { tools: {} } : { experimental: { 'claude/channel': {}, 'claude/channel/permission': {} } },
        serverInfo: { name: CHANNEL_NAME, title: 'Meeseeks Box', version: VERSION },
        ...(BOX_SOCKET ? {} : { instructions: INSTRUCTIONS }),
      },
    });
  } else if (method === 'ping') {
    write({ id, result: {} });
  } else if (BOX_SOCKET && method === 'tools/list') {
    write({ id, result: { tools: [APPROVE] } });
  } else if (BOX_SOCKET && method === 'tools/call' && params?.name === APPROVE.name) {
    approve(params.arguments || {}).then((verdict) => write({ id, result: { content: [{ type: 'text', text: JSON.stringify(verdict) }] } }));
  } else {
    write({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function onNotification({ method, params }) {
  if (method === 'notifications/initialized') {
    ready = true;
    for (const n of queue.splice(0)) write(n);
  } else if (method === 'notifications/claude/channel/permission_request') {
    permissionAsked(params || {});
  }
}

let carry = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  const lines = (carry + chunk).split('\n');
  carry = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log('bad JSON from Claude Code'); continue; }
    if (msg.method && msg.id !== undefined) onRequest(msg);
    else if (msg.method) onNotification(msg);
  }
});
// Claude Code closes our stdin when the session ends.
process.stdin.on('end', () => process.exit(0));

// Permission prompts -----------------------------------------------------------

/** Prompts relayed to us that nobody has answered from the box yet. */
const open = new Map();

function permissionAsked(p) {
  if (!REQUEST_ID.test(p.request_id || '')) return;
  const ask = {
    type: 'permission',
    request_id: p.request_id,
    tool_name: String(p.tool_name || ''),
    description: String(p.description || ''),
    input_preview: String(p.input_preview || ''),
    at: Date.now(),
  };
  open.set(ask.request_id, ask);
  // Claude Code doesn't tell us about prompts answered in the terminal.
  while (open.size > MAX_OPEN) open.delete(open.keys().next().value);
  broadcast(ask);
}

// The permission prompt tool ---------------------------------------------------

const APPROVE = {
  name: 'approve',
  description: 'Asks the user, in the Meeseeks Box, whether a tool may run.',
  inputSchema: {
    type: 'object',
    properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
    required: ['tool_name', 'input'],
  },
};

const verdicts = new Map(); // request id → answer(behavior, why), until the box answers
let unreachable = ''; // why the box can't answer, once it can't

/** What Claude Code shows in its own prompt, near enough. */
function preview(tool, input) {
  const cap = (text) => String(text || '').slice(0, MAX_PREVIEW);
  if (tool === 'Bash') return { description: cap(input.description), input_preview: cap(input.command) };
  return { description: '', input_preview: cap(JSON.stringify(input, null, 2)) };
}

function requestId() {
  const letters = 'abcdefghijkmnopqrstuvwxyz';
  let id;
  do id = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (open.has(id));
  return id;
}

/** Waits for the box to allow or deny, however long that takes: there's no terminal to answer instead. */
function approve({ tool_name: tool = '', input = {} }) {
  if (unreachable) return Promise.resolve({ behavior: 'deny', message: unreachable });
  const ask = { type: 'permission', request_id: requestId(), tool_name: String(tool), ...preview(tool, input || {}), at: Date.now(), held: true };
  open.set(ask.request_id, ask);
  broadcast(ask);
  return new Promise((resolve) => {
    verdicts.set(ask.request_id, (behavior, why = 'The user said no, in the Meeseeks Box.') => resolve(behavior === 'allow'
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: why }));
  });
}

/** Nobody will answer from the box: refuses what waits for it, and whatever is asked from now on. */
function giveUp(why) {
  if (unreachable) return;
  unreachable = why;
  for (const [id, answer] of verdicts) {
    open.delete(id);
    answer('deny', why);
  }
  verdicts.clear();
}

/** The box can't open our socket, so it won't see a prompt to answer. */
function unlinked(e) {
  if (BOX_SOCKET) giveUp(`The Meeseeks Box can’t reach this session (${e.message}), so nobody can say yes.`);
}

if (BOX_PID) {
  setInterval(() => {
    try { process.kill(BOX_PID, 0); } catch (e) { if (e.code === 'ESRCH') giveUp('The Meeseeks Box has closed, so nobody can say yes.'); }
  }, 5000).unref();
}

// The box's side -------------------------------------------------------------

const boxes = new Set();

function broadcast(msg) {
  const line = JSON.stringify(msg) + '\n';
  for (const socket of boxes) socket.write(line);
}

function fromBox(socket, msg) {
  if (msg.type === 'say') {
    const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return;
    notify('notifications/claude/channel', { content: text });
    socket.write(JSON.stringify({ type: 'sent', id: msg.id }) + '\n');
  } else if (msg.type === 'verdict') {
    const { request_id, behavior } = msg;
    // Claude Code drops a verdict it didn't ask for; so do we.
    if (!open.has(request_id) || (behavior !== 'allow' && behavior !== 'deny')) return;
    open.delete(request_id);
    if (verdicts.has(request_id)) {
      verdicts.get(request_id)(behavior);
      verdicts.delete(request_id);
    } else notify('notifications/claude/channel/permission', { request_id, behavior });
    broadcast({ type: 'settled', request_id });
  }
}

/**
 * The Claude Code process we run under: our parent, or one a step or two up
 * if something sits in between. Its pid names the session's entry in
 * ~/.claude/sessions, which is how the box tells which session we belong to.
 */
async function sessionPid() {
  const registered = (pid) => fs.existsSync(path.join(CLAUDE_DIR, 'sessions', `${pid}.json`));
  for (let attempt = 0; attempt < 10; attempt++) {
    let pid = process.ppid;
    for (let hop = 0; hop < 4 && pid > 1; hop++) {
      if (registered(pid)) return pid;
      try { pid = Number((await exec('ps', ['-o', 'ppid=', '-p', String(pid)])).stdout.trim()); } catch { break; }
    }
    // Claude Code may write its entry after starting us.
    await new Promise((r) => setTimeout(r, 500));
  }
  return process.ppid;
}

/** Whether Claude Code was started with this channel switched on: without it, it drops what we send. */
async function switchedOn(pid) {
  try {
    const { stdout } = await exec('ps', ['-ww', '-o', 'command=', '-p', String(pid)]);
    return /--(?:dangerously-load-development-)?channels\b/.test(stdout) && stdout.includes(`server:${CHANNEL_NAME}`);
  } catch {
    return true; // can't tell: assume it's on
  }
}

async function listen() {
  const pid = BOX_SOCKET ? process.ppid : await sessionPid();
  const enabled = BOX_SOCKET ? true : await switchedOn(pid);
  await fsp.mkdir(CHANNEL_DIR, { recursive: true, mode: 0o700 });
  await fsp.chmod(CHANNEL_DIR, 0o700);
  const file = BOX_SOCKET || channelSocket(pid);
  // Left over from a session that crashed, or a pid the OS reused.
  await fsp.rm(file, { force: true });

  const server = net.createServer((socket) => {
    boxes.add(socket);
    socket.setEncoding('utf8');
    socket.write(JSON.stringify({ type: 'hello', pid, enabled }) + '\n');
    for (const ask of open.values()) socket.write(JSON.stringify(ask) + '\n');
    let rest = '';
    let skipping = false; // in a line too long to take, dropped up to its end
    socket.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop();
      if (skipping && lines.length) {
        lines.shift();
        skipping = false;
      }
      if (skipping) rest = '';
      else if (rest.length > MAX_LINE) {
        rest = '';
        skipping = true;
      }
      for (const line of lines) {
        if (line.length > MAX_LINE) continue;
        try { fromBox(socket, JSON.parse(line)); } catch { /* not JSON: ignore it */ }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => boxes.delete(socket));
  });
  server.on('error', (e) => {
    log('socket failed:', e.message);
    unlinked(e);
  });
  server.listen(file, () => {
    fs.chmodSync(file, 0o600);
    log(`listening on ${file}${enabled ? '' : ' (but the session was started without the channel flag)'}`);
  });
  process.on('exit', () => {
    try { fs.rmSync(file, { force: true }); } catch { /* already gone */ }
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(0));
listen().catch((e) => {
  log('could not start:', e.message);
  unlinked(e);
});
