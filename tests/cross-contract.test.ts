import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import { blueprintSourceBinding } from '../src/projects/blueprint-source';
import { officialBcBasicSnapshotAnchor, snapshotSourceBinding } from '../src/projects/blueprint-source';
import { productionRegistry } from '../src/projects/registry';
import { AdapterSourceError, createTwinState, validateCanonicalPlanPhase, validateProjectDataIndexContract } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/legacy-git-api';

const sourceRepo = process.env.UABC_CROSS_BLUEPRINT_REPO;
const expectedCommit = process.env.UABC_CROSS_BLUEPRINT_COMMIT;
const enabled = Boolean(sourceRepo && expectedCommit);
const contract = { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } as const;
const cleanGitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function git(args: string[]) {
  return execFileSync('git', ['-c', `safe.directory=${sourceRepo}`, '--no-optional-locks', '-C', sourceRepo!, ...args], { encoding: 'utf8', env: cleanGitEnvironment }).trim();
}

function gitBlob(revisionPath: string) {
  return execFileSync('git', ['-c', `safe.directory=${sourceRepo}`, '--no-optional-locks', '-C', sourceRepo!, 'show', revisionPath], { encoding: null, env: cleanGitEnvironment });
}

describe('Konfiguration des projektübergreifenden Vertrags', () => {
  it('setzt Quellrepository und erwarteten Commit entweder gemeinsam oder gar nicht', () => {
    expect(Boolean(sourceRepo)).toBe(Boolean(expectedCommit));
  });
  it('weist ein Mapping in consumerRules deterministisch als ungültigen Quellvertrag ab', () => {
    const index = { schemaVersion: 1, contractId: 'UABC-PROJECT-DATA-V1', contractRole: 'repository-relative-data-allowlist', snapshotManifestIncluded: false,
      projectId: 'UABC-BC-BASIC-001', projectKey: 'BCB', routeKey: 'bc-basic', displayName: 'BC Basic', governingChange: 'deliver-bc-basic-customer-project', lifecycleStatus: 'proposed',
      readOnly: true, sourceOfTruth: 'openspec', pathSemantics: 'repository-relative', missingValuePolicy: 'leer', consumerRules: [{ Zählsurface: 'kundenlesbare Kundenstory-Tickets' }],
      referenceDefinitions: { jiraRefs: ['UABC-1'] }, artifacts: [{ id: 'UABC-SRC-TEST-001', kindId: 'test-source', path: 'evidence/test.yaml', format: 'yaml', required: true }] };
    expect(() => validateProjectDataIndexContract(index)).toThrowError(AdapterSourceError);
    try { validateProjectDataIndexContract(index); } catch (error) { expect(error).toMatchObject({ code: 'QUELLVERTRAG_UNGUELTIG' }); }
  });
  it.each([
    ['abweichende ID', { id: 'UABC-2', jiraRef: 'UABC-1', plannedHours: 22 }],
    ['abweichende Jira-Referenz', { id: 'UABC-1', jiraRef: 'UABC-2', plannedHours: 22 }],
    ['abweichende Stundenbasis', { id: 'UABC-1', jiraRef: 'UABC-1', plannedHours: 23 }],
  ])('blockiert eine Planphase mit %s', (_label, plan) => {
    expect(() => validateCanonicalPlanPhase({ id: 'UABC-1', phaseId: 'UABC-1', estimateHours: 22 }, plan)).toThrowError(AdapterSourceError);
  });
});

