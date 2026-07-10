import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createTwinState, resolveEvidencePath } from './src/server/adapter';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const source = env.UABC_SOURCE_REPO || '';
  return {
    plugins: [react(), {
      name: 'uabc-read-only-source',
      configureServer(server) {
        server.middlewares.use('/api/project-state', async (_req, res) => {
          try { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(await createTwinState(source))); }
          catch (error) { res.statusCode = 422; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown source error' })); }
        });
        server.middlewares.use('/api/evidence', (req, res) => {
          let requested = '';
          try { requested = decodeURIComponent((req.url || '').replace(/^\//, '')); }
          catch { res.statusCode = 400; return res.end('Invalid evidence path'); }
          const file = resolveEvidencePath(source, requested);
          if (!file) { res.statusCode = 404; return res.end('Not found'); }
          res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'private, max-age=60'); import('node:fs').then(fs => fs.createReadStream(file).pipe(res));
        });
      }
    }],
    server: { port: 4173, strictPort: true }
  };
});
