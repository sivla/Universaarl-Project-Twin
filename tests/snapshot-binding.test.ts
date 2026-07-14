import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { blueprintSourceBinding, snapshotSourceBinding } from '../src/projects/blueprint-source';
import { createProjectRegistry, productionRegistry, type ProjectSourceBinding } from '../src/projects/registry';
import { AdapterSourceError, createTwinState, resolveEvidenceId, evidenceReadStable } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/legacy-git-api';

const environment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

it('trennt Race-Entscheidung zwischen Contract- und Legacy-Modus', () => {
  expect(() => evidenceReadStable(true, false)).toThrowError(AdapterSourceError);
  expect(evidenceReadStable(false, false)).toBe(false);
  expect(evidenceReadStable(true, true)).toBe(true);
});

function git(root: string, args: string[]) {
  return execFileSync('git', ['-C', root, '--no-optional-locks', ...args], { encoding: 'utf8', env: environment }).trim();
}

function write(root: string, relative: string, content: string | Buffer) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-snapshot-'));
  execFileSync('git', ['init', '-q', '-b', blueprintSourceBinding.branch, root], { env: environment });
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'user.name', 'Snapshot-Test']);
  git(root, ['config', 'user.email', 'snapshot@example.invalid']);
  git(root, ['remote', 'add', 'origin', blueprintSourceBinding.remoteUrl]);
  write(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Architektur\nlifecycleStatus: approved\n');
  write(root, 'evidence/verification-register.yaml', 'verifications: []\n');
  write(root, 'evidence/run/frame.png', png);
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'Snapshot']);
  return root;
}

function binding(root: string) {
  return snapshotSourceBinding(git(root, ['rev-parse', 'HEAD']));
}

function indexHash(root: string) {
  const name = git(root, ['rev-parse', '--git-path', 'index']);
  return createHash('sha256').update(fs.readFileSync(path.isAbsolute(name) ? name : path.resolve(root, name))).digest('hex');
}

async function expectBoundRejection(root: string, sourceBinding: ProjectSourceBinding = binding(root), hook?: () => void) {
  await expect(createTwinState('universaarl', root, { sourceBinding, testHookAfterRead: hook })).rejects.toBeInstanceOf(AdapterSourceError);
}

describe('Produktionskonfiguration der Snapshot-Quelle', () => {
  it('verlangt Pfad und vollständige SHA unmittelbar gemeinsam', () => {
    expect(() => productionRegistry(path.resolve('quelle'))).toThrow(/Commit-SHA/);
    expect(() => productionRegistry(path.resolve('quelle'), 'abc')).toThrow(/Commit-SHA/);
    expect(() => productionRegistry('', '0'.repeat(40))).toThrow();
    expect(productionRegistry(path.resolve('quelle'), '0'.repeat(40))).toHaveLength(2);
  });
});

describe('Negativprüfungen der Snapshot-Bindung', () => {
  it('liest im Branchmodus ausschließlich den gepinnten Commit und niemals den Dirty-Arbeitsbaum', async () => {
    const root = fixture();
    const previousMode = process.env.UABC_BRANCH_COMMIT_CONTRACT;
    process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try {
      write(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Nicht commitgebundene Änderung\n');
      const state = await createTwinState('universaarl', root, { sourceBinding: binding(root) });
      expect(state.source.dirty).toBe(false);
      expect(state.artifacts.find((artifact) => artifact.id === 'UABC-ARCH-001')?.title).toBe('Architektur');
    } finally {
      if (previousMode === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previousMode;
    }
  });

  it('blockiert eine Bewegung des Producerbranchs während des gepinnten Lesens', async () => {
    const root = fixture();
    const previousMode = process.env.UABC_BRANCH_COMMIT_CONTRACT;
    process.env.UABC_BRANCH_COMMIT_CONTRACT = '1';
    try {
      await expectBoundRejection(root, binding(root), () => { git(root, ['commit', '--allow-empty', '-q', '-m', 'Branch bewegt']); });
    } finally {
      if (previousMode === undefined) delete process.env.UABC_BRANCH_COMMIT_CONTRACT; else process.env.UABC_BRANCH_COMMIT_CONTRACT = previousMode;
    }
  });

  it('lehnt falsches Remote, falschen Branch und abweichendes HEAD ab', async () => {
    const remote = fixture();
    await expectBoundRejection(remote, { ...binding(remote), expectedRemote: 'https://example.invalid/fremd.git' } as ProjectSourceBinding);
    const branch = fixture();
    await expectBoundRejection(branch, { ...binding(branch), expectedBranch: 'fremder-branch' } as ProjectSourceBinding);
    const head = fixture();
    await expectBoundRejection(head, { ...binding(head), expectedCommit: '0'.repeat(40) });
  });

  it('lehnt unsauberen Checkout auch bei gleicher Porcelain-Form und anderem Inhalt ab', async () => {
    const root = fixture();
    const file = write(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Erste Änderung\n');
    const firstStatus = git(root, ['status', '--porcelain=v1']);
    await expectBoundRejection(root);
    fs.writeFileSync(file, 'artifactId: UABC-ARCH-001\ntitle: Zweite Änderung\n');
    expect(git(root, ['status', '--porcelain=v1'])).toBe(firstStatus);
    await expectBoundRejection(root);
  });

  it('erkennt HEAD-, Index- und Inhaltsänderungen während des Lesens', async () => {
    const head = fixture();
    await expectBoundRejection(head, binding(head), () => { git(head, ['commit', '--allow-empty', '-q', '-m', 'Geändert']); });
    const index = fixture();
    await expectBoundRejection(index, binding(index), () => { write(index, 'neu.txt', 'Index'); git(index, ['add', 'neu.txt']); });
    const content = fixture();
    await expectBoundRejection(content, binding(content), () => { write(content, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Verändert\n'); });
  });

  it('verändert bei erfolgreichem Lesen weder Arbeitskopie, Index noch Referenzen', async () => {
    const root = fixture();
    const before = { status: git(root, ['status', '--porcelain=v1', '-z']), head: git(root, ['rev-parse', 'HEAD']), index: indexHash(root) };
    const state = await createTwinState('universaarl', root, { sourceBinding: binding(root) });
    expect(state.source.commit).toBe(before.head);
    expect({ status: git(root, ['status', '--porcelain=v1', '-z']), head: git(root, ['rev-parse', 'HEAD']), index: indexHash(root) }).toEqual(before);
  });
});

describe('Gemeinsame Bindung für Zustand und Nachweise', () => {
  it('führt bei fehlendem Snapshotvertrag niemals den generischen Tree-Leser aus', async () => {
    const reader = vi.fn();
    const registry = createProjectRegistry([{ id: 'universaarl', key: 'UABC', name: 'Universaarl', sourceRoot: 'C:\\quelle' }]);
    await expect(dispatchProjectApi('GET', '/api/projects/universaarl/state', registry, reader)).resolves.toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    expect(reader).not.toHaveBeenCalled();
  });

  it('blockiert generische Quellen ohne kanonisches Snapshotmanifest auch für Zustand und Nachweis', async () => {
    const root = fixture();
    const sourceBinding = binding(root);
    const registry = productionRegistry(root, sourceBinding.expectedCommit);
    expect(registry).toHaveLength(2);
    expect(await dispatchProjectApi('GET', '/api/projects/universaarl/state', registry)).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    expect(await dispatchProjectApi('GET', '/api/projects/universaarl/evidence/ev_000000000000000000000000', registry)).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
  });
});
