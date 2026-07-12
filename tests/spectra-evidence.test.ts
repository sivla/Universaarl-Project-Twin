import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AdapterSourceError, spectraEvidenceSummary, validateSpectra09ContractData, validateV1DemoReadiness } from '../src/server/adapter';
import { displayDocumentType, uiErrorMessage, uiErrorTitle } from '../src/model';

const indexHash = '1'.repeat(64); const projectionHash = '2'.repeat(64);
const declaration = { id: 'UABC-SRC-TEST-001', kindId: 'test-artifact', path: 'evidence/test.json', format: 'json' as const, required: true };

function spectra09Fixture() {
  return {
    release: { tag: { name: 'spectra-v0.9.0-alpha.1', peeledCommit: '8e991afe455406280610a98f15dd776444fb81ef' }, payload: { bundleDigest: '9fa838b6950ea16f074f438a2476c15661a47567c217e3f60c6e64669d567706', fileCount: 102, verifiedGitBlobs: 102, mismatches: 0 }, release: { version: '0.9.0-alpha.1' }, verification: { status: 'passed' } },
    conformance: { status: 'passed', spectraRelease: 'spectra-v0.9.0-alpha.1', reconciliation: { path: 'evidence/simulation/project-reconciliation.json', baselineHours: 68, baselineAmount: 11050, offerHours: 80, offerAmount: 9600, actualHours: 80, actualAmount: 9600, invoiceClaim: false, productiveActivityClaim: false, officialSpectraValidator: 'passed' }, adapterProvenance: { path: 'evidence/simulation/adapter-provenance.json', sourcePath: 'exports/project-data/v1/index.yaml', mappingVersion: '1.0.0', projectionPath: 'exports/project-data/v1/twin-export-map.json', sourceUnchanged: true, writesPerformed: false, officialSpectraValidator: 'passed' }, counts: { offerVersions: 3, pages: 19, tickets: 17, comments: 34, worklogs: 17, hours: 80, cost: 9600, timelineEvents: 15, hypercareDays: 3, nativeRelations: 252 } },
    reconciliation: { schema_version: 1, contract_version: '0.9', record_type: 'project-reconciliation', reconciliation_id: 'REC-UABC-BCB-001', product_id: 'spectra', profile: 'implementation', classification: 'synthetic-fixture', synthetic: true, baseline: { version: 1, hours: 68, rate: 162.5, amount: 11050, currency: 'EUR' }, offer: { version: 2, hours: 80, rate: 120, amount: 9600, currency: 'EUR' }, actual: { version: 3, hours: 80, rate: 120, amount: 9600, currency: 'EUR' }, variance: { hours: 0, rate: 0, amount: 0, reason_code: 'scope-change', reason: 'Historische Kalkulation wurde durch das synthetische Angebot ersetzt.' }, truth_boundary: { owner: 'synthetic-fixture', source_of_truth: 'synthetic-fixture', invoice_claim: false, productive_activity_claim: false, billing_status: 'not-applicable' } },
    provenance: { schema_version: 1, contract_version: '0.9', record_type: 'adapter-provenance', provenance_id: 'PRV-UABC-BCB-TWIN-001', product_id: 'spectra', profile: 'implementation', classification: 'customer-workspace', synthetic: false, source: { blob_path: 'exports/project-data/v1/index.yaml', source_hash: indexHash, source_hash_after: indexHash, media_type: 'application/yaml' }, mapping: { mapping_id: 'MAP-UABC-BCB-TWIN-001', mapping_version: '1.0.0', deterministic: true }, projection: { projection_path: 'exports/project-data/v1/twin-export-map.json', digest_algorithm: 'SHA-256', projection_digest: projectionHash }, source_of_truth: { owner: 'customer-workspace', unchanged: true }, write_protection: { source_mode: 'read-only', writes_performed: false, projection_only: true, overwrite_allowed: false } },
    exportMap: { schemaVersion: 1, contractVersion: '0.9', recordType: 'twin-export-map', mappingId: 'MAP-UABC-BCB-TWIN-001', mappingVersion: '1.0.0', projectId: 'UABC-BC-BASIC-001', allowedBranch: 'codex/universaarl-projekt', classification: 'synthetische-projektevidence', sourceOfTruth: 'exports/project-data/v1/index.yaml', readOnly: true, artifacts: [{ ...declaration, selector: null }] },
    indexArtifacts: [declaration], indexHash, projectionHash,
  };
}

