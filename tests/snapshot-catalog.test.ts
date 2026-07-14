import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFilesystemTransport, loadConfiguredCatalogs, loadSnapshotCatalog, loadSnapshotCatalogFromTransport, parseCatalogConfiguration, SnapshotCatalogError, type CatalogEntry, type SnapshotTransport } from '../src/server/snapshot-catalog';
import { dispatchProjectApi } from '../src/server/api';

const pointerPath = 'exports/project-data/v1/snapshots/current.json';
const producerRoot = path.resolve(process.env.UABC_PORTABLE_PRODUCER_ROOT ?? path.join('..', 'Universaarl Projekt BC Basic'));
const producerAvailable = fs.existsSync(path.join(producerRoot, ...pointerPath.split('/')));
const requireProducer = process.env.UABC_REQUIRE_PORTABLE_PRODUCER === '1';
const roots: string[] = [];
const servers: http.Server[] = [];
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const entry: CatalogEntry = { id: 'bc-basic', type: 'filesystem', address: producerRoot, expectedCustomerId: 'UABC-CUSTOMER-001', expectedProjectId: 'UABC-BC-BASIC-001', displayName: 'Universaarl BC Basic' };

function sourceBytes(relative: string) { return fs.readFileSync(path.join(producerRoot, ...relative.split('/'))); }
function sourceTransport(kind: 'filesystem' | 'https' = 'filesystem', overrides = new Map<string, Buffer | null>()): SnapshotTransport {
  return { kind, async read(relative) { const override = overrides.get(relative); if (override === null) throw new Error('Testdatei fehlt.'); return override ?? sourceBytes(relative); } };
}
function fetchFromProducer(input: string | URL | Request) {
  const relative = decodeURIComponent(new URL(String(input)).pathname.replace(/^\/projekt\//, ''));
  try { const bytes = sourceBytes(relative); return Promise.resolve(new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-length': String(bytes.length) } })); } catch { return Promise.resolve(new Response(null, { status: 404 })); }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Konfiguration des portablen Snapshot-Katalogs', () => {
  it('fordert den realen Producer in verpflichtenden Plattformläufen ausdrücklich an', () => {
    expect(requireProducer && !producerAvailable).toBe(false);
  });

  it('bindet mehrere explizite Projekte ohne Directory-Scan', () => {
    const configuration = parseCatalogConfiguration({ schemaVersion: 1, activeCatalogId: 'bc-basic', catalogs: [entry, { ...entry, id: 'bc-basic-zwei', expectedCustomerId: 'KUNDE-ZWEI' }] });
    expect(configuration.catalogs.map((item) => item.id)).toEqual(['bc-basic', 'bc-basic-zwei']);
    expect(() => parseCatalogConfiguration({ ...configuration, catalogs: [entry, entry] })).toThrow();
    expect(() => parseCatalogConfiguration({ ...configuration, activeCatalogId: 'unbekannt' })).toThrow();
  });

  it('hält den produktiven statischen Importgraph frei von Git- und Arbeitsbaumkapazität', () => {
    const rootsToVisit = ['vite.config.ts', 'src/server/api.ts', 'scripts/twin-local.mjs'];
    const visited = new Set<string>();
    const visit = (relative: string) => {
      const normalized = relative.replaceAll('\\', '/');
      if (visited.has(normalized)) return;
      visited.add(normalized);
      const source = fs.readFileSync(path.resolve(normalized), 'utf8');
      const imports = [...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of imports) {
        const base = path.resolve(path.dirname(normalized), specifier);
        const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (target) visit(path.relative(process.cwd(), target));
      }
    };
    rootsToVisit.forEach(visit);
    const source = [...visited].map((file) => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
    expect([...visited]).not.toContain('src/server/adapter.ts');
    expect([...visited]).not.toContain('src/server/legacy-git-api.ts');
    expect(source).not.toMatch(/\b(?:gitBuffer|createTwinState|UABC_EXPECTED_COMMIT|UABC_SOURCE_REPO|UABC_STABLE_BRANCH|sourceRoot)\b/);
    expect(source).not.toMatch(/(?:rev-parse|ls-tree|cat-file|git\s+-C|execFileSync\(['"]git|spawnSync\(['"]git)/);
  });
});

describe.runIf(producerAvailable)('reales BC-Basic-Snapshot-Release', () => {
  it('normalisiert Release 0003 mit Index und 158 Projektquellen ohne Git-Laufzeit', async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = '';
    try {
      const loaded = await loadSnapshotCatalog(entry);
      expect(loaded.releaseId).toBe('UABC-PORTABLE-PILOT-0003');
      expect(loaded.state.source).toMatchObject({ projectId: 'bc-basic', branch: null, commit: '8132f2ce692dfcb8e12a3a4db4a287c643a6376f', dirty: false, catalog: { customerId: 'UABC-CUSTOMER-001', projectId: 'UABC-BC-BASIC-001', releaseId: 'UABC-PORTABLE-PILOT-0003', sourceType: 'filesystem', manifestDigest: 'sha256:5710f0c5315ede59f8af1bbe6a154725a180ef9c87c6502a83f1008892eaf863' } });
      expect(loaded.state.source.snapshot?.spectraReleaseBinding).toMatchObject({ releaseTag: 'spectra-v1.2.0-alpha.12', tagCommit: '6b3d9a1bfaf6cd806218a802fdde8f1a4cfa55a1', installableBlueprint: true });
      expect(loaded.state.presentation?.spaces).toHaveLength(3);
      expect(loaded.state.story?.tickets.length).toBeGreaterThan(0);
      expect(loaded.state.documents.length).toBeGreaterThan(0);
      expect(loaded.state.resources.length).toBe(loaded.payloads.size - loaded.state.evidenceItems.length);
    } finally {
      if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    }
  }, 120_000);

  it('liefert für identische Filesystem- und HTTPS-Bytes denselben Projektzustand', async () => {
    const local = await loadSnapshotCatalog(entry);
    const remote = await loadSnapshotCatalog({ ...entry, type: 'https', address: 'https://snapshot.example/projekt/' }, fetchFromProducer as typeof fetch);
    expect(remote.state).toEqual({ ...local.state, source: { ...local.state.source, catalog: { ...local.state.source.catalog!, sourceType: 'https' }, readAt: remote.state.source.readAt } });
    expect([...remote.payloads.values()].map(({ metadata, bytes }) => [metadata.id, metadata.digest, sha(bytes)])).toEqual([...local.payloads.values()].map(({ metadata, bytes }) => [metadata.id, metadata.digest, sha(bytes)]));
  }, 120_000);

  it('liest dieselben Bytes über einen echten lokalen HTTP-Testserver', async () => {
    const server = http.createServer((request, response) => { try { const bytes = sourceBytes(decodeURIComponent((request.url ?? '/').replace(/^\//, ''))); response.setHeader('content-length', String(bytes.length)); response.end(bytes); } catch { response.writeHead(404).end(); } });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Der lokale Testserver besitzt keinen Port.');
    const transport: SnapshotTransport = { kind: 'https', async read(relative) { const response = await fetch(`http://127.0.0.1:${address.port}/${relative}`); if (!response.ok) throw new Error('Testdatei fehlt.'); return Buffer.from(await response.arrayBuffer()); } };
    const loaded = await loadSnapshotCatalogFromTransport({ ...entry, type: 'https', address: 'https://nicht-verwendet.invalid/' }, transport);
    expect(loaded.state.source.catalog).toMatchObject({ sourceType: 'https', customerId: 'UABC-CUSTOMER-001' });
  }, 120_000);

  it('blockiert Identitäts-, Digest-, Quellenmengen- und Pointerabweichungen fail-closed', async () => {
    const current = JSON.parse(sourceBytes(pointerPath).toString('utf8'));
    const manifest = JSON.parse(sourceBytes(current.manifestPath).toString('utf8'));
    const source = manifest.files.find((file: { kind: string }) => file.kind === 'project-source');
    const changedIdentity = Buffer.from(`${JSON.stringify({ ...current, customerId: 'FREMDER-KUNDE' }, null, 2)}\n`);
    const changedManifestDigest = Buffer.from(`${JSON.stringify({ ...current, manifestSha256: '0'.repeat(64) }, null, 2)}\n`);
    await expect(loadSnapshotCatalogFromTransport(entry, sourceTransport('filesystem', new Map([[pointerPath, changedIdentity]])))).rejects.toBeInstanceOf(SnapshotCatalogError);
    await expect(loadSnapshotCatalogFromTransport(entry, sourceTransport('filesystem', new Map([[pointerPath, changedManifestDigest]])))).rejects.toBeInstanceOf(SnapshotCatalogError);
    await expect(loadSnapshotCatalogFromTransport(entry, sourceTransport('filesystem', new Map([[source.path, Buffer.concat([sourceBytes(source.path), Buffer.from('x')])]])))).rejects.toBeInstanceOf(SnapshotCatalogError);
    await expect(loadSnapshotCatalogFromTransport(entry, sourceTransport('filesystem', new Map([[source.path, null]])))).rejects.toBeInstanceOf(SnapshotCatalogError);
    let pointerReads = 0;
    const changedPointer = Buffer.from(`${JSON.stringify({ ...current, updatedAt: '2026-07-14T00:00:00Z' }, null, 2)}\n`);
    const flipping: SnapshotTransport = { kind: 'filesystem', async read(relative) { if (relative === pointerPath && ++pointerReads === 2) return changedPointer; return sourceBytes(relative); } };
    await expect(loadSnapshotCatalogFromTransport(entry, flipping)).rejects.toBeInstanceOf(SnapshotCatalogError);
  }, 120_000);

  it('isoliert die registrierte Kundenidentität und stellt nur validierte API-Daten bereit', async () => {
    await expect(loadConfiguredCatalogs(parseCatalogConfiguration({ schemaVersion: 1, activeCatalogId: 'bc-basic', catalogs: [{ ...entry, expectedCustomerId: 'FREMDER-KUNDE' }] }))).rejects.toBeInstanceOf(SnapshotCatalogError);
    const catalog = await loadSnapshotCatalog(entry);
    expect(dispatchProjectApi('GET', '/api/projects', [catalog])).toMatchObject({ status: 200, body: { projects: [{ id: 'bc-basic' }] } });
    expect(dispatchProjectApi('GET', '/api/projects/bc-basic/state', [catalog])).toMatchObject({ status: 200, body: { source: { projectId: 'bc-basic' } } });
    expect(dispatchProjectApi('GET', '/api/projects/fremd/state', [catalog])).toEqual({ status: 404, body: { code: 'PROJEKT_NICHT_GEFUNDEN' } });
    const resource = catalog.state.resources[0];
    if (resource) expect(dispatchProjectApi('GET', `/api/projects/bc-basic/resources/${resource.id}/preview`, [catalog]).status).toBe(200);
  }, 120_000);

  it('blockiert symbolische Verknüpfungen oder Junctions im lokalen Katalog', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-katalog-link-')); roots.push(root);
    fs.symlinkSync(path.join(producerRoot, 'exports'), path.join(root, 'exports'), process.platform === 'win32' ? 'junction' : 'dir');
    const transport = createFilesystemTransport(root);
    await expect(transport.read(pointerPath)).rejects.toBeInstanceOf(SnapshotCatalogError);
  });
});
