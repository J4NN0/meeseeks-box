import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.js';
import { keyLink } from './server/key.js';
import { stopAll } from './server/meeseeks.js';

/** Print links under Vite's actual local URL, including any fallback port. */
function printLinks(server, { debugSample = false } = {}) {
  const printUrls = server.printUrls;
  server.printUrls = () => {
    printUrls.call(server);
    const url = server.resolvedUrls?.local[0];
    if (!url) return;
    if (debugSample) server.config.logger.info(`  ➜  Debug:   ${new URL('?debug=true&sim=1&hideSim=false', url)}`);
    server.config.logger.info(`  ➜  Key:     ${keyLink(url)} (only if a browser can’t summon Meeseeks)`);
  };
}

// The session scanner runs inside the Vite dev server, so `npm run dev` is
// all you need. `npm run serve` builds and uses the standalone server instead.
// The Meeseeks the box started stop with the server, restarts included: a
// restart closes the old server, and the reloaded config forgets them.
const meeseeksApi = {
  name: 'meeseeks-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware());
    printLinks(server, { debugSample: true });
    server.httpServer?.once('close', stopAll);
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware());
    printLinks(server);
    server.httpServer.once('close', stopAll);
  },
};

export default defineConfig({
  plugins: [meeseeksApi],
  server: { host: '127.0.0.1', port: 5199 },
  preview: { host: '127.0.0.1', port: 5199 },
  // three.js alone is ~600 kB; one chunk is fine for a local dashboard.
  build: { chunkSizeWarningLimit: 900 },
});
