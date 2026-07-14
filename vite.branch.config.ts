import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { productionRegistry } from './src/projects/registry';
import { dispatchProjectApi } from './src/server/legacy-git-api';

export default defineConfig({
  envDir: false,
  plugins: [react(), {
    name: 'uabc-explicit-branch-evidence-api',
    configureServer(server) {
      const sourceRoot = process.env.UNIVERSAARL_TWIN_BRANCH_ROOT;
      const expectedCommit = process.env.UNIVERSAARL_TWIN_BRANCH_COMMIT;
      const expectedTree = process.env.UNIVERSAARL_TWIN_BRANCH_TREE;
      if (!sourceRoot || !expectedCommit || !expectedTree) throw new Error('Die commitgebundene Branch-Quelle ist unvollständig konfiguriert.');
      process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
      const registry = productionRegistry(sourceRoot, expectedCommit, expectedTree, 'codex/universaarl-projekt', true);
      server.middlewares.use(async (req, res, next) => {
        try {
          const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
          if (!pathname.startsWith('/api/')) return next();
          if (pathname === '/api/health') { res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"application":"project-twin","status":"bereit"}'); return; }
          const result = await dispatchProjectApi(req.method || 'GET', pathname, registry);
          res.statusCode = result.status; res.setHeader('Cache-Control', 'no-store');
          if (result.binary) { res.setHeader('Content-Type', result.binary.contentType); res.end(result.binary.bytes); }
          else { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(result.body)); }
        } catch { if (!(req.url || '').startsWith('/api/')) return next(); res.statusCode = 503; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"code":"SNAPSHOT_VERTRAG_BLOCKIERT"}'); }
      });
    },
  }],
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
