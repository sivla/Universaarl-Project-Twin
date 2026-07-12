import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { officialBcBasicSnapshotAnchor, resolveBlueprintSourceRoot } from './src/projects/blueprint-source';
import { productionRegistry } from './src/projects/registry';
import { dispatchProjectApi } from './src/server/api';
import { execFileSync } from 'node:child_process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), {
      name: 'uabc-project-scoped-read-only-api',
      configureServer(server) {
        if (mode === 'test') return;
        const sourceRepo = process.env.UABC_SOURCE_REPO ?? env.UABC_SOURCE_REPO;
        const sourceRoot = resolveBlueprintSourceRoot(process.cwd(), sourceRepo);
        const pinnedCommit = execFileSync('git', ['-c', `safe.directory=${sourceRoot}`, '-C', sourceRoot, 'rev-parse', '--verify', 'refs/heads/codex/universaarl-projekt^{commit}'], { encoding: 'utf8' }).trim();
        const pinnedTree = execFileSync('git', ['-c', `safe.directory=${sourceRoot}`, '-C', sourceRoot, 'rev-parse', '--verify', `${pinnedCommit}^{tree}`], { encoding: 'utf8' }).trim();
        if (pinnedCommit !== officialBcBasicSnapshotAnchor.commit || pinnedTree !== officialBcBasicSnapshotAnchor.tree) throw new Error('Die erlaubte BC-Basic-Branchspitze entspricht nicht dem offiziell validierten V1.0-Snapshotanker.');
        process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
        const registry = productionRegistry(sourceRoot, pinnedCommit, pinnedTree);
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
