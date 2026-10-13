#!/usr/bin/env node
// `npx @j4nn0/meeseeks-box`: the standalone server (index.js), plus opening the
// office in your browser once it's up. `--no-open` skips the browser. The
// published package ships dist/ already built, so there's nothing to build.

import { execFile } from 'node:child_process';

const { server } = await import('./index.js');

server.once('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`The port is taken (another Meeseeks Box?). Pick another: PORT=5200 npx @j4nn0/meeseeks-box`);
  process.exit(1);
});

server.once('listening', () => {
  if (process.argv.includes('--no-open')) return;
  const { address, port } = server.address();
  const url = `http://${address.includes(':') ? `[${address}]` : address}:${port}`;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  // No browser to open (a server, SSH): the URL is printed above anyway.
  execFile(cmd, args, () => {});
});
