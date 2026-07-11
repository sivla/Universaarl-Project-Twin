import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { blueprintSourceBinding } from '../src/projects/blueprint-source';
import { productionRegistry } from '../src/projects/registry';
import { AdapterSourceError, createTwinState } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/api';

const sourceRepo = process.env.UABC_CROSS_BLUEPRINT_REPO;
const blockedCommit = process.env.UABC_CROSS_BLUEPRINT_COMMIT;
const enabled = Boolean(sourceRepo && blockedCommit);
const contract = { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } as const;
const cleanGitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function git(args: string[]) {
  return execFileSync('git', ['--no-optional-locks', '-C', sourceRepo!, ...args], { encoding: 'utf8', env: cleanGitEnvironment }).trim();
}

describe('Konfiguration des projektübergreifenden Vertrags', () => {
  it('setzt Quellrepository und erwarteten Commit entweder gemeinsam oder gar nicht', () => {
    expect(Boolean(sourceRepo)).toBe(Boolean(blockedCommit));
  });
});

describe.runIf(enabled)('commitgebundener Twin-Blueprint-Vertrag', () => {
  it('behandelt den bekannten Blueprint-Commit ohne Snapshotmanifest als belegten Blockierfall', async () => {
    expect(path.isAbsolute(sourceRepo!)).toBe(true);
    expect(blockedCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(git(['rev-parse', 'HEAD'])).toBe(blockedCommit);
    expect(git(['remote', 'get-url', 'origin'])).toBe(blueprintSourceBinding.remoteUrl);
    expect(git(['branch', '--show-current'])).toBe(blueprintSourceBinding.branch);
    const statusBefore = git(['status', '--porcelain=v1', '--untracked-files=all']);
    expect(() => git(['cat-file', '-e', `${blockedCommit}:${blueprintSourceBinding.manifestPath}`])).toThrow();
    await expect(createTwinState('bc-basic', sourceRepo!, { sourceBinding: { expectedCommit: blockedCommit!, expectedRemote: blueprintSourceBinding.remoteUrl, expectedBranch: blueprintSourceBinding.branch }, projectDataContract: contract })).rejects.toBeInstanceOf(AdapterSourceError);
    await expect(dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(sourceRepo!, blockedCommit!))).resolves.toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    expect(git(['status', '--porcelain=v1', '--untracked-files=all'])).toBe(statusBefore);
  }, 30_000);
});
