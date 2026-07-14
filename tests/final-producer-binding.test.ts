import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createTwinState } from '../src/server/adapter';
import { snapshotSourceBinding } from '../src/projects/blueprint-source';

const sourceRepo = process.env.UABC_CROSS_BLUEPRINT_REPO;
const enabled = Boolean(sourceRepo);
const commit = '6583b6f070979de23c4746bd69c6d328b5ef889f';
const tree = '3c9a19fdda0f31605c712ea500dbede1d08ca5d5';
const indexDigest = '0dc4d17750ef5ae7d5705fd46d462936ad20b0b0ba64a2321ec8a9ef64bccadf';
const contract = { manifestPath: 'exports/project-data/v1/snapshot-manifest.json', schemaPath: 'governance/schemas/project-snapshot-manifest.schema.json', indexPath: 'exports/project-data/v1/index.yaml', expectedProjectId: 'UABC-BC-BASIC-001', expectedProducerId: 'blueprint' } as const;
const gitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
function git(args: string[], binary = false) { const output = execFileSync('git', ['-c', `safe.directory=${sourceRepo}`, '--no-optional-locks', '-C', sourceRepo!, ...args], { env: gitEnvironment, encoding: binary ? null : 'utf8' }); return binary ? output as Buffer : String(output); }

describe.runIf(enabled)('finale BC-Basic-Producerbindung', () => {
  it('liest den portablen exakten Producer-Commit und bindet den Index-Digest', async () => {
    expect(String(git(['cat-file', '-e', `${commit}^{commit}`])).trim()).toBe('');
    expect(String(git(['rev-parse', `${commit}^{tree}`])).trim()).toBe(tree);
    expect(String(git(['remote', 'get-url', 'origin'])).trim()).toBe('https://github.com/sivla/Universaarl-BC-Basic.git');
    const indexBytes = git(['show', `${commit}:exports/project-data/v1/index.yaml`], true) as Buffer;
    expect(createHash('sha256').update(indexBytes).digest('hex')).toBe(indexDigest);
    const provenance = JSON.parse((git(['show', `${commit}:evidence/simulation/adapter-provenance.json`], true) as Buffer).toString('utf8')) as { source: { source_hash: string; source_hash_after: string } };
    expect(provenance.source.source_hash).toBe(indexDigest);
    expect(provenance.source.source_hash_after).toBe(indexDigest);
    const previous = process.env.UABC_BRANCH_COMMIT_CONTRACT;
    process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try {
      const state = await createTwinState('bc-basic', sourceRepo!, { sourceBinding: snapshotSourceBinding(commit, tree, 'codex/universaarl-projekt', false), projectDataContract: contract });
      expect(state.source.commit).toBe(commit);
      expect(state.source.snapshot?.producerCommitSha).toBe(commit);
      expect(state.documents).toHaveLength(46);
      expect(state.story?.tickets).toHaveLength(50);
    } finally {
      if (previous === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previous;
    }
  }, 120_000);

  it('blockiert einen falschen Tree fail-closed', async () => {
    const previous = process.env.UABC_BRANCH_COMMIT_CONTRACT;
    process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try { await expect(createTwinState('bc-basic', sourceRepo!, { sourceBinding: snapshotSourceBinding(commit, '0'.repeat(40), 'codex/universaarl-projekt', false), projectDataContract: contract })).rejects.toThrow(); }
    finally { if (previous === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previous; }
  });
});
