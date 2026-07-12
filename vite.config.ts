import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { blueprintSourceBinding, resolveBlueprintSourceRoot } from './src/projects/blueprint-source';
import { productionRegistry } from './src/projects/registry';
import { dispatchProjectApi } from './src/server/api';
import { execFileSync } from 'node:child_process';
import { validatePresentationContract } from './src/server/adapter';
import { createValidatedBranchChannel } from './src/server/branch-channel';
import { presentationFixtureContext, presentationFixtureState, presentationFixtureVariant, type PresentationFixtureVariant } from './src/testing/presentation-fixture';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), {
      name: 'uabc-project-scoped-read-only-api',
      async configureServer(server) {
        if (mode === 'test') return;
        if (mode === 'presentation-fixture') {
          const variants: PresentationFixtureVariant[] = ['valid', 'cycle', 'duplicate-id', 'duplicate-order', 'unknown-reference', 'invalid-initial-state', 'unknown-icon'];
          const configured = process.env.UABC_PRESENTATION_FIXTURE_VARIANT ?? 'valid';
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
        const sourceRepo = process.env.UABC_SOURCE_REPO;
        const sourceRoot = resolveBlueprintSourceRoot(process.cwd(), sourceRepo);
        process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
        const stableBranch = (process.env.UABC_STABLE_BRANCH || blueprintSourceBinding.branch).trim();
        const integrationCommit = process.env.UABC_INTEGRATION_COMMIT?.trim();
        const integrationTree = process.env.UABC_INTEGRATION_TREE?.trim();
        const integrationMode = Boolean(integrationCommit || integrationTree);
        if (integrationMode && (!integrationCommit || !integrationTree || !/^[a-f0-9]{40}$/.test(integrationCommit) || !/^[a-f0-9]{40}$/.test(integrationTree))) throw new Error('Der temporäre Integrationskandidat ist unvollständig oder ungültig.');
        const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${sourceRoot}`, '-C', sourceRoot, ...args], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } }).trim();
        const validateRegistry = async (commit: string, tree: string, branch: string, branchTipRequired: boolean) => {
          const candidate = productionRegistry(sourceRoot, commit, tree, branch, branchTipRequired);
          const validation = await dispatchProjectApi('GET', '/api/projects/bc-basic/state', candidate);
          if (validation.status !== 200) throw new Error('Der Kandidat des Freigabekanals verletzt den commitgebundenen Quellvertrag.');
          return productionRegistry(sourceRoot, commit, tree, branch, false);
        };
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(stableBranch) || stableBranch.includes('..') || stableBranch.includes('//')) throw new Error('Der konfigurierte Freigabebranch ist ungültig.');
        const branchChannel = createValidatedBranchChannel({
          branch: stableBranch,
          resolveCandidate: () => {
            const branchCommit = git(['rev-parse', '--verify', `refs/heads/${stableBranch}^{commit}`]);
            const commit = integrationMode ? integrationCommit! : branchCommit;
            if (integrationMode && branchCommit !== commit) throw new Error('Der Delivery-Branch verweist nicht auf den erwarteten Integrationskandidaten.');
            const tree = git(['rev-parse', '--verify', `${commit}^{tree}`]);
            if (integrationMode && tree !== integrationTree) throw new Error('Der Integrationskandidat besitzt nicht den erwarteten Tree.');
            return { commit, tree };
          },
          validateCandidate: ({ commit, tree }, branch) => validateRegistry(commit, tree, integrationMode ? blueprintSourceBinding.branch : branch, !integrationMode),
        });
        await branchChannel.refresh().catch(() => undefined);
        server.middlewares.use(async (req, res, next) => {
          try {
            const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
            if (!pathname.startsWith('/api/')) return next();
            const active = await branchChannel.refresh();
            const result = await dispatchProjectApi(req.method || 'GET', pathname, active.value);
            if (result.status === 200 && pathname.endsWith('/state') && result.body && typeof result.body === 'object' && 'source' in result.body) {
              const body = result.body as { source?: Record<string, unknown> };
              if (body.source) body.source.channel = active.channel;
            }
            res.statusCode = result.status; res.setHeader('Cache-Control', 'no-store');
            if (result.binary) { res.setHeader('Content-Type', result.binary.contentType); res.setHeader('Content-Length', result.binary.bytes.length); res.end(result.binary.bytes); return; }
            res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(result.body));
          } catch {
            if (!(req.url || '').startsWith('/api/')) return next();
            res.statusCode = 503; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"code":"SNAPSHOT_VERTRAG_BLOCKIERT"}');
          }
        });
      },
    }],
    server: { host: '127.0.0.1', port: 4173, strictPort: true },
    test: { testTimeout: 20_000 },
  };
});
