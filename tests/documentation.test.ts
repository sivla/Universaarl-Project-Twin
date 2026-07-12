import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AdapterSourceError, redactDocumentationHostPaths, validateDocumentationMarkdown, validateProjectDocumentCatalogContract } from '../src/server/adapter';
import { areas, parseRoute } from '../src/navigation/routes';
import { displayStatus } from '../src/model';

describe('commitgebundene Projektdokumentation', () => {
  it('zeigt den producerdefinierten Veröffentlichungsstatus natürlich deutsch', () => {
    expect(displayStatus('published')).toBe('Veröffentlicht');
  });
  it('stellt den nachrangigen Dokumentationsbereich als stabile Projektroute bereit', () => {
    expect(areas).toContain('projektdokumentation');
    expect(parseRoute('/projekte/bc-basic/projektdokumentation', ['bc-basic'])).toEqual({ kind: 'project', projectId: 'bc-basic', area: 'projektdokumentation' });
  });

  it('entfernt Metadatenkommentare und lässt technische Platzhalter nur als passiven Text zu', () => {
    const paths = new Set(['docs/a.md', 'docs/b.md']);
    expect(validateDocumentationMarkdown('<!-- Metadaten -->\n# Vertrag <SemVer>\n[Weiter](b.md)', 'docs/a.md', paths)).toEqual({ content: '# Vertrag <SemVer>\n[Weiter](b.md)', targets: ['docs/b.md'] });
  });

  it('blockiert aktive Inhalte und unsichere Linkziele fail-closed', () => {
    const paths = new Set(['docs/a.md', 'docs/b.md']);
    for (const content of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[Angriff](javascript:alert(1))', '[Extern](https://example.invalid)', '[Datei](file:///secret)', '[Traversal](../../secret.md)']) {
      expect(() => validateDocumentationMarkdown(content, 'docs/a.md', paths)).toThrow(AdapterSourceError);
    }
    expect(validateDocumentationMarkdown('[Nicht exportiert](missing.md)', 'docs/a.md', paths)).toEqual({ content: '[Nicht exportiert](missing.md)', targets: [] });
    expect(validateDocumentationMarkdown('[Exportordner](../docs/)', 'docs/a.md', paths)).toEqual({ content: '[Exportordner](../docs/)', targets: ['docs'] });
  });

  it('rendert Dokumenttext ausschließlich über React und nie als aktives HTML', () => {
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    const adapter = fs.readFileSync(path.resolve('src/server/adapter.ts'), 'utf8');
    expect(ui).toContain('function SafeMarkdown');
    expect(ui).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=/);
    expect(adapter).toContain('Keine kanonische Confluence-URL im validierten Dokumentkatalog belegt.');
  });

  it('validiert Katalog, Indexdefinition und Git-Blob-Evidence gemeinsam fail-closed', () => {
    const shared = { artifactId: 'UABC-SRC-DOC-001', documentId: 'UABC-DOC-001', title: 'Projektseite', documentType: 'confluence-page', parentId: null, phase: 'phase-1', process: 'fit-to-standard', status: 'Freigegeben', ownerRefs: ['P-001'], jiraRefs: ['UABC-1'], referenceIds: ['UABC-REQ-001'], lastReviewed: '2026-07-12', visibility: 'twin-visible', readiness: 'v1-ready', externalUrl: null, pageId: null, spaceKey: null };
    const spaces = [
      { spaceId: 'UABC-SPACE-CUSTOMER', spaceType: 'customer-project', title: 'Kundenprojekt', purpose: 'Projektwissen.', audience: ['Kunde'], order: 0, homeDocumentId: 'UABC-DOC-001', externalUrl: null, pageId: null, spaceKey: null },
      { spaceId: 'UABC-SPACE-PRODUCT', spaceType: 'standard-product', title: 'Produktbuch', purpose: 'Produktwissen.', audience: ['Consultant'], order: 1, homeDocumentId: 'UABC-DOC-001', externalUrl: null, pageId: null, spaceKey: null },
      { spaceId: 'UABC-SPACE-CONSULTANT', spaceType: 'consultant-internal', title: 'Consultant-Handbuch', purpose: 'Durchführungshilfe.', audience: ['Consultant'], order: 2, homeDocumentId: 'UABC-DOC-001', externalUrl: null, pageId: null, spaceKey: null },
    ];
    const navigationModules = spaces.map((space, order) => ({ moduleId: `UABC-MODULE-${order + 1}`, spaceId: space.spaceId, title: space.title, order }));
    const navigationNodes = navigationModules.map((module, order) => ({ nodeId: `UABC-NODE-${order + 1}`, moduleId: module.moduleId, nodeType: 'page', title: 'Projektseite', order: 0, parentNodeId: null, documentId: 'UABC-DOC-001', initialState: 'expanded' }));
    const required = ['schemaVersion', 'catalogId', 'contractId', 'projectId', 'sourceIndexPath', 'allowedBranch', 'commitBinding', 'readOnly', 'validationStatus', 'allowedExternalOrigins', 'spaces', 'navigationModules', 'navigationNodes', 'redirects', 'documentCount', 'confluenceDocumentCount', 'documents'];
    const base = () => ({
      catalog: { schemaVersion: 1, catalogId: 'UABC-DOCUMENT-CATALOG-V1', contractId: 'UABC-PROJECT-DATA-V1', projectId: 'UABC-BC-BASIC-001', sourceIndexPath: 'exports/project-data/v1/index.yaml', allowedBranch: 'codex/universaarl-projekt', commitBinding: 'allowed-branch-head-resolved-once', readOnly: true, validationStatus: 'validated', allowedExternalOrigins: [], spaces, navigationModules, navigationNodes, redirects: [], documentCount: 1, confluenceDocumentCount: 1, documents: [{ ...shared, sourcePath: 'docs/projekt.md', contentSha256: 'a'.repeat(64) }] },
      schemaDocument: { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:universaarl:schema:project-document-catalog:v1', type: 'object', additionalProperties: false, required, properties: Object.fromEntries(required.map((field) => [field, {}])) },
      indexCatalog: { catalogId: 'UABC-DOCUMENT-CATALOG-V1', path: 'exports/project-data/v1/document-catalog.json', schemaPath: 'governance/schemas/project-document-catalog.schema.json', documentCount: 1, commitResolution: 'allowed-branch-head-resolved-once', allowedExternalOrigins: [], spaces, navigationModules, navigationNodes, redirects: [], definitions: [shared], referenceDefinitions: { ownerRefs: ['P-001'], jiraRefs: ['UABC-1'], projectRefs: ['UABC-REQ-001'] } },
      indexArtifacts: [
        { id: 'UABC-SRC-BCB-DOC-CATALOG-001', kindId: 'project-document-catalog', path: 'exports/project-data/v1/document-catalog.json', format: 'json', required: true },
        { id: 'UABC-SRC-BCB-DOC-SCHEMA-001', kindId: 'project-document-catalog-schema', path: 'governance/schemas/project-document-catalog.schema.json', format: 'json-schema', required: true },
        { id: 'UABC-SRC-DOC-001', kindId: 'confluence-page', path: 'docs/projekt.md', format: 'markdown', required: true },
      ],
      files: [
        { artifactId: 'UABC-SRC-BCB-DOC-CATALOG-001', path: 'exports/project-data/v1/document-catalog.json', format: 'json', mode: '100644', sha256: 'b'.repeat(64) },
        { artifactId: 'UABC-SRC-BCB-DOC-SCHEMA-001', path: 'governance/schemas/project-document-catalog.schema.json', format: 'json-schema', mode: '100644', sha256: 'c'.repeat(64) },
        { artifactId: 'UABC-SRC-DOC-001', path: 'docs/projekt.md', format: 'markdown', mode: '100644', sha256: 'a'.repeat(64) },
      ],
    });
    expect(validateProjectDocumentCatalogContract(base()).documents).toHaveLength(1);
    const mutations = [
      (value: ReturnType<typeof base>) => { value.catalog.documents[0].contentSha256 = 'd'.repeat(64); },
      (value: ReturnType<typeof base>) => { value.files[2].mode = '100755'; },
      (value: ReturnType<typeof base>) => { value.files.pop(); },
      (value: ReturnType<typeof base>) => { Object.assign(value.catalog.documents[0], { parentId: 'UABC-DOC-FEHLT' }); },
      (value: ReturnType<typeof base>) => { value.catalog.documents[0].referenceIds = ['UABC-REQ-FEHLT']; },
      (value: ReturnType<typeof base>) => { value.indexCatalog.definitions[0].title = 'Abweichender Titel'; },
      (value: ReturnType<typeof base>) => { Object.assign(value.catalog.documents[0], { externalUrl: 'https://example.invalid/page', pageId: '123', spaceKey: 'UABC' }); },
      (value: ReturnType<typeof base>) => { value.schemaDocument.properties.catalogId = { const: 'FREMDER-KATALOG' }; },
    ];
    for (const mutate of mutations) { const value = base(); mutate(value); expect(() => validateProjectDocumentCatalogContract(value)).toThrow(AdapterSourceError); }
  });

  it('bewahrt Fachtext und redigiert ausschließlich lokale Hostpfade', () => {
    expect(redactDocumentationHostPaths('V1_STANDARDPRODUCT_READY · C:\\Users\\kunde\\secret.md')).toBe('V1_STANDARDPRODUCT_READY · [lokaler Pfad redigiert]');
  });
});
