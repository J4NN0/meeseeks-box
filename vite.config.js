import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.js';

// The session scanner runs inside the Vite dev server, so `npm run dev` is
// all you need. `npm run serve` builds and uses the standalone server instead.
const meeseeksApi = {
  name: 'meeseeks-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware());
  },
};

export default defineConfig({
  plugins: [meeseeksApi],
  server: { host: '127.0.0.1', port: 5199 },
  preview: { host: '127.0.0.1', port: 5199 },
  // three.js alone is ~600 kB; one chunk is fine for a local dashboard.
  build: { chunkSizeWarningLimit: 900 },
});
