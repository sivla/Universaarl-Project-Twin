import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { productionRegistry } from './src/projects/registry';
import { dispatchProjectApi } from './src/server/api';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const registry = productionRegistry(env.UABC_SOURCE_REPO || path.resolve('.uabc-source-not-configured'));
  return {
    plugins: [react(), {
      name: 'uabc-project-scoped-read-only-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
            if (!pathname.startsWith('/api/')) return next();
            const result = await dispatchProjectApi(req.method || 'GET', pathname, registry);
            res.statusCode = result.status; res.setHeader('Cache-Control', 'no-store');
            if (result.binary) { res.setHeader('Content-Type', result.binary.contentType); res.setHeader('Content-Length', result.binary.bytes.length); res.end(result.binary.bytes); return; }
            res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(result.body));
          } catch {
            if (!(req.url || '').startsWith('/api/')) return next();
            res.statusCode = 500; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"code":"API_NICHT_VERFUEGBAR"}');
          }
        });
      },
    }],
    server: { host: '127.0.0.1', port: 4173, strictPort: true },
    test: { testTimeout: 20_000 },
  };
});
