import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { blueprintSourceBinding, snapshotSourceBinding } from '../src/projects/blueprint-source';
import { productionRegistry } from '../src/projects/registry';
import { dispatchProjectApi } from '../src/server/legacy-git-api';
import { AdapterSourceError, createTwinState, resolveEvidenceId } from '../src/server/adapter';

const environment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const contract = { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } as const;
const payloadPaths = ['atlassian/jira/issues/bc-basic.yaml', 'evidence/snapshot.png'];

function git(root: string, args: string[]) { return execFileSync('git', ['-C', root, '--no-optional-locks', ...args], { encoding: 'utf8', env: environment }).trim(); }
function write(root: string, relative: string, content: string | Buffer) { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
function blob(root: string, relative: string) { const bytes = fs.readFileSync(path.join(root, ...relative.split('/'))); return { gitMode: '100644', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }
function digest(root: string) {
  const hash = createHash('sha256');
  for (const relative of [blueprintSourceBinding.indexPath, ...payloadPaths].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))) { const entry = blob(root, relative); hash.update(Buffer.from(relative, 'utf8')).update('\0').update(entry.gitMode).update('\0').update(String(entry.sizeBytes)).update('\0').update(entry.sha256).update('\n'); }
  return `sha256:${hash.digest('hex')}`;
}
function base(root: string) {
  write(root, 'exports/project-data/v1/index.yaml', `schemaVersion: 1
contractId: UABC-PROJECT-DATA-V1
contractRole: repository-relative-data-allowlist
snapshotManifestIncluded: false
projectId: UABC-BC-BASIC-001
projectKey: BCB
routeKey: bc-basic
displayName: Business Central Basic
governingChange: deliver-bc-basic-customer-project
lifecycleStatus: validated
readOnly: true
sourceOfTruth: openspec
pathSemantics: repository-relative
missingValuePolicy: leer
consumerRules: [Nur positivgelistete Pfade lesen.]
artifacts:
  - { id: UABC-SRC-JIRA, kindId: jira-issues, path: atlassian/jira/issues/bc-basic.yaml, format: yaml, required: true }
  - { id: UABC-SRC-BILD, kindId: evidence-image, path: evidence/snapshot.png, format: png, required: true }
`);
  write(root, 'atlassian/jira/issues/bc-basic.yaml', 'issues: []\n');
  write(root, 'evidence/snapshot.png', png);
  const schemaRequired = ['schemaVersion', 'producerId', 'projectId', 'contractId', 'producerCommitSha', 'schemaPath', 'indexPath', 'consumer', 'spectraReleaseBinding', 'consumerBindingDigest', 'payloadDigestFormat', 'index', 'payloads', 'payloadBundleDigest', 'validationStatus'];
  const schemaProperties = Object.fromEntries(schemaRequired.map((field) => [field, field === 'schemaVersion' ? { const: 1 } : field === 'producerId' ? { const: 'blueprint' } : field === 'projectId' ? { const: 'UABC-BC-BASIC-001' } : field === 'contractId' ? { const: 'UABC-PROJECT-DATA-V1' } : { type: field === 'payloads' ? 'array' : ['consumer', 'spectraReleaseBinding', 'index'].includes(field) ? 'object' : 'string' }]));
  write(root, blueprintSourceBinding.schemaPath, `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:universaarl:schema:project-snapshot-manifest:v1', type: 'object', additionalProperties: false, required: schemaRequired, properties: schemaProperties })}\n`);
}
function fixture(transform?: (manifest: Record<string, unknown>, root: string) => void, beforeProducerCommit?: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uabc-snapshot-contract-'));
  execFileSync('git', ['init', '-q', '-b', blueprintSourceBinding.branch, root], { env: environment });
  git(root, ['config', 'core.autocrlf', 'false']); git(root, ['config', 'user.name', 'Snapshot-Test']); git(root, ['config', 'user.email', 'snapshot@example.invalid']); git(root, ['remote', 'add', 'origin', blueprintSourceBinding.remoteUrl]);
  base(root); beforeProducerCommit?.(root); git(root, ['add', '.']); git(root, ['commit', '-q', '-m', 'Fachlicher Produzenten-Commit']);
  const producerCommitSha = git(root, ['rev-parse', 'HEAD']);
  const index = blob(root, blueprintSourceBinding.indexPath); const bundle = digest(root);
  const manifest: Record<string, unknown> = { schemaVersion: 1, producerId: 'blueprint', projectId: 'UABC-BC-BASIC-001', contractId: 'UABC-PROJECT-DATA-V1', producerCommitSha, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, consumer: { consumerId: 'project-twin', repositoryUrl: 'https://github.com/sivla/Universaarl-Project-Twin.git', branch: 'codex/universaarl-projekt-twin', access: 'nur-lesend' }, spectraReleaseBinding: { bindingStatus: 'BOUND', productId: 'spectra', technicalRepositoryName: 'BCProjectOS', repositoryUrl: 'https://github.com/sivla/BCProjectOS.git', releaseVersion: '1.0.0', releaseTag: 'spectra-v1.0.0', tagCommit: 'a'.repeat(40), manifestPath: 'releases/spectra.json', manifestSourceCommit: 'b'.repeat(40), consumerMode: 'INSTALLABLE_BLUEPRINT', installableBlueprint: true, digestAlgorithm: 'SHA-256', payloadBundleDigest: 'd'.repeat(64) }, consumerBindingDigest: `sha256:${'c'.repeat(64)}`, payloadDigestFormat: 'uabc-snapshot-records-v1', index: { path: blueprintSourceBinding.indexPath, ...index }, payloads: payloadPaths.map((relative, index) => ({ id: index === 0 ? 'UABC-SRC-JIRA' : 'UABC-SRC-BILD', path: relative, selector: null, ...blob(root, relative) })), payloadBundleDigest: bundle, validationStatus: 'validated' };
  transform?.(manifest, root);
  write(root, blueprintSourceBinding.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  git(root, ['add', '.']); git(root, ['commit', '-q', '-m', 'Validierter Snapshot-Metadatencommit']);
  return root;
}
function options(root: string) { return { sourceBinding: snapshotSourceBinding(git(root, ['rev-parse', 'HEAD'])), projectDataContract: contract }; }
async function reject(root: string) { await expect(createTwinState('bc-basic', root, options(root))).rejects.toBeInstanceOf(AdapterSourceError); }

describe('A/B-Snapshotvertrag', () => {
  it('liest ausschließlich den extern gebundenen Metadatencommit B und dessen unveränderte Payload aus A', async () => {
    const root = fixture(); const state = await createTwinState('bc-basic', root, options(root));
    expect(state.source.snapshot).toMatchObject({ producerId: 'blueprint', producerCommitSha: git(root, ['rev-parse', 'HEAD^']), validationStatus: 'validated' });
    expect(state.evidenceItems).toHaveLength(1);
    expect(resolveEvidenceId('bc-basic', root, 'ev_000000000000000000000000', options(root))).toBeNull();
  });

  it('lehnt fehlendes, ungültiges oder unvollständiges Manifest sowie nicht validierte Zustände ab', async () => {
    for (const transform of [
      (manifest: Record<string, unknown>) => { delete manifest.producerCommitSha; },
      (manifest: Record<string, unknown>) => { manifest.producerCommitSha = 'abc'; },
      (manifest: Record<string, unknown>) => { manifest.validationStatus = 'blocked'; },
      (manifest: Record<string, unknown>) => { manifest.validationStatus = 'blocked'; },
      (manifest: Record<string, unknown>) => { (manifest.spectraReleaseBinding as Record<string, unknown>).bindingStatus = 'PENDING_BCPROJECTOS_RELEASE'; },
      (manifest: Record<string, unknown>) => { (manifest.spectraReleaseBinding as Record<string, unknown>).productId = 'anderes-produkt'; },
      (manifest: Record<string, unknown>) => { (manifest.spectraReleaseBinding as Record<string, unknown>).releaseTag = 'v1.0.0'; },
      (manifest: Record<string, unknown>) => { (manifest.spectraReleaseBinding as Record<string, unknown>).releaseTag = 'spectra-v1.0.1'; },
      (manifest: Record<string, unknown>) => { (manifest.payloads as Array<Record<string, unknown>>)[0].gitMode = '100755'; },
      (manifest: Record<string, unknown>) => { manifest.ungeprueft = true; },
    ]) await reject(fixture(transform));
    const missing = fixture(); fs.rmSync(path.join(missing, ...blueprintSourceBinding.manifestPath.split('/'))); git(missing, ['add', '-A']); git(missing, ['commit', '-q', '-m', 'Manifest entfernt']); await reject(missing);
  }, 60_000);

  it('lehnt falschen Produzentencommit, Indexreferenz, Digest und jede Payloadänderung in B ab', async () => {
    await reject(fixture((manifest) => { manifest.producerCommitSha = '0'.repeat(40); }));
    await reject(fixture((manifest) => { manifest.indexPath = 'exports/project-data/v1/anderer-index.yaml'; }));
    await reject(fixture((manifest) => { manifest.payloadBundleDigest = `sha256:${'0'.repeat(64)}`; }));
    const changedPayload = fixture((_manifest, root) => { write(root, 'atlassian/jira/issues/bc-basic.yaml', 'issues: [ ]\n'); }); await reject(changedPayload);
    const missingOptional = fixture(undefined, (root) => { const file = path.join(root, ...blueprintSourceBinding.indexPath.split('/')); const text = fs.readFileSync(file, 'utf8'); write(root, blueprintSourceBinding.indexPath, `${text}  - { id: UABC-SRC-OPTIONAL, kindId: evidence-image, path: evidence/optional.png, format: png, required: false }\n`); }); await reject(missingOptional);
    await reject(fixture((manifest) => { (manifest.payloads as Array<Record<string, unknown>>).splice(0, 1); }));
    const wrongSchema = fixture(undefined, (root) => { const file = path.join(root, ...blueprintSourceBinding.schemaPath.split('/')); const schema = JSON.parse(fs.readFileSync(file, 'utf8')); schema.properties.consumerBindingDigest = { const: `sha256:${'f'.repeat(64)}` }; write(root, blueprintSourceBinding.schemaPath, JSON.stringify(schema)); }); await reject(wrongSchema);
  }, 120_000);

  it('lehnt fehlenden direkten Parent und nicht zugelassene Änderungen zwischen A und B ab', async () => {
    const first = fixture(); git(first, ['checkout', '-q', '-b', 'side', 'HEAD^']); git(first, ['commit', '--allow-empty', '-q', '-m', 'Seitenzweig']); git(first, ['checkout', '-q', blueprintSourceBinding.branch]); git(first, ['merge', '--no-ff', '-q', 'side', '-m', 'Merge-B']); await reject(first);
    const changed = fixture((_manifest, root) => { write(root, 'nicht-zugelassen.txt', 'nein'); }); await reject(changed);
  }, 60_000);

  it('verwendet dieselbe Bindung für Zustand und Nachweis und lässt Quelle, Index und Referenzen unverändert', async () => {
    const root = fixture(); const before = { status: git(root, ['status', '--porcelain=v1', '-z']), head: git(root, ['rev-parse', 'HEAD']), index: createHash('sha256').update(fs.readFileSync(path.resolve(root, git(root, ['rev-parse', '--git-path', 'index'])))).digest('hex') };
    const registry = productionRegistry(root, before.head); expect(registry.find((entry) => entry.id === 'bc-basic')?.sourceContract).toBeTruthy();
    const state = await createTwinState('bc-basic', root, options(root)); const repeated = await createTwinState('bc-basic', root, options(root)); const api = await dispatchProjectApi('GET', '/api/projects/bc-basic/state', registry); expect(api).toMatchObject({ status: 200, body: { source: { projectId: 'bc-basic' } } }); const evidenceId = state.evidenceItems[0].id; expect(resolveEvidenceId('bc-basic', root, evidenceId, options(root))?.bytes).toEqual(png); const evidenceApi = await dispatchProjectApi('GET', `/api/projects/bc-basic/evidence/${evidenceId}`, registry); expect(evidenceApi.status).toBe(200); expect(evidenceApi.binary?.bytes).toEqual(png); expect(await dispatchProjectApi('GET', '/api/projects/bc-basic/evidence/ev_000000000000000000000000', registry)).toEqual({ status: 404, body: { code: 'NACHWEIS_NICHT_GEFUNDEN' } }); expect(state.source.snapshot?.payloadBundleDigest).toMatch(/^sha256:/); expect(repeated.source.commit).toBe(state.source.commit);
    expect({ status: git(root, ['status', '--porcelain=v1', '-z']), head: git(root, ['rev-parse', 'HEAD']), index: createHash('sha256').update(fs.readFileSync(path.resolve(root, git(root, ['rev-parse', '--git-path', 'index'])))).digest('hex') }).toEqual(before);
  }, 120_000);
});


