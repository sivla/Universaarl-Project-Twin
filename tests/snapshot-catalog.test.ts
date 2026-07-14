import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presentationFixtureState } from '../src/testing/presentation-fixture';
import { createFilesystemTransport, loadConfiguredCatalogs, loadSnapshotCatalog, loadSnapshotCatalogFromTransport, parseCatalogConfiguration, SnapshotCatalogError, type CatalogEntry, type SnapshotTransport } from '../src/server/snapshot-catalog';
import { dispatchProjectApi } from '../src/server/api';

const roots: string[] = []; const servers: http.Server[] = [];
const sha = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture(routeId: string, customerId: string, projectId: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-katalog-')); roots.push(root);
  const releaseId = 'release-2026-08-01'; const payloadPath = `releases/${releaseId}/payloads/project-state.json`;
  const state = structuredClone(presentationFixtureState);
  state.source.projectId = routeId; state.source.branch = null; state.source.commit = null; state.source.catalog = null; state.source.channel = null;
  const stateBytes = Buffer.from(`${JSON.stringify(state)}\n`, 'utf8');
  const manifest = { schemaVersion: 1, customerId, projectId, releaseId, validationStatus: 'validated', generatedAt: '2026-08-01T10:00:00Z', provenance: {}, spectra: { status: 'PENDING_BCPROJECTOS_RELEASE' }, payloads: [{ id: 'project-state', role: 'project-state', path: payloadPath, mediaType: 'application/json', sizeBytes: stateBytes.length, digest: sha(stateBytes) }] };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
  const current = { schemaVersion: 1, customerId, projectId, releaseId, manifestPath: `releases/${releaseId}/manifest.json`, manifestDigest: sha(manifestBytes), updatedAt: '2026-08-01T10:00:00Z' };
  const files = new Map<string, Buffer>([['current.json', Buffer.from(`${JSON.stringify(current)}\n`, 'utf8')], [current.manifestPath, manifestBytes], [payloadPath, stateBytes]]);
  for (const [relative, bytes] of files) { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
  const entry: CatalogEntry = { id: routeId, type: 'filesystem', address: root, expectedCustomerId: customerId, expectedProjectId: projectId, displayName: `Projekt ${routeId}` };
  return { root, entry, files, current, manifest, payloadPath };
}

afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('schreibgeschützter Snapshot-Katalog', () => {
  it('liest current.json und ein unveränderliches Release ohne Commitpflicht', async () => {
    const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); const loaded = await loadSnapshotCatalog(data.entry);
    expect(loaded.state.source).toMatchObject({ projectId: 'projekt-a', branch: null, commit: null, dirty: false, catalog: { customerId: 'KUNDE-A', projectId: 'PROJEKT-A', releaseId: 'release-2026-08-01', sourceType: 'filesystem' } });
    expect(loaded.payloads).toHaveLength(1); expect('write' in createFilesystemTransport(data.root)).toBe(false);
  });

  it('liefert über Filesystem und HTTPS denselben Byte- und Digestvertrag', async () => {
    const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); const local = await loadSnapshotCatalog(data.entry);
    const remoteEntry = { ...data.entry, type: 'https' as const, address: 'https://katalog.example/kunde-a/' };
    const fetcher = async (input: string | URL | Request) => { const relative = new URL(String(input)).pathname.replace('/kunde-a/', ''); const bytes = data.files.get(relative); return bytes ? new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-length': String(bytes.length) } }) : new Response(null, { status: 404 }); };
    const remote = await loadSnapshotCatalog(remoteEntry, fetcher as typeof fetch);
    expect(remote.state).toEqual({ ...local.state, source: { ...local.state.source, catalog: { ...local.state.source.catalog!, sourceType: 'https' }, readAt: remote.state.source.readAt } });
    expect([...remote.payloads.values()].map(({ bytes }) => sha(bytes))).toEqual([...local.payloads.values()].map(({ bytes }) => sha(bytes)));
  });

  it('liest dieselben Bytes über einen echten lokalen HTTP-Testserver', async () => {
    const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); const server = http.createServer((request, response) => { const bytes = data.files.get((request.url ?? '/').replace(/^\//, '')); if (!bytes) { response.writeHead(404).end(); return; } response.setHeader('content-length', String(bytes.length)); response.end(bytes); }); servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Der lokale Testserver besitzt keinen Port.');
    const transport: SnapshotTransport = { kind: 'https', async read(relative) { const response = await fetch(`http://127.0.0.1:${address.port}/${relative}`); if (!response.ok) throw new Error('Testdatei fehlt.'); return Buffer.from(await response.arrayBuffer()); } };
    const loaded = await loadSnapshotCatalogFromTransport({ ...data.entry, type: 'https', address: 'https://nicht-verwendet.invalid/' }, transport); expect(loaded.state.source.catalog).toMatchObject({ sourceType: 'https', customerId: 'KUNDE-A' });
  });

  it.runIf(process.platform !== 'win32')('behandelt Dateinamen auf case-sensitiven Systemen exakt', async () => { const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); fs.renameSync(path.join(data.root, 'current.json'), path.join(data.root, 'CURRENT.json')); await expect(loadSnapshotCatalog(data.entry)).rejects.toBeInstanceOf(SnapshotCatalogError); });

  it('isoliert zwei explizit registrierte Kunden und blockiert vertauschte Identitäten', async () => {
    const first = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); const second = fixture('projekt-b', 'KUNDE-B', 'PROJEKT-B');
    const configuration = parseCatalogConfiguration({ schemaVersion: 1, activeCatalogId: 'projekt-a', catalogs: [first.entry, second.entry] });
    const loaded = await loadConfiguredCatalogs(configuration); expect(loaded.map(({ state }) => state.source.projectId)).toEqual(['projekt-a', 'projekt-b']);
    await expect(loadSnapshotCatalog({ ...first.entry, expectedCustomerId: 'KUNDE-B' })).rejects.toBeInstanceOf(SnapshotCatalogError);
    await expect(loadSnapshotCatalog({ ...first.entry, expectedProjectId: 'PROJEKT-B' })).rejects.toBeInstanceOf(SnapshotCatalogError);
  });

  it('blockiert falsche Digests, fehlende Releases und Traversal fail-closed', async () => {
    const digestCase = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); const currentPath = path.join(digestCase.root, 'current.json'); const current = JSON.parse(fs.readFileSync(currentPath, 'utf8')); current.manifestDigest = `sha256:${'0'.repeat(64)}`; fs.writeFileSync(currentPath, JSON.stringify(current));
    await expect(loadSnapshotCatalog(digestCase.entry)).rejects.toBeInstanceOf(SnapshotCatalogError);
    const missing = fixture('projekt-b', 'KUNDE-B', 'PROJEKT-B'); fs.rmSync(path.join(missing.root, ...missing.current.manifestPath.split('/')));
    await expect(loadSnapshotCatalog(missing.entry)).rejects.toBeInstanceOf(SnapshotCatalogError);
    const traversal = fixture('projekt-c', 'KUNDE-C', 'PROJEKT-C'); const manifestPath = path.join(traversal.root, ...traversal.current.manifestPath.split('/')); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); manifest.payloads[0].path = '../fremd.json'; const bytes = Buffer.from(JSON.stringify(manifest)); fs.writeFileSync(manifestPath, bytes); const pointer = JSON.parse(fs.readFileSync(path.join(traversal.root, 'current.json'), 'utf8')); pointer.manifestDigest = sha(bytes); fs.writeFileSync(path.join(traversal.root, 'current.json'), JSON.stringify(pointer));
    await expect(loadSnapshotCatalog(traversal.entry)).rejects.toBeInstanceOf(SnapshotCatalogError);
  });

  it('blockiert symbolische Verknüpfungen oder Junctions im lokalen Katalog', async () => {
    const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); const external = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-katalog-fremd-')); roots.push(external); const payloadDirectory = path.dirname(path.join(data.root, ...data.payloadPath.split('/'))); const externalPayloadDirectory = path.join(external, 'payloads'); fs.mkdirSync(externalPayloadDirectory); fs.copyFileSync(path.join(payloadDirectory, 'project-state.json'), path.join(externalPayloadDirectory, 'project-state.json')); fs.rmSync(payloadDirectory, { recursive: true }); fs.symlinkSync(externalPayloadDirectory, payloadDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(loadSnapshotCatalog(data.entry)).rejects.toBeInstanceOf(SnapshotCatalogError);
  });

  it('blockiert eine Änderung von current.json während desselben Lesevorgangs', async () => {
    const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A'); let currentReads = 0;
    const transport: SnapshotTransport = { kind: 'filesystem', async read(relative) { const bytes = data.files.get(relative); if (!bytes) throw new Error('Fehlt'); if (relative === 'current.json' && currentReads++ > 0) return Buffer.from(bytes.toString('utf8').replace('10:00:00Z', '10:00:01Z')); return bytes; } };
    await expect(loadSnapshotCatalogFromTransport(data.entry, transport)).rejects.toBeInstanceOf(SnapshotCatalogError);
  });

  it('besitzt im produktiven Ladepfad weder Directory-Scan noch Git-Fallback', () => {
    const sources = ['src/server/snapshot-catalog.ts', 'vite.config.ts', 'scripts/twin-local.mjs'].map((file) => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
    expect(sources).not.toMatch(/readdir|fast-glob|rev-parse|ls-tree|cat-file|UABC_SOURCE_REPO|UABC_STABLE_BRANCH/);
    expect(sources).not.toMatch(/execFileSync\(['"]git|spawnSync\(['"]git/);
  });

  it('liefert Projektzustand und Payloads ausschließlich aus validierten Katalogen', async () => {
    const data = fixture('projekt-a', 'KUNDE-A', 'PROJEKT-A');
    const catalog = await loadSnapshotCatalog(data.entry);
    expect(dispatchProjectApi('GET', '/api/projects', [catalog])).toMatchObject({ status: 200, body: { projects: [{ id: 'projekt-a' }] } });
    expect(dispatchProjectApi('GET', '/api/projects/projekt-a/state', [catalog])).toMatchObject({ status: 200, body: { source: { projectId: 'projekt-a' } } });
    expect(dispatchProjectApi('GET', '/api/projects/fremd/state', [catalog])).toEqual({ status: 404, body: { code: 'PROJEKT_NICHT_GEFUNDEN' } });
  });

  it('hält den produktiven Importgraph frei von Git- und Arbeitsbaumkapazität', () => {
    const roots = ['vite.config.ts', 'src/server/api.ts', 'scripts/twin-local.mjs'];
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
    roots.forEach(visit);
    const source = [...visited].map((file) => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');
    expect([...visited]).not.toContain('src/server/adapter.ts');
    expect([...visited]).not.toContain('src/server/legacy-git-api.ts');
    expect(source).not.toMatch(/\b(?:gitBuffer|createTwinState|UABC_EXPECTED_COMMIT|UABC_SOURCE_REPO|UABC_STABLE_BRANCH|sourceRoot)\b/);
    expect(source).not.toMatch(/(?:rev-parse|ls-tree|cat-file|git\s+-C|execFileSync\(['"]git|spawnSync\(['"]git)/);
  });
});
