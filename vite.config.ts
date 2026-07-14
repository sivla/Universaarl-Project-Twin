import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { validatePresentationContract } from './src/server/presentation-validator';
import path from 'node:path';
import { dispatchProjectApi } from './src/server/api';
import { loadConfiguredCatalogs, parseCatalogConfiguration, readCatalogConfiguration } from './src/server/snapshot-catalog';
import { artifactViewerFixtureResources, presentationFixtureContext, presentationFixtureState, presentationFixtureVariant, type PresentationFixtureVariant } from './src/testing/presentation-fixture';

export default defineConfig(({ mode }) => {
  return {
    envDir: false,
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
            const resource = pathname.match(/^\/api\/projects\/bc-basic\/resources\/(rs_[a-f0-9]{24})\/(preview|download)$/);
            if (resource) {
              const item = artifactViewerFixtureResources.find((entry) => entry.id === resource[1]); if (!item || (resource[2] === 'preview' && item.previewMode === 'download')) { res.statusCode = 404; res.end('{"code":"NACHWEIS_NICHT_GEFUNDEN"}'); return; }
              const bytes = item.previewMode === 'markdown' ? Buffer.from('# Klickanleitung\n\n1. Synthetischen Beleg öffnen.\n2. Kontrolle ausführen.\n', 'utf8') : item.previewMode === 'image' ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') : item.previewMode === 'pdf' ? Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii') : Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
              res.statusCode = 200; res.setHeader('Content-Type', item.mediaType); res.setHeader('X-Content-Type-Options', 'nosniff'); if (resource[2] === 'download') res.setHeader('Content-Disposition', `attachment; filename="${item.artifactId}"`); res.end(bytes); return;
            }
            res.statusCode = 404; res.end('{"code":"ENDPUNKT_NICHT_GEFUNDEN"}');
          });
          return;
        }
        const configuredJson = process.env.UNIVERSAARL_TWIN_CONFIG_JSON;
        const configuredPath = process.env.UNIVERSAARL_TWIN_CONFIG;
        if (!configuredJson && !configuredPath) throw new Error('Die lokale Snapshot-Katalogkonfiguration fehlt.');
        const configuration = configuredJson ? parseCatalogConfiguration(JSON.parse(configuredJson)) : readCatalogConfiguration(path.resolve(configuredPath!));
        let catalogs = await loadConfiguredCatalogs(configuration);
        server.middlewares.use(async (req, res, next) => {
          try {
            const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
            if (!pathname.startsWith('/api/')) return next();
            if (pathname === '/api/health') {
              res.statusCode = 200;
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('X-Universaarl-Service', 'project-twin');
              res.end(JSON.stringify({ application: 'project-twin', status: 'bereit', source: 'snapshot-catalog', instanceId: process.env.UABC_TWIN_INSTANCE_ID ?? null, pid: process.pid }));
              return;
            }
            if ((req.method || 'GET') !== 'GET') { res.statusCode = 405; res.end('{"code":"METHODE_NICHT_ERLAUBT"}'); return; }
            catalogs = await loadConfiguredCatalogs(configuration);
            res.setHeader('Cache-Control', 'no-store');
            const result = dispatchProjectApi(req.method || 'GET', pathname, catalogs);
            res.statusCode = result.status;
            if (result.binary) {
              res.setHeader('Content-Type', result.binary.contentType);
              res.setHeader('Content-Length', result.binary.bytes.length);
              res.setHeader('X-Content-Type-Options', 'nosniff');
              if (result.binary.disposition === 'attachment' && result.binary.fileName) res.setHeader('Content-Disposition', `attachment; filename="${result.binary.fileName}"`);
              res.end(result.binary.bytes);
            } else {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result.body));
            }
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
