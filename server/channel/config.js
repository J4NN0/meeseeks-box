// What the channel process (mcp-server.js) and the box's end of it
// (client.js) agree on. Kept free of the box's other modules, since Claude
// Code runs mcp-server.js on its own.

import os from 'node:os';
import path from 'node:path';

/**
 * Where the channel opens a socket for each Claude Code session it runs in,
 * named after the session's pid. Only you can open it.
 */
export const CHANNEL_DIR = process.env.MEESEEKS_CHANNEL_DIR || path.join(os.homedir(), '.meeseeks-box', 'channels');
export const channelSocket = (pid) => path.join(CHANNEL_DIR, `${pid}.sock`);
/** The socket of a session the box started itself (../meeseeks.js), named after its session id. */
export const boxSocket = (sessionId) => path.join(CHANNEL_DIR, `box-${sessionId}.sock`);
/** The channel's name in Claude Code's MCP config, as bin/claude-box sets it up. */
export const CHANNEL_NAME = 'meeseeks';
/** The longest prompt you can send a session from the box. */
export const MAX_TEXT = 20_000;
/**
 * The longest line either end reads off the socket. A prompt of MAX_TEXT
 * characters fits even if JSON escapes every one of them (6x, for control
 * characters); a longer line is dropped whole.
 */
export const MAX_LINE = MAX_TEXT * 6 + 4096;
