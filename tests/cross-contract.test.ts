import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import YAML from 'yaml';
import { blueprintSourceBinding } from '../src/projects/blueprint-source';
import { createTwinState } from '../src/server/adapter';

const sourceRepo = process.env.UABC_CROSS_BLUEPRINT_REPO;
const expectedCommit = process.env.UABC_CROSS_BLUEPRINT_COMMIT;
const hasSourceRepo = Boolean(sourceRepo);
const hasExpectedCommit = Boolean(expectedCommit);
const enabled = hasSourceRepo && hasExpectedCommit;
const contract = { path: blueprintSourceBinding.contractPath, expectedProjectId: blueprintSourceBinding.expectedProjectId } as const;
const cleanGitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function git(args: string[]) {
  return execFileSync('git', ['--no-optional-locks', '-C', sourceRepo!, ...args], { encoding: 'utf8', env: cleanGitEnvironment }).trim();
}

describe('Konfiguration des projektuebergreifenden Vertrags', () => {
  it('setzt Quellrepository und erwarteten Commit entweder gemeinsam oder gar nicht', () => {
    expect(hasSourceRepo).toBe(hasExpectedCommit);
  });
});

describe.runIf(enabled)('commitgebundener Twin-Blueprint-Vertrag', () => {
  it('liest den exakten BC-Basic-Index ohne globale Fallbackprojektion', async () => {
    expect(path.isAbsolute(sourceRepo!)).toBe(true);
    expect(expectedCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(git(['remote', 'get-url', 'origin'])).toBe(blueprintSourceBinding.remoteUrl);
    expect(git(['branch', '--show-current'])).toBe(blueprintSourceBinding.branch);
    expect(git(['rev-parse', 'HEAD'])).toBe(expectedCommit);
    expect(git(['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    const index = YAML.parse(git(['show', `${expectedCommit}:${blueprintSourceBinding.contractPath}`])) as { contractId: string; projectId: string; artifacts: Array<{ id: string; kindId: string; path: string; format: string }> };
    expect(index).toMatchObject({ contractId: 'UABC-PROJECT-DATA-V1', projectId: blueprintSourceBinding.expectedProjectId });
    const allowedPaths = new Set(index.artifacts.map((artifact) => artifact.path));
    const csvSources = index.artifacts.filter((artifact) => artifact.format === 'csv');
    const state = await createTwinState('bc-basic', sourceRepo!, { projectDataContract: contract });
    expect(state.source).toMatchObject({ projectId: 'bc-basic', commit: expectedCommit });
    expect(state.artifacts.length).toBeGreaterThan(20);
    expect(state.artifacts.every((artifact) => allowedPaths.has(artifact.sourcePath))).toBe(true);
    expect(state.artifacts.some((artifact) => artifact.id === 'UABC-18' && artifact.estimateHours === 68 && artifact.effort === null)).toBe(true);
    expect(state.artifacts.some((artifact) => artifact.id === 'UABC-22' && artifact.estimateHours === 2 && artifact.effort === '2h')).toBe(true);
    expect(state.artifacts.filter((artifact) => artifact.kind === 'evidence')).toHaveLength(8);
    expect(state.artifacts.filter((artifact) => artifact.kind === 'evidence').every((artifact) => artifact.status === 'pending' && artifact.rationale === null)).toBe(true);
    expect(csvSources).toHaveLength(14);
    for (const source of csvSources) expect(state.artifacts).toContainEqual(expect.objectContaining({
      id: source.id, kind: 'document', sourcePath: source.path, sourceType: source.kindId, documentType: source.kindId,
    }));
    expect(state.evidenceItems).toEqual([]);
    expect(JSON.stringify(state)).not.toMatch(/UABC-ARCH-|UABC-CAP-|frame\.png|walkthrough\.webm/);
  }, 30_000);
});
