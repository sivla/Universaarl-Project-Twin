import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateArtifactCatalogContract } from '../src/server/adapter';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const samples = [
  ['UABC-RES-GUIDE-001', 'evidence/guide.md', 'markdown', 'text/markdown', 'markdown', Buffer.from('# Klickanleitung\n\n1. Seite öffnen\n', 'utf8')],
  ['UABC-RES-SHOT-001', 'evidence/shot.png', 'png', 'image/png', 'image', png],
  ['UABC-RES-PDF-001', 'evidence/report.pdf', 'pdf', 'application/pdf', 'pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii')],
  ['UABC-RES-DOCX-001', 'evidence/training.docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'download', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])],
] as const;
type CatalogFixture = { catalog: { resources: Array<Record<string, any>> } & Record<string, any>; schemaDocument: Record<string, any>; index: { artifactCatalog: Record<string, any>; artifacts: Array<Record<string, any>> }; blobs: Array<{ id: string; path: string; format: any; mode: string; size: number; bytes: Buffer }>; knownRefs: string[]; projectId: string; commit: string };
function fixture(): CatalogFixture {
  const resources = samples.map(([artifactId, path, format, mediaType, previewMode, bytes], index) => ({ artifactId, title: `Ressource ${index + 1}`, artifactType: index === 1 ? 'screenshot' : index === 3 ? 'training' : 'deliverable', mediaType, path, gitMode: '100644', sizeBytes: bytes.length, sha256: sha(bytes), sourceCommitBinding: 'same-pinned-commit', status: 'validated', createdAt: null, actorRef: null, jiraRefs: [], confluenceRefs: [], deliverableRefs: [], caption: index === 1 ? 'Buchungsseite nach dem Retest' : null, processStep: null, precondition: null, postcondition: null, previewMode, downloadable: true }));
  const declarations = [{ id: 'UABC-ARTIFACT-CATALOG-001', kindId: 'artifact-catalog', path: 'exports/project-data/v1/artifact-catalog.json', format: 'json', required: true }, { id: 'UABC-ARTIFACT-SCHEMA-001', kindId: 'artifact-catalog-schema', path: 'governance/schemas/project-artifact-catalog.schema.json', format: 'json-schema', required: true }, ...samples.map(([id, path, format]) => ({ id, kindId: 'artifact-resource', path, format, required: true }))];
  const blobs = samples.map(([id, path, format, , , bytes]) => ({ id, path, format, mode: '100644', size: bytes.length, bytes: Buffer.from(bytes) }));
  return { catalog: { schemaVersion: 1, catalogId: 'UABC-ARTIFACT-CATALOG-V1', projectId: 'UABC-BC-BASIC-001', commitBinding: 'same-pinned-commit', readOnly: true, validationStatus: 'validated', resources }, schemaDocument: { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:universaarl:schema:project-artifact-catalog:v1', type: 'object', required: ['schemaVersion', 'catalogId', 'projectId', 'commitBinding', 'readOnly', 'validationStatus', 'resources'], properties: { schemaVersion: { const: 1 }, catalogId: { const: 'UABC-ARTIFACT-CATALOG-V1' }, projectId: { const: 'UABC-BC-BASIC-001' }, commitBinding: { const: 'same-pinned-commit' }, readOnly: { const: true }, validationStatus: { const: 'validated' }, resources: { type: 'array', minItems: 1, items: { type: 'object' } } } }, index: { artifactCatalog: { catalogId: 'UABC-ARTIFACT-CATALOG-V1', path: 'exports/project-data/v1/artifact-catalog.json', schemaPath: 'governance/schemas/project-artifact-catalog.schema.json', resourceCount: 4 }, artifacts: declarations }, blobs, knownRefs: [], projectId: 'bc-basic', commit: 'a'.repeat(40) };
}
describe('commitgebundener Ressourcenkatalog', () => {
  it('projiziert Markdown, Screenshot, PDF und Office-Download mit opaken Commitkennungen', () => { const first = validateArtifactCatalogContract(fixture()); expect(first).toHaveLength(4); expect(first.map((item) => item.previewMode)).toEqual(['markdown', 'image', 'pdf', 'download']); expect(first.every((item) => /^rs_[a-f0-9]{24}$/.test(item.id))).toBe(true); const next = fixture(); next.commit = 'b'.repeat(40); expect(validateArtifactCatalogContract(next)[0].id).not.toBe(first[0].id); });
  it.each([
    ['unsicherer Pfad', (value: CatalogFixture) => { value.catalog.resources[0].path = '../guide.md'; }],
    ['fehlender Blob', (value: CatalogFixture) => { value.blobs.splice(0, 1); }],
    ['falscher Modus', (value: CatalogFixture) => { value.blobs[0].mode = '100755'; }],
    ['falsche Größe', (value: CatalogFixture) => { value.catalog.resources[0].sizeBytes += 1; }],
    ['falscher Hash', (value: CatalogFixture) => { value.catalog.resources[0].sha256 = 'f'.repeat(64); }],
    ['MIME-Abweichung', (value: CatalogFixture) => { value.catalog.resources[0].mediaType = 'application/pdf'; }],
    ['ungültige Signatur', (value: CatalogFixture) => { value.blobs[1].bytes = Buffer.from('kein png'); value.blobs[1].size = value.blobs[1].bytes.length; value.catalog.resources[1].sizeBytes = value.blobs[1].size; value.catalog.resources[1].sha256 = sha(value.blobs[1].bytes); }],
    ['doppelte ID', (value: CatalogFixture) => { value.catalog.resources[1].artifactId = value.catalog.resources[0].artifactId; }],
    ['doppelter Pfad', (value: CatalogFixture) => { value.catalog.resources[1].path = value.catalog.resources[0].path; }],
    ['unbekannte Referenz', (value: CatalogFixture) => { value.catalog.resources[0].jiraRefs = ['UABC-999']; }],
    ['gemischte Commitbindung', (value: CatalogFixture) => { value.catalog.resources[0].sourceCommitBinding = 'anderer-commit'; }],
    ['zu große Ressource', (value: CatalogFixture) => { value.catalog.resources[0].sizeBytes = 20_000_000; }],
    ['abweichender Schemavertrag', (value: CatalogFixture) => { value.schemaDocument.properties.catalogId = { const: 'ANDERER-KATALOG' }; }],
  ])('blockiert %s', (_label, mutate) => { const value = fixture(); mutate(value); expect(() => validateArtifactCatalogContract(value)).toThrow(); });
  it.each(['image/svg+xml', 'text/html', 'video/mp4', 'application/x-browser-profile', 'application/x-playwright-trace'])('blockiert den unerlaubten Medientyp %s', (mediaType) => { const value = fixture(); value.catalog.resources[0].mediaType = mediaType; expect(() => validateArtifactCatalogContract(value)).toThrow(); });
});
