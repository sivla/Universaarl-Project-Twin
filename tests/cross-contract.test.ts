import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import { blueprintSourceBinding } from '../src/projects/blueprint-source';
import { officialBcBasicSnapshotAnchor, snapshotSourceBinding } from '../src/projects/blueprint-source';
import { productionRegistry } from '../src/projects/registry';
import { AdapterSourceError, createTwinState, validateCanonicalPlanPhase, validateProjectDataIndexContract } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/api';

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
    expect(createHash('sha256').update(indexBytes).digest('hex')).toBe(officialBcBasicSnapshotAnchor.sourceDigest);
    expect(index.artifacts).toHaveLength(officialBcBasicSnapshotAnchor.artifactCount);
    expect(index.artifacts.filter((artifact: { kindId: string }) => artifact.kindId === 'setup-wave-1-projection')).toHaveLength(1);
    expect(index.documentCatalog.documentCount).toBe(officialBcBasicSnapshotAnchor.documentCount);
    expect(index.deliveryBranch).toBe(officialBcBasicSnapshotAnchor.integrationBranch);
    const previousMode = process.env.UABC_BRANCH_COMMIT_CONTRACT; process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try {
      const sourceBinding = snapshotSourceBinding(expectedCommit, officialBcBasicSnapshotAnchor.tree, officialBcBasicSnapshotAnchor.bootstrapBranch, false);
      const state = await createTwinState('bc-basic', sourceRepo!, { sourceBinding, projectDataContract: contract });
      expect(state.source.commit).toBe(expectedCommit); expect(state.documents).toHaveLength(officialBcBasicSnapshotAnchor.documentCount); expect(state.documents.filter((document) => document.documentType === 'confluence-page')).toHaveLength(officialBcBasicSnapshotAnchor.confluenceDocumentCount);
      expect(state.presentation?.spaces).toHaveLength(3); expect(state.presentation?.spaces.flatMap((space) => space.nodes)).toHaveLength(officialBcBasicSnapshotAnchor.navigationNodeCount); expect(state.presentation?.spaces.map((space) => space.nodes.filter((node) => node.kind === 'page' && node.parentId?.startsWith('UABC-NAV-NODE-')).length)).toEqual([12, 8, 8]); expect(state.presentation?.jira.tickets.length).toBeGreaterThan(0); expect(state.presentation?.jira.canonicalTicketCount).toBe(state.presentation?.jira.tickets.length); expect(state.presentation?.jira.ticketTypes.map((type) => type.type)).toEqual(['phase', 'epic', 'story', 'task']); expect(state.presentation?.jira.tickets.slice(0, 3).map((ticket) => ticket.type)).toEqual(['phase', 'phase', 'phase']); expect(state.presentation?.jira.views).toHaveLength(2);
      expect(state.artifacts.find((artifact) => artifact.id === 'UABC-1')).toMatchObject({ kind: 'phase', phaseId: 'UABC-1', sourcePhase: 'P1', estimateHours: 22, actualHours: 22, billable: false });
      expect(state.artifacts.some((artifact) => artifact.kind === 'task' && artifact.billable === true)).toBe(true);
      expect(state.story?.tickets.find((ticket) => ticket.id === 'UABC-32')).toMatchObject({ reporter: 'P-PILOT-LEAD-001', reporterRole: 'Projektleitung', assigneeRole: 'Projektleitung', createdAt: '2026-04-06', closedAt: '2026-04-08', description: expect.stringContaining('Projektauftrag'), documentRefs: ['PAGE-UABC-130'], deliverableRefs: ['UABC-DEL-BCB-001'], decisionRefs: ['UABC-DEC-BCB-003'] });
      expect(state.artifacts.find((artifact) => artifact.sourceType === 'spectra-adapter-provenance')?.activity).toContain(`Projektionsdigest: ${officialBcBasicSnapshotAnchor.projectionDigest}`);
      expect(state.artifacts.find((artifact) => artifact.id === 'UABC-SRC-BCB-COMPANY-EXEC-EVIDENCE-001')).toMatchObject({ sourceType: 'country-company-information-execution-evidence' });
      expect(state.setupWave).toMatchObject({ readOnly: true, writesAuthorized: false, target: { pilotName: 'Universaarl GmbH (BC Basic Pilot)', legacyName: 'Universaarl GmbH (Legacy)' }, preflight: { resetPoint: { status: 'missing-blocker' } }, packages: [{ tables: 0, records: 0, errors: 0 }, { tables: 0, records: 0, errors: 0 }, { tables: 0, records: 0, errors: 0 }] });
      expect(state.documents.some((document) => document.content.includes('Country/Region `DE`') && document.content.includes('Company Information'))).toBe(true);
      const api = await dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, expectedCommit!, officialBcBasicSnapshotAnchor.tree, officialBcBasicSnapshotAnchor.bootstrapBranch, false));
      expect(api).toMatchObject({ status: 200, body: { source: { commit: expectedCommit }, documents: expect.any(Array), presentation: { spaces: expect.any(Array), jira: { tickets: expect.any(Array) } } } });
      await expect(dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, expectedCommit!, '0'.repeat(40), officialBcBasicSnapshotAnchor.bootstrapBranch, false))).resolves.toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    } finally { if (previousMode === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previousMode; }
    expect(git(['status', '--porcelain=v1', '--untracked-files=all'])).toBe(statusBefore);
  }, 120_000);
});
