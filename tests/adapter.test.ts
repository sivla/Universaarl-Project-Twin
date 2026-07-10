import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTwinState, readCapabilities, readJira, resolveEvidencePath } from '../src/server/adapter';

function write(root: string, relative: string, content: string | Buffer) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uabc-twin-'));
  execFileSync('git', ['init', '-b', 'main', root]);
  write(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Architecture\nlifecycleStatus: approved\napproval:\n  evidenceId: UABC-VER-APPROVAL-001\n  scope: W0 baseline\n');
  write(root, 'capabilities/catalog.yaml', 'artifactId: UABC-CAP-CATALOG-001\ndomains:\n  - id: UABC-CAP-FIN\n    name: Finance\n    capabilities:\n      - id: UABC-CAP-FIN-R2R\n        name: Record to Report\n        status: planned\n        wave: W1\n');
  write(root, 'atlassian/jira/issues/blueprint-wave.yaml', 'issues:\n  - key: UABC-1\n    type: Epic\n    summary: Test wave\n    status: Done\n    components: [Finance]\n    evidenceRefs: [UABC-VER-APPROVAL-001]\n    history:\n      - { at: 2026-07-10T10:00:00+02:00, from: Backlog, to: Done }\n');
  write(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '# Demo\n\n- Status: `archived`\n\n## Problem\nTest.\n');
  write(root, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Project\nstatus: W0 Complete\n---\n# Project\n');
  write(root, 'evidence/verification-register.yaml', 'artifactId: UABC-VER-REGISTER-001\nverifications:\n  - id: UABC-VER-APPROVAL-001\n    changeRef: demo\n    status: passed\n    type: human-approval\n    evidence: Human approval recorded.\n');
  write(root, 'evidence/run-1/frame.png', Buffer.from([137, 80, 78, 71]));
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Twin Test', '-c', 'user.email=twin@test.invalid', 'commit', '-m', 'fixture']);
  return root;
}

describe('read-only adapters', () => {
  it('normalizes every supported family and preserves provenance', async () => {
    const root = fixture(); const state = await createTwinState(root);
    expect(state.source).toMatchObject({ branch: 'main', dirty: false, pathLabel: path.basename(root) });
    expect(state.artifacts.map((item) => item.kind)).toEqual(expect.arrayContaining(['architecture', 'capability', 'epic', 'change', 'document', 'milestone']));
    expect(state.stats).toMatchObject({ jira: 1, changes: 1, documents: 1, capabilities: 1, evidence: 1, history: 1 });
    expect(state.warnings).toEqual([]);
  });

  it('maps capability waves and Jira workstreams without inferring status', async () => {
    const root = fixture();
    const capabilities = await readCapabilities(root); const jira = await readJira(root);
    expect(capabilities.artifacts[0]).toMatchObject({ id: 'UABC-CAP-FIN-R2R', phase: 'Initiate', wave: 'W1', status: 'planned', workstream: 'Finance' });
    expect(jira.artifacts[0]).toMatchObject({ id: 'UABC-1', kind: 'epic', status: 'Done', workstream: 'Finance' });
  });

  it('does not write to the source repository', async () => {
    const root = fixture(); const before = gitStatus(root); await createTwinState(root); expect(gitStatus(root)).toBe(before);
  });

  it('rejects missing, relative and non-Git sources', async () => {
    await expect(createTwinState('relative/source')).rejects.toThrow(/absolute path/);
    await expect(createTwinState('Z:/missing-uabc')).rejects.toThrow(/does not exist/);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uabc-not-git-'));
    await expect(createTwinState(directory)).rejects.toThrow(/not a Git worktree/);
  });

  it('contains malformed YAML as a visible warning', async () => {
    const root = fixture(); write(root, 'atlassian/jira/issues/broken.yaml', 'issues: [');
    const state = await createTwinState(root);
    expect(state.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Could not parse atlassian\/jira\/issues\/broken.yaml/)]));
    expect(state.artifacts.some((item) => item.id === 'UABC-1')).toBe(true);
  });

  it('reports unresolved stable references', async () => {
    const root = fixture();
    write(root, 'atlassian/jira/issues/blueprint-wave.yaml', 'issues:\n  - key: UABC-1\n    type: Epic\n    summary: Test wave\n    status: Done\n    dependencies: [UABC-NOT-DECLARED]\n');
    const state = await createTwinState(root);
    expect(state.warnings).toContain('Unresolved source references: UABC-NOT-DECLARED');
  });
});

describe('evidence security boundary', () => {
  it('allows only real PNG files below evidence', () => {
    const root = fixture();
    expect(resolveEvidencePath(root, 'evidence/run-1/frame.png')).toBe(path.join(root, 'evidence', 'run-1', 'frame.png'));
    expect(resolveEvidencePath(root, '../secret.png')).toBeNull();
    expect(resolveEvidencePath(root, 'evidence/../architecture/secret.png')).toBeNull();
    expect(resolveEvidencePath(root, path.join(root, 'evidence/run-1/frame.png'))).toBeNull();
    expect(resolveEvidencePath(root, 'evidence/trace.png')).toBeNull();
    expect(resolveEvidencePath(root, 'evidence/run-1/frame.jpg')).toBeNull();
  });
});

function gitStatus(root: string) { return execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }); }