function spectra10Fixture() {
  const value = spectra09Fixture();
  value.release.release.version = '0.10.0-alpha.1'; value.release.tag.name = 'spectra-v0.10.0-alpha.1'; value.release.payload.fileCount = 110; value.release.payload.verifiedGitBlobs = 110;
  value.conformance.spectraRelease = 'spectra-v0.10.0-alpha.1';
  value.reconciliation.contract_version = '0.10'; value.provenance.contract_version = '0.10'; value.exportMap.contractVersion = '0.10';
  value.provenance.mapping.mapping_version = '1.1.0'; value.exportMap.mappingVersion = '1.1.0'; value.conformance.adapterProvenance.mappingVersion = '1.1.0';
  return value;
}

function v1Fixture() {
  return { schemaVersion: 1, classification: 'synthetic-only', status: 'synthetisch-abgeschlossen', productResult: 'V1_STANDARDPRODUCT_READY', result: 'GO_SIMULATION',
    checks: { spectraRelease: 'spectra-v0.10.0-alpha.1', branchContract: 'exports/project-data/v1/index.yaml', twinArtifactCount: 108, realBcExecution: false, realAcceptance: 'ausserhalb-des-simulationsziels', externalTransmission: false },
    v1Acceptance: { commercial: { hours: 80, rateEur: 120, amountEur: 9600, result: 'bestanden' }, decisions: { requiredAreas: 7, result: 'bestanden' }, data: { templatePairs: 8, migrationWaves: 3, result: 'bestanden' }, processControls: { glDifference: 0, bankDifference: 0, openP1: 0, openP2: 0, result: 'bestanden' }, uat: { cases: 7, result: 'bestanden-synthetisch' }, operators: { paths: 4, smokeTest: 'UABC-SMOKE-BCB-OPERATOR-001', result: 'bestanden-synthetisch' }, transition: { cutover: 'bestanden', restart: 'bestanden', hypercareDays: 3, result: 'bestanden-synthetisch' }, deliverables: { completed: 9, total: 9, result: 'bestanden-synthetisch' }, contracts: { spectra: 'BOUND-0.10.0-alpha.1', snapshot: 'validiert', twin: 'branch-index-read-only', result: 'bestanden' } },
    realCustomerEntryGate: 'project/bc-basic/phase-2-readiness-gate.yaml' };
}