describe.runIf(enabled)('commitgebundener Twin-Blueprint-Vertrag', () => {
  it('bindet den offiziell validierten Branch-Commit samt Katalog positiv und falsche Anker fail-closed', async () => {
    expect(path.isAbsolute(sourceRepo!)).toBe(true);
    expect(expectedCommit).toBe(officialBcBasicSnapshotAnchor.commit);
    expect(git(['rev-parse', `refs/heads/${officialBcBasicSnapshotAnchor.integrationBranch}^{commit}`])).toBe(expectedCommit);
    expect(git(['rev-parse', `${expectedCommit}^{tree}`])).toBe(officialBcBasicSnapshotAnchor.tree);
    expect(git(['remote', 'get-url', 'origin'])).toBe(blueprintSourceBinding.remoteUrl);
    const statusBefore = git(['status', '--porcelain=v1', '--untracked-files=all']);
    const indexBytes = gitBlob(`${expectedCommit}:${blueprintSourceBinding.indexPath}`);
    const index = YAML.parse(indexBytes.toString('utf8'));
    const storyDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'project-story-core');
    const setupDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'setup-wave-1-projection');
    const coreFinancePayloadDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'core-finance-payload');
    const coreFinanceManifestDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'core-finance-package-manifest');
    const readbackDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'current-read-only-attempt');
    const nativeGraphDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'derived-native-reference-graph');
    const portableGraphDeclaration = index.artifacts.find((artifact: { kindId: string }) => artifact.kindId === 'portable-reference-graph');
    const rawStory = JSON.parse(gitBlob(`${expectedCommit}:${storyDeclaration.path}`).toString('utf8'));
    expect(createHash('sha256').update(indexBytes).digest('hex')).toBe(officialBcBasicSnapshotAnchor.sourceDigest);
    expect(index.artifacts).toHaveLength(officialBcBasicSnapshotAnchor.artifactCount);
    expect(index.artifacts.filter((artifact: { kindId: string }) => artifact.kindId === 'setup-wave-1-projection')).toHaveLength(1);
    expect(index.artifacts.filter((artifact: { kindId: string }) => artifact.kindId === 'core-finance-payload')).toHaveLength(1);
    expect(index.artifacts.filter((artifact: { kindId: string }) => artifact.kindId === 'core-finance-package-manifest')).toHaveLength(1);
    expect(index.artifacts.filter((artifact: { kindId: string }) => artifact.kindId === 'core-finance-payload-schema')).toHaveLength(1);
    expect(index.artifacts.filter((artifact: { kindId: string }) => artifact.kindId === 'current-read-only-attempt')).toHaveLength(1);
    expect(readbackDeclaration).toMatchObject({ id: 'UABC-SRC-BCB-W0-01-ATTEMPT-001', path: 'evidence/playthru-uabc-basic-de/wave-0-company-identity-readback.yaml', format: 'yaml', required: true });
    expect(createHash('sha256').update(gitBlob(`${expectedCommit}:${setupDeclaration.path}`)).digest('hex')).toBe(officialBcBasicSnapshotAnchor.setupProjectionDigest);
    expect(createHash('sha256').update(gitBlob(`${expectedCommit}:${coreFinancePayloadDeclaration.path}`)).digest('hex')).toBe(officialBcBasicSnapshotAnchor.coreFinancePayloadDigest);
    expect(createHash('sha256').update(gitBlob(`${expectedCommit}:${coreFinanceManifestDeclaration.path}`)).digest('hex')).toBe(officialBcBasicSnapshotAnchor.coreFinanceManifestDigest);
    expect(JSON.parse(gitBlob(`${expectedCommit}:${nativeGraphDeclaration.path}`).toString('utf8')).relations).toHaveLength(officialBcBasicSnapshotAnchor.nativeRelationCount);
    expect(JSON.parse(gitBlob(`${expectedCommit}:${portableGraphDeclaration.path}`).toString('utf8')).edges).toHaveLength(officialBcBasicSnapshotAnchor.portableEdgeCount);
    expect(index.documentCatalog.documentCount).toBe(officialBcBasicSnapshotAnchor.documentCount);
    expect(index.deliveryBranch).toBe(officialBcBasicSnapshotAnchor.integrationBranch);
    const previousMode = process.env.UABC_BRANCH_COMMIT_CONTRACT; process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try {
      const sourceBinding = snapshotSourceBinding(expectedCommit, officialBcBasicSnapshotAnchor.tree, officialBcBasicSnapshotAnchor.bootstrapBranch, false);
      const state = await createTwinState('bc-basic', sourceRepo!, { sourceBinding, projectDataContract: contract });
      expect(state.source.commit).toBe(expectedCommit); expect(state.documents).toHaveLength(officialBcBasicSnapshotAnchor.documentCount); expect(state.documents.filter((document) => document.documentType === 'confluence-page')).toHaveLength(officialBcBasicSnapshotAnchor.confluenceDocumentCount);
      expect(state.presentation?.spaces).toHaveLength(3); expect(state.presentation?.spaces.flatMap((space) => space.nodes)).toHaveLength(officialBcBasicSnapshotAnchor.navigationNodeCount); expect(state.presentation?.spaces.map((space) => space.nodes.filter((node) => node.kind === 'page' && node.parentId?.startsWith('UABC-NAV-NODE-')).length)).toEqual([12, 8, 8]); expect(state.presentation?.jira.tickets.length).toBeGreaterThan(0); expect(state.presentation?.jira.canonicalTicketCount).toBe(state.presentation?.jira.tickets.length); expect(state.presentation?.jira.ticketTypes.map((type) => type.type)).toEqual(['phase', 'epic', 'story', 'task']); expect(state.presentation?.jira.tickets.slice(0, 3).map((ticket) => ticket.type)).toEqual(['phase', 'phase', 'phase']); expect(state.presentation?.jira.views).toHaveLength(2);
      expect(state.story?.tickets).toHaveLength(50);
      expect(state.story?.tickets.reduce<Record<string, number>>((counts, ticket) => ({ ...counts, [ticket.type]: (counts[ticket.type] ?? 0) + 1 }), {})).toEqual({ phase: 3, epic: 10, story: 18, task: 19 });
      expect(state.story?.tickets.reduce<Record<string, number>>((counts, ticket) => ({ ...counts, [ticket.status]: (counts[ticket.status] ?? 0) + 1 }), {})).toEqual({ 'in-progress': 2, blocked: 3, created: 45 });
      expect(state.story?.offer).toMatchObject({ currentVersion: 'pilot-rebaseline-2026-07-13', versions: [], plannedHours: 80, plannedCost: 9600, actualHours: 2.5, actualCost: 300 });
      expect(state.story?.controls).toMatchObject({ worklogHours: 2.5, worklogCost: 300, realBcExecution: false });
      expect(state.story?.tickets.flatMap((ticket) => ticket.worklogs)).toHaveLength(3);
      expect(state.story?.timeline.every((event) => event.result === 'offen-geplant')).toBe(true);
      expect(state.story?.hypercare.every((day) => day.status === 'planned' && day.retest === 'not-executed')).toBe(true);
      expect(rawStory).toMatchObject({ classification: 'current-pilot-planning', status: 'in-progress', historicalClassification: 'archived-in-git-history', activeOffer: { status: 'planned-not-accepted', plannedHours: 80, actualHours: 2.5, customerAcceptanceClaimed: false }, businessCentralPilotState: { baselineKind: 'standard-cronus-demo', customerTargetRealized: false, originMechanismStatus: 'unbekannt-bis-wave0-readback', copyRenameHypothesis: 'nutzerhinweis-unbestaetigt', pilotConfigured: false, writesApplied: false, readbackStatus: 'pending' } });
      expect(state.artifacts.find((artifact) => artifact.id === 'UABC-1')).toMatchObject({ kind: 'phase', phaseId: 'UABC-1', sourcePhase: 'P1', estimateHours: 22, actualHours: 0, billable: false, status: 'in-progress' });
      expect(state.artifacts.some((artifact) => artifact.kind === 'task' && artifact.billable === true)).toBe(true);
      expect(state.story?.tickets.find((ticket) => ticket.id === 'UABC-32')).toMatchObject({ reporter: 'P-PILOT-LEAD-001', reporterRole: expect.stringContaining('Projektleitung'), assigneeRole: expect.stringContaining('Lead BC Consultant'), createdAt: '2026-07-13', closedAt: null, estimateHours: 5.5, remainingHours: 5.5, billable: true, description: expect.stringContaining('Projektauftrag'), documentRefs: ['PAGE-UABC-130'], deliverableRefs: ['UABC-DEL-BCB-001'], decisionRefs: ['UABC-DEC-BCB-003', 'UABC-DEC-BCB-010'] });
      expect(state.story?.tickets.find((ticket) => ticket.id === 'UABC-39')).toMatchObject({ status: 'blocked', estimateHours: 5, actualHours: 0.5, remainingHours: 4.5, billable: true, closedAt: null, comments: [{ id: 'COM-UABC-39-W0-01-START' }, { id: 'COM-UABC-39-W0-01-BLOCKED' }, { id: 'COM-UABC-39-W0-01-RETRY-BLOCKED' }], worklogs: [{ hours: 0.25, cost: 30 }, { hours: 0.25, cost: 30 }] });
      expect(state.story?.tickets.find((ticket) => ticket.id === 'UABC-40')).toMatchObject({ status: 'in-progress', estimateHours: 9, actualHours: 2, remainingHours: 7, billable: true, closedAt: null, worklogs: [{ hours: 2, cost: 240 }] });
      expect(state.source.snapshot?.spectraReleaseBinding.releaseTag).toBe('spectra-v1.0.0');
      expect(state.artifacts.find((artifact) => artifact.id === 'UABC-SRC-BCB-COMPANY-EXEC-EVIDENCE-001')).toBeUndefined();
      expect(state.artifacts.some((artifact) => artifact.sourceType === 'country-company-information-execution-evidence' && artifact.currentAuthority !== false)).toBe(false);
      expect(state.artifacts.find((artifact) => artifact.id === 'UABC-SRC-BCB-W0-01-ATTEMPT-001')).toMatchObject({ sourceType: 'current-read-only-attempt', status: 'blocked-before-dom-readback', classification: 'current-read-only-attempt', currentAuthority: true, currentRollupContribution: true, actualHours: null });
      expect(state.setupWave).toMatchObject({ readOnly: true, writesAuthorized: false, target: { companyId: 'UABC-BASIC-DE', pilotName: 'Universaarl GmbH (BC Basic Pilot)', legacyName: 'Universaarl GmbH (Legacy)' }, configurationState: { baselineKind: 'standard-cronus-demo', baselineProvenance: 'microsoft-standard-cronus-demo-data', customerTargetRealized: false, originMechanismStatus: 'unbekannt-bis-wave0-readback', copyRenameHypothesis: 'nutzerhinweis-unbestaetigt', setupStatus: 'blockiert-bis-dom-readback-und-zielkonfiguration', pilotConfigured: false, writesApplied: false, readbackStatus: 'pending', internalCompanyId: null, targetDecision: 'pending-wave-0-evidence', resetDecision: 'pending-resetpoint-evidence', targetState: { classification: 'bc-basic-target-not-applied' }, appliedDifference: { status: 'none-evidenced', readbackEvidenceCount: 0 }, wave0ReadbackAttempt: { status: 'blocked-before-dom-readback', bcReadbackAuthority: false, bcFieldValuesRead: false, screenshotCaptured: false, writesPerformed: false }, companyStrategyGate: { status: 'blocked-pending-wave0-and-reset-evidence', selectedOption: null, decisionEvidenceCount: 0, nextExecutableStep: 'W0-01-read-company-identity', writesAuthorized: false } }, coreFinancePreparation: { status: 'prepared-for-controlled-live-run', packageTableCount: 19, packageRecordCount: 51, manualTableCount: 7, manualRecordCount: 18, accountRoleCount: 11, dimensionCount: 2, dimensionValueCount: 5, numberSeriesCount: 9, realBankIdentifierCount: 0, performed: false, applied: false, accepted: false, requiredGatesClosed: false }, preflight: { wave0Status: 'blocked-before-dom-readback', resetPoint: { status: 'missing-blocker' } }, writeGate: { nextAllowedStep: 'W0-01-read-company-identity', noGoSteps: ['RUN-06', 'RUN-07', 'RUN-08', 'RUN-09', 'RUN-10', 'RUN-11', 'RUN-12', 'RUN-13', 'RUN-14', 'RUN-15', 'RUN-16', 'RUN-17', 'RUN-18', 'RUN-19', 'RUN-20', 'RUN-21', 'RUN-22'] }, packages: [{ tables: 0, records: 0, errors: 0 }, { tables: 0, records: 0, errors: 0 }, { tables: 0, records: 0, errors: 0 }] });
      expect(state.documents.some((document) => document.content.includes('Standard-CRONUS') && document.content.includes('W0-01'))).toBe(true);
      const api = await dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, expectedCommit!, officialBcBasicSnapshotAnchor.tree, officialBcBasicSnapshotAnchor.bootstrapBranch, false));
      expect(api).toMatchObject({ status: 200, body: { source: { commit: expectedCommit }, documents: expect.any(Array), presentation: { spaces: expect.any(Array), jira: { tickets: expect.any(Array) } } } });
      await expect(dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, expectedCommit!, '0'.repeat(40), officialBcBasicSnapshotAnchor.bootstrapBranch, false))).resolves.toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    } finally { if (previousMode === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previousMode; }
    expect(git(['status', '--porcelain=v1', '--untracked-files=all'])).toBe(statusBefore);
  }, 120_000);
});
