import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { blueprintSourceBinding, snapshotSourceBinding } from '../src/projects/blueprint-source';
import { productionRegistry, type ProjectSourceBinding } from '../src/projects/registry';
import { AdapterSourceError, createTwinState, resolveEvidenceId } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/api';

const environment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

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
  it('liefert Zustand und Nachweis nur unter derselben gültigen Produktionsbindung', async () => {
    const root = fixture();
    const sourceBinding = binding(root);
    const registry = productionRegistry(root, sourceBinding.expectedCommit);
    const stateResult = await dispatchProjectApi('GET', '/api/projects/universaarl/state', registry);
    expect(stateResult.status).toBe(200);
    const state = stateResult.body as Awaited<ReturnType<typeof createTwinState>>;
    const evidenceId = state.evidenceItems[0].id;
    expect((await dispatchProjectApi('GET', `/api/projects/universaarl/evidence/${evidenceId}`, registry)).binary?.bytes).toEqual(png);
    expect(resolveEvidenceId('universaarl', root, evidenceId, { sourceBinding: { ...sourceBinding, expectedCommit: '0'.repeat(40) } })).toBeNull();
  });
});
