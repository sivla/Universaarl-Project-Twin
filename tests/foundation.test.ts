import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { createProjectRegistry, findProject, productionRegistry, publicProjects } from '../src/projects/registry';
import { areas, parseRoute, projectUrl } from '../src/navigation/routes';
import { createTwinState, resolveEvidenceId, validateProvenancePath } from '../src/server/adapter';
import { dispatchProjectApi } from '../src/server/api';

function write(root: string, relative: string, content: string | Buffer) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uabc-shell-')); execFileSync('git', ['init', '-b', 'main', root]);
  write(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Architektur\nlifecycleStatus: approved\napproval:\n  evidenceId: UABC-VER-APPROVAL-001\n  scope: W0 baseline\n');
  write(root, 'capabilities/catalog.yaml', 'domains:\n  - id: UABC-CAP-FIN\n    name: Finance\n    capabilities:\n      - { id: UABC-CAP-FIN-R2R, name: Record to Report, status: planned, wave: W1 }\n');
  write(root, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Epic, summary: Test, status: Done, components: [Finance], evidenceRefs: [UABC-VER-APPROVAL-001] }\n');
  write(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '# Demo\n\n- Status: `archived`\n\n## Problem\nTest.\n');
  write(root, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Projekt\nstatus: W0 Complete\n---\n# Projekt\n');
  write(root, 'evidence/verification-register.yaml', 'verifications:\n  - id: UABC-VER-APPROVAL-001\n    changeRef: demo\n    status: passed\n    type: human-approval\n    evidence: Freigabe dokumentiert.\n');
  write(root, 'evidence/run/frame.png', Buffer.from([137, 80, 78, 71]));
  execFileSync('git', ['-C', root, 'add', '.']); execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']); return root;
}

describe('Projektregistry', () => {
  it('enthält produktiv exakt Universaarl', () => { const registry = productionRegistry('C:\\snapshot'); expect(publicProjects(registry)).toEqual([{ id: 'universaarl', key: 'UABC', name: 'Universaarl' }]); expect(JSON.stringify(publicProjects(registry))).not.toContain('snapshot'); });
  it('weist doppelte und ungültige Einträge zurück', () => { expect(() => createProjectRegistry([{ id: 'universaarl', key: 'UABC', name: 'A', sourceRoot: 'C:\\a' }, { id: 'universaarl', key: 'UAB2', name: 'B', sourceRoot: 'C:\\b' }])).toThrow(); expect(findProject(productionRegistry('C:\\x'), '__proto__')).toBeUndefined(); expect(findProject(productionRegistry('C:\\x'), '../universaarl')).toBeUndefined(); });
});

describe('kanonische Routen', () => {
  it('unterstützt alle sieben Bereiche und erhält die Projekt-ID', () => { for (const area of areas) expect(parseRoute(projectUrl('universaarl', area), ['universaarl'])).toEqual({ kind: 'project', projectId: 'universaarl', area }); });
  it('trennt Root, unbekanntes Projekt und unbekannten Bereich', () => { expect(parseRoute('/', ['universaarl']).kind).toBe('root'); expect(parseRoute('/projekte/fremd/quellen', ['universaarl']).kind).toBe('project-not-found'); expect(parseRoute('/projekte/universaarl/gantt', ['universaarl']).kind).toBe('area-not-found'); });
  it('ignoriert Query-Parameter für asOf und stichtag', () => { expect(parseRoute('/projekte/universaarl/aktueller-stand', ['universaarl'])).toMatchObject({ kind: 'project', area: 'aktueller-stand' }); });
});

describe('Adapter- und Sicherheitsgrenzen', () => {
  it('liefert Voll-SHA, Nachweise statt Meilensteinen und keine Chronologie', async () => { const state = await createTwinState(fixture()); expect(state.source.commit).toMatch(/^[a-f0-9]{40}$/); expect(state.artifacts.some((item) => item.kind === 'evidence')).toBe(true); expect(state.artifacts.some((item) => (item.kind as string) === 'milestone')).toBe(false); expect('history' in state).toBe(false); });
  it('liefert nur opake Nachweis-IDs ohne Dateipfade', async () => { const root = fixture(); const state = await createTwinState(root); expect(state.evidenceItems).toHaveLength(1); expect(state.evidenceItems[0].id).toMatch(/^ev_[a-f0-9]{24}$/); expect(JSON.stringify(state)).not.toContain('frame.png'); expect(resolveEvidenceId(root, state.evidenceItems[0].id)).toBe(path.join(root, 'evidence', 'run', 'frame.png')); expect(resolveEvidenceId(root, '../frame.png')).toBeNull(); expect(resolveEvidenceId(root, 'ev_000000000000000000000000')).toBeNull(); });
  it('begrenzt repository-relative Provenienz', () => { expect(validateProvenancePath('atlassian/jira/issues/wave.yaml')).toBe(true); for (const value of ['../secret', 'C:/Users/x', '\\\\server\\share', 'https://x/evidence', 'evidence/../x.png', 'evidence/trace.png', 'src/main.tsx']) expect(validateProvenancePath(value)).toBe(false); });
  it('schreibt nicht in die Quelle', async () => { const root = fixture(); const before = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }); await createTwinState(root); expect(execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })).toBe(before); });
});

describe('projektgescopte API', () => {
  it('liefert Projektliste und Universaarl-State', async () => { const root = fixture(); const registry = productionRegistry(root); expect(await dispatchProjectApi('GET', '/api/projects', registry)).toMatchObject({ status: 200, body: { projects: [{ id: 'universaarl', key: 'UABC', name: 'Universaarl' }] } }); const result = await dispatchProjectApi('GET', '/api/projects/universaarl/state', registry); expect(result.status).toBe(200); expect(JSON.stringify(result.body)).not.toContain(root); });
  it('weist unbekannte Projekte vor Adapterzugriff zurück', async () => { const reader = vi.fn(); const result = await dispatchProjectApi('GET', '/api/projects/fremd/state', productionRegistry('C:\\x'), reader); expect(result).toMatchObject({ status: 404, body: { code: 'PROJECT_NOT_FOUND' } }); expect(reader).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('universaarl'); });
  it('unterscheidet nicht verfügbare Quellen und blockiert ungebundene sowie schreibende APIs', async () => { const reader = vi.fn().mockRejectedValue(new Error('C:\\Users\\secret')); expect(await dispatchProjectApi('GET', '/api/projects/universaarl/state', productionRegistry('C:\\missing'), reader)).toMatchObject({ status: 503, body: { code: 'SOURCE_UNAVAILABLE' } }); expect(JSON.stringify(await dispatchProjectApi('GET', '/api/project-state', productionRegistry('C:\\x')))).not.toContain('secret'); expect((await dispatchProjectApi('POST', '/api/projects', productionRegistry('C:\\x'))).status).toBe(405); });
  it('isoliert Nachweise projektgebunden und lehnt Traversal-IDs ab', async () => { const root = fixture(); const registry = productionRegistry(root); const state = await createTwinState(root); expect((await dispatchProjectApi('GET', `/api/projects/universaarl/evidence/${state.evidenceItems[0].id}`, registry)).file).toBeTruthy(); expect((await dispatchProjectApi('GET', '/api/projects/universaarl/evidence/..%2Fsecret', registry)).status).toBe(404); expect((await dispatchProjectApi('GET', `/api/projects/fremd/evidence/${state.evidenceItems[0].id}`, registry)).status).toBe(404); });
});