describe('commitgebundene Spectra-Evidence', () => {
  it('löst den erlaubten Producerbranch ohne festen Runtime-Commit atomar auf', () => {
    const vite = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
    expect(vite).toContain('process.env.UABC_STABLE_BRANCH || blueprintSourceBinding.branch');
    expect(vite).toContain('`refs/heads/${stableBranch}^{commit}`');
    expect(vite).toContain('createValidatedBranchChannel');
    expect(vite).toContain('const active = await branchChannel.refresh()');
    expect(vite).not.toContain('officialBcBasicSnapshotAnchor');
    expect(vite).toContain('return productionRegistry(sourceRoot, commit, tree, branch, false)');
    expect(vite).toContain("'-c', `safe.directory=${sourceRoot}`");
    expect(vite).not.toContain('loadEnv');
    expect(vite).not.toContain('UABC_EXPECTED_COMMIT');
  });
  it('benennt unterstützte Spectra-Dokumente und den manifestfreien Blockierzustand widerspruchsfrei', () => {
    expect(displayDocumentType('spectra-release-evidence')).toBe('Spectra-Release-Nachweis');
    expect(displayDocumentType('spectra-portable-conformance-evidence')).toBe('Spectra-Konformitätsnachweis');
    expect(displayDocumentType('spectra-project-reconciliation')).toBe('Spectra-Projektabgleich');
    expect(displayDocumentType('spectra-adapter-provenance')).toBe('Spectra-Adapterprovenienz');
    expect(displayDocumentType('twin-export-map')).toBe('Twin-Exportvertrag');
    expect(uiErrorTitle('SNAPSHOT_VERTRAG_BLOCKIERT')).toBe('Commitgebundener Quellvertrag blockiert');
    expect(uiErrorMessage('SNAPSHOT_VERTRAG_BLOCKIERT')).toContain('Repository, Branch, Commit, Index, Allowlist, Referenzen und Digests');
    expect(uiErrorMessage('SNAPSHOT_VERTRAG_BLOCKIERT')).not.toMatch(/Manifest|Snapshot/);
  });
  it('zeigt Releasebindung und bestaetigte Payloadvollstaendigkeit ohne erfundene Werte', () => {
    expect(spectraEvidenceSummary('spectra-release-evidence', {
      tag: { name: 'spectra-v0.8.0-alpha.1', peeledCommit: '5dd23c2ff2c408c03fd613348fcb305635cfbf9a' },
      payload: { bundleDigest: '73cccf2555357f761059cd369358e0ab6315807889995326a55761d3c58d6029', fileCount: 89, verifiedGitBlobs: 89, mismatches: 0 },
      release: { version: '0.8.0-alpha.1' }, verification: { status: 'passed' },
    })).toEqual({
      title: 'Spectra 0.8.0-alpha.1 · 89/89 Payloads', status: 'passed',
      rationale: 'Tag spectra-v0.8.0-alpha.1 · Commit 5dd23c2ff2c408c03fd613348fcb305635cfbf9a · Digest 73cccf2555357f761059cd369358e0ab6315807889995326a55761d3c58d6029',
    });
  });

  it('zeigt die belegte Graphentscheidung und blockiert unvollstaendige Release-Evidence', () => {
    expect(spectraEvidenceSummary('spectra-portable-conformance-evidence', {
      status: 'passed', spectraRelease: 'spectra-v0.8.0-alpha.1',
      graphCoverage: { nativeRelations: 252, portableEdges: 190, productDecision: 'accepted-graph-separation', standardizedCoverageMetric: false },
    })).toEqual({
      title: 'spectra-v0.8.0-alpha.1 · Graphtrennung akzeptiert', status: 'passed',
      rationale: '252 native Relationen · 190 portable Kanten · Coverage-Metrik nicht veröffentlicht',
    });
    expect(() => spectraEvidenceSummary('spectra-release-evidence', {
      tag: { name: 'spectra-v0.8.0-alpha.1', peeledCommit: '5dd23c2ff2c408c03fd613348fcb305635cfbf9a' },
      payload: { bundleDigest: '73cccf2555357f761059cd369358e0ab6315807889995326a55761d3c58d6029', fileCount: 89, verifiedGitBlobs: 88, mismatches: 1 },
      release: { version: '0.8.0-alpha.1' }, verification: { status: 'failed' },
    })).toThrow(AdapterSourceError);
  });

  it('projiziert den vollständigen Spectra-0.9-Abgleich ausschließlich aus belegten Vertragswerten', () => {
    const summaries = validateSpectra09ContractData(spectra09Fixture());
    expect(summaries.get('spectra-project-reconciliation')).toMatchObject({ title: 'Historische Baseline und synthetischer Projektabgleich', status: 'passed' });
    expect(summaries.get('spectra-project-reconciliation')?.activity).toEqual(['Historische Baseline: 68 Std. · 11.050 EUR', 'Synthetisches Angebot: 80 Std. · 9.600 EUR', 'Synthetisches Ist: 80 Std. · 9.600 EUR', 'Keine echte Rechnung, Buchung, Zahlung oder produktive Leistung.']);
    expect(summaries.get('twin-export-map')?.title).toBe('1 positivgelistete Snapshotartefakte');
  });

  it('validiert Spectra 0.10 mit genau 110 bestätigten Releasepayloads', () => {
    const summaries = validateSpectra09ContractData(spectra10Fixture());
    expect(summaries.get('spectra-portable-conformance-evidence')?.title).toBe('Spectra 0.10.0-alpha.1 · Projektabgleich und Twin-Export bestanden');
    const wrongCount = spectra10Fixture(); wrongCount.release.payload.verifiedGitBlobs = 109;
    expect(() => validateSpectra09ContractData(wrongCount)).toThrow(AdapterSourceError);
  });

  it('wertet den vollständigen V1-Abschluss aus und blockiert widersprüchliche Abnahme-Evidence', () => {
    expect(validateV1DemoReadiness(v1Fixture())).toMatchObject({ title: 'BC Basic V1 · Standardprodukt bereit', activity: ['V1_STANDARDPRODUCT_READY', '9/9 Lieferobjekte · 7 UAT-Fälle · 4 Operatorpfade', 'Cutover und Restart bestanden · 3 Hypercaretage', 'Offene P1/P2: 0/0', 'Realer Kundeneinstieg beginnt separat am belegten Setup-/UAT-Entry-Gate.'] });
    for (const mutate of [
      (value: ReturnType<typeof v1Fixture>) => { value.productResult = 'PENDING'; },
      (value: ReturnType<typeof v1Fixture>) => { value.v1Acceptance.processControls.openP1 = 1; },
      (value: ReturnType<typeof v1Fixture>) => { value.v1Acceptance.deliverables.completed = 8; },
      (value: ReturnType<typeof v1Fixture>) => { value.checks.realBcExecution = true; },
    ]) { const value = v1Fixture(); mutate(value); expect(() => validateV1DemoReadiness(value)).toThrow(AdapterSourceError); }
  });

  it('blockiert fehlende, ungeindexte und unsichere Exportartefakte', () => {
    for (const mutate of [
      (value: ReturnType<typeof spectra09Fixture>) => { value.exportMap.artifacts = []; },
      (value: ReturnType<typeof spectra09Fixture>) => { value.exportMap.artifacts.push({ ...value.exportMap.artifacts[0], id: 'UABC-SRC-EXTRA-001' }); },
      (value: ReturnType<typeof spectra09Fixture>) => { value.exportMap.artifacts[0].path = '../evidence/test.json'; },
    ]) { const value = spectra09Fixture(); mutate(value); expect(() => validateSpectra09ContractData(value)).toThrow(AdapterSourceError); }
  });

  it('blockiert Hash-, Digest- und Source-Mutationen sowie Schreib- oder Overwriterechte', () => {
    for (const mutate of [
      (value: ReturnType<typeof spectra09Fixture>) => { value.provenance.source.source_hash = '3'.repeat(64); },
      (value: ReturnType<typeof spectra09Fixture>) => { value.provenance.source.source_hash_after = '3'.repeat(64); },
      (value: ReturnType<typeof spectra09Fixture>) => { value.provenance.projection.projection_digest = '3'.repeat(64); },
      (value: ReturnType<typeof spectra09Fixture>) => { value.provenance.write_protection.writes_performed = true; },
      (value: ReturnType<typeof spectra09Fixture>) => { value.provenance.write_protection.overwrite_allowed = true; },
    ]) { const value = spectra09Fixture(); mutate(value); expect(() => validateSpectra09ContractData(value)).toThrow(AdapterSourceError); }
  });

  it('blockiert eine falsche Spectra-0.9-Bindung und eine abweichende Mappingversion', () => {
    const wrongRelease = spectra09Fixture(); wrongRelease.release.tag.name = 'spectra-v0.9.0-alpha.2'; expect(() => validateSpectra09ContractData(wrongRelease)).toThrow(AdapterSourceError);
    const wrongMapping = spectra09Fixture(); wrongMapping.exportMap.mappingVersion = '1.0.1'; expect(() => validateSpectra09ContractData(wrongMapping)).toThrow(AdapterSourceError);
  });
});
