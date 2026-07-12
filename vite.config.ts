import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { officialBcBasicSnapshotAnchor, resolveBlueprintSourceRoot } from './src/projects/blueprint-source';
import { productionRegistry } from './src/projects/registry';
import { dispatchProjectApi } from './src/server/api';
import { execFileSync } from 'node:child_process';
import { validatePresentationContract } from './src/server/adapter';
import { presentationFixtureContext, presentationFixtureState, presentationFixtureVariant, type PresentationFixtureVariant } from './src/testing/presentation-fixture';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), {
      name: 'uabc-project-scoped-read-only-api',
      configureServer(server) {
        if (mode === 'test') return;
        if (mode === 'presentation-fixture') {
          const variants: PresentationFixtureVariant[] = ['valid', 'cycle', 'duplicate-id', 'duplicate-order', 'unknown-reference', 'invalid-initial-state', 'unknown-icon'];
          const configured = process.env.UABC_PRESENTATION_FIXTURE_VARIANT ?? env.UABC_PRESENTATION_FIXTURE_VARIANT ?? 'valid';
          const variant = variants.includes(configured as PresentationFixtureVariant) ? configured as PresentationFixtureVariant : 'unknown-icon';
          server.middlewares.use((req, res, next) => {
            const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
            if (!pathname.startsWith('/api/')) return next();
            res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (pathname === '/api/projects') { res.statusCode = 200; res.end('{"projects":[{"id":"bc-basic","key":"BCB","name":"Business Central Basic"}]}'); return; }
            if (pathname === '/api/projects/bc-basic/state') {
              try {
                if (variant !== 'valid') validatePresentationContract(presentationFixtureVariant(variant), presentationFixtureContext);
                res.statusCode = 200; res.end(JSON.stringify(presentationFixtureState));
              } catch { res.statusCode = 503; res.end('{"code":"SNAPSHOT_VERTRAG_BLOCKIERT"}'); }
              return;
            }
            res.statusCode = 404; res.end('{"code":"ENDPUNKT_NICHT_GEFUNDEN"}');
          });
          return;
        }
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
