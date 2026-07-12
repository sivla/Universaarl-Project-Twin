import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import YAML from 'yaml';
import { blueprintSourceBinding } from '../src/projects/blueprint-source';
import { officialBcBasicSnapshotAnchor, snapshotSourceBinding } from '../src/projects/blueprint-source';
import { productionRegistry } from '../src/projects/registry';
import { AdapterSourceError, createTwinState } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/api';

const sourceRepo = process.env.UABC_CROSS_BLUEPRINT_REPO;
const expectedCommit = process.env.UABC_CROSS_BLUEPRINT_COMMIT;
const enabled = Boolean(sourceRepo && expectedCommit);
const contract = { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } as const;
const cleanGitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function git(args: string[]) {
  return execFileSync('git', ['-c', `safe.directory=${sourceRepo}`, '--no-optional-locks', '-C', sourceRepo!, ...args], { encoding: 'utf8', env: cleanGitEnvironment }).trim();
}

describe('Konfiguration des projektübergreifenden Vertrags', () => {
  it('setzt Quellrepository und erwarteten Commit entweder gemeinsam oder gar nicht', () => {
    expect(Boolean(sourceRepo)).toBe(Boolean(expectedCommit));
  });
});

describe.runIf(enabled)('commitgebundener Twin-Blueprint-Vertrag', () => {
  it('bindet den offiziell validierten Branch-Commit samt Katalog positiv und falsche Anker fail-closed', async () => {
    expect(path.isAbsolute(sourceRepo!)).toBe(true);
    expect(expectedCommit).toBe(officialBcBasicSnapshotAnchor.commit);
    expect(git(['rev-parse', 'HEAD'])).toBe(expectedCommit);
    expect(git(['rev-parse', 'HEAD^{tree}'])).toBe(officialBcBasicSnapshotAnchor.tree);
    expect(git(['remote', 'get-url', 'origin'])).toBe(blueprintSourceBinding.remoteUrl);
    expect(git(['branch', '--show-current'])).toBe(blueprintSourceBinding.branch);
    const statusBefore = git(['status', '--porcelain=v1', '--untracked-files=all']);
    const index = YAML.parse(git(['show', `${expectedCommit}:${blueprintSourceBinding.indexPath}`]));
    expect(index.artifacts).toHaveLength(officialBcBasicSnapshotAnchor.artifactCount);
    expect(index.documentCatalog.documentCount).toBe(officialBcBasicSnapshotAnchor.documentCount);
    const previousMode = process.env.UABC_BRANCH_COMMIT_CONTRACT; process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try {
      const sourceBinding = snapshotSourceBinding(expectedCommit, officialBcBasicSnapshotAnchor.tree);
      const state = await createTwinState('bc-basic', sourceRepo!, { sourceBinding, projectDataContract: contract });
      expect(state.source.commit).toBe(expectedCommit); expect(state.documents).toHaveLength(32); expect(state.documents.filter((document) => document.documentType === 'confluence-page')).toHaveLength(19);
      const api = await dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, expectedCommit!, officialBcBasicSnapshotAnchor.tree));
      expect(api).toMatchObject({ status: 200, body: { source: { commit: expectedCommit }, documents: expect.any(Array) } });
      await expect(dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, expectedCommit!, '0'.repeat(40)))).resolves.toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    } finally { if (previousMode === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previousMode; }
    expect(git(['status', '--porcelain=v1', '--untracked-files=all'])).toBe(statusBefore);
  }, 120_000);
});
