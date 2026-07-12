import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { blueprintSourceBinding, resolveBlueprintSourceRoot } from '../src/projects/blueprint-source';
import { createProjectRegistry, findProject, productionRegistry as createProductionRegistry, publicProjects } from '../src/projects/registry';
import { areas, parseRoute, projectUrl } from '../src/navigation/routes';
import { AdapterSourceError, createTwinState as createBoundTwinState, resolveEvidenceId as resolveBoundEvidenceId, safeBranchDisplay, validateProvenancePath, type AdapterReadOptions } from '../src/server/adapter';
import { apiErrorCodes, dispatchProjectApi } from '../src/server/api';
import { artifactSchema, boundedList, createProjectRequestGate, displayStatus, displayVerificationType, focusMainAfterMobileMoreNavigation, mobileMoreViewportDecision, projectListFromApiBody, projectViewKey, renderLimits, uiErrorCodeFromBody, uiErrorMessage, type ProjectState } from '../src/model';

const gitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
const createTwinState = (repo: string, options?: AdapterReadOptions) => createBoundTwinState('universaarl', repo, options);
const resolveEvidenceId = (repo: string, evidenceId: string) => resolveBoundEvidenceId('universaarl', repo, evidenceId);
const testRegistry = (sourceRoot: string) => createProjectRegistry([
  { id: 'universaarl', key: 'UABC', name: 'Universaarl', sourceRoot },
  { id: 'bc-basic', key: 'BCB', name: 'Business Central Basic', sourceRoot, sourceContract: { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } },
]);
// Bestehende Parser- und API-Fixtures prüfen bewusst keine Produktionsbindung.
const productionRegistry = testRegistry;
const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const pngCrcTable = (() => { const table = new Uint32Array(256); for (let index = 0; index < 256; index += 1) { let value = index; for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1); table[index] = value >>> 0; } return table; })();
function pngCrc(value: Buffer) { let crc = 0xffffffff; for (const byte of value) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function pngWithDimensions(width: number, height: number) { const result = Buffer.from(validPng); result.writeUInt32BE(width, 16); result.writeUInt32BE(height, 20); result.writeUInt32BE(pngCrc(result.subarray(12, 29)), 29); return result; }
function pngChunk(type: string, data = Buffer.alloc(0)) { const typeBytes = Buffer.from(type, 'ascii'); const chunk = Buffer.alloc(12 + data.length); chunk.writeUInt32BE(data.length, 0); typeBytes.copy(chunk, 4); data.copy(chunk, 8); chunk.writeUInt32BE(pngCrc(Buffer.concat([typeBytes, data])), 8 + data.length); return chunk; }
function structuredPng(colorType: number, chunks: Buffer[]) { const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = colorType === 3 ? 8 : 8; header[9] = colorType; return Buffer.concat([validPng.subarray(0, 8), pngChunk('IHDR', header), ...chunks, pngChunk('IEND')]); }
function git(root: string, args: string[], input?: string) { return execFileSync('git', ['-C', root, '--no-optional-locks', ...args], { encoding: 'utf8', env: gitEnvironment, input }).trim(); }
function write(root: string, relative: string, content: string | Buffer) { const file = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
function commitAll(root: string, message = 'fixture update') { git(root, ['add', '.']); git(root, ['commit', '-m', message]); }
function updateAndCommit(root: string, relative: string, content: string | Buffer) { write(root, relative, content); commitAll(root); }
function indexFingerprint(root: string) { const name = git(root, ['rev-parse', '--git-path', 'index']); const file = path.isAbsolute(name) ? name : path.resolve(root, name); return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
async function rejectionMessage(action: () => Promise<unknown>) { let error: unknown; try { await action(); } catch (caught) { error = caught; } expect(error).toBeInstanceOf(Error); return (error as Error).message; }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uabc-shell-')); execFileSync('git', ['init', '-q', '-b', 'main', root], { env: gitEnvironment });
  git(root, ['config', 'core.autocrlf', 'false']); git(root, ['config', 'user.name', 'Test']); git(root, ['config', 'user.email', 'test@example.invalid']);
  write(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Architektur\nlifecycleStatus: approved\napproval:\n  evidenceId: UABC-VER-APPROVAL-001\n  scope: W0 baseline\n');
  write(root, 'capabilities/catalog.yaml', 'domains:\n  - id: UABC-CAP-FIN\n    name: Finance\n    capabilities:\n      - { id: UABC-CAP-FIN-R2R, name: Record to Report, status: planned, wave: W1 }\n');
  write(root, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Epic, summary: Test, status: Done, components: [Finance], evidenceRefs: [UABC-VER-APPROVAL-001] }\n');
  write(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '---\nid: demo\ntitle: Demo\nstatus: archived\nproblem: Test.\nreferences: []\n---\n# Nicht normativer Begleittext\n');
  write(root, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Projekt\nstatus: W0 Complete\n---\n# Projekt\n');
  write(root, 'evidence/verification-register.yaml', 'verifications:\n  - id: UABC-VER-APPROVAL-001\n    changeRef: demo\n    status: passed\n    type: human-approval\n    evidence: Freigabe dokumentiert.\n');
  write(root, 'evidence/run/frame.png', validPng);
  commitAll(root, 'fixture'); return root;
}

const bcBasicContract = { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } as const;

function projectDataFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uabc-project-data-')); execFileSync('git', ['init', '-q', '-b', 'main', root], { env: gitEnvironment });
  git(root, ['config', 'core.autocrlf', 'false']); git(root, ['config', 'user.name', 'Test']); git(root, ['config', 'user.email', 'test@example.invalid']);
  write(root, 'exports/project-data/v1/index.yaml', `schemaVersion: 1
contractId: UABC-PROJECT-DATA-V1
projectId: UABC-BC-BASIC-001
projectKey: BCB
routeKey: bc-basic
displayName: Business Central Basic
governingChange: deliver-bc-basic-customer-project
lifecycleStatus: proposed
readOnly: true
sourceOfTruth: openspec
pathSemantics: repository-relative
missingValuePolicy: leer
consumerRules: [Nur positivgelistete Pfade lesen.]
artifacts:
  - { id: UABC-SRC-JIRA, kindId: jira-issues, path: atlassian/jira/issues/bc-basic.yaml, format: yaml, required: true }
  - { id: UABC-SRC-VER, kindId: verification-register, path: evidence/verification-register.yaml, selector: 'verifications[changeRef=deliver-bc-basic-customer-project]', format: yaml, required: true }
  - { id: UABC-SRC-TEMPLATE, kindId: customer-data-template, path: project/bc-basic/customers.blank.csv, format: csv, required: true }
  - { id: UABC-SRC-OPTIONAL, kindId: confluence-page, path: atlassian/confluence/pages/optional.md, format: markdown, required: false }
`);
  write(root, 'atlassian/jira/issues/bc-basic.yaml', `issues:
  - key: UABC-22
    type: Sub-task
    summary: Projektauftrag vorbereiten
    status: Backlog
    effort: 2h Planwert
    plannedBillableHours: 2
    billable: true
    parent: UABC-19
    dependencies: []
    confluenceRefs: []
    evidenceRefs: [UABC-VER-BCB-LOCAL-001]
    transcriptRefs: []
    deliverableIds: []
    history: []
`);
  write(root, 'evidence/verification-register.yaml', `verifications:
  - id: UABC-VER-BCB-LOCAL-001
    changeRef: deliver-bc-basic-customer-project
    status: pending
    type: repository
    evidence: null
    subjectRefs: [UABC-REQ-BCB-001]
  - id: UABC-VER-FREMD-001
    changeRef: anderes-projekt
    status: passed
    type: automated-test
    evidence: Fremder Nachweis
`);
  write(root, 'project/bc-basic/customers.blank.csv', 'number;name;city\nC-10000;Musterkunde;Frankfurt\n');
  write(root, 'architecture/unreferenziert.yaml', 'ungueltig: [');
  write(root, 'project/bc-basic/unreferenziert.csv', Buffer.from([0xff]));
  write(root, 'evidence/unreferenziert.png', validPng);
  commitAll(root, 'indexgebundene fixture'); return root;
}

describe('Projektregistry', () => {
  it('enthält produktiv genau die zwei konfigurierten Projekte', () => { const registry = createProductionRegistry('C:\\snapshot', '0'.repeat(40)); expect(publicProjects(registry)).toEqual([{ id: 'universaarl', key: 'UABC', name: 'Universaarl' }, { id: 'bc-basic', key: 'BCB', name: 'Business Central Basic' }]); expect(JSON.stringify(publicProjects(registry))).not.toContain('snapshot'); });
  it('weist doppelte und ungültige Einträge zurück', () => { expect(() => createProjectRegistry([{ id: 'universaarl', key: 'UABC', name: 'A', sourceRoot: 'C:\\a' }, { id: 'universaarl', key: 'UAB2', name: 'B', sourceRoot: 'C:\\b' }])).toThrow(); expect(findProject(testRegistry('C:\\x'), '__proto__')).toBeUndefined(); expect(findProject(testRegistry('C:\\x'), '../universaarl')).toBeUndefined(); });
});
describe('dauerhafte Blueprint-Quellenbindung', () => {
  it('bindet lokalen Geschwisterpfad, Remote, Branch und Datenvertrag an genau eine typisierte Quelle', () => {
    expect(blueprintSourceBinding).toEqual({
      localRelativePath: '..\\Universaarl Projekt BC Basic', remoteUrl: 'https://github.com/sivla/FiBu.git', branch: 'codex/universaarl-projekt',
      manifestPath: 'exports/project-data/v1/snapshot-manifest.json', schemaPath: 'governance/schemas/project-snapshot-manifest.schema.json', indexPath: 'exports/project-data/v1/index.yaml', expectedProjectId: 'UABC-BC-BASIC-001', producerProjectId: 'blueprint',
    });
    expect(Object.isFrozen(blueprintSourceBinding)).toBe(true);
    expect(createProductionRegistry(path.resolve('quelle'), '0'.repeat(40)).find((entry) => entry.id === 'bc-basic')?.sourceContract).toEqual({ manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId });
  });

  it('verwendet standardmaessig den Geschwisterordner und akzeptiert nur einen absoluten lokalen Override', () => {
    const projectRoot = path.resolve('arbeitsbereich', 'Universaarl-Project-Twin');
    expect(resolveBlueprintSourceRoot(projectRoot)).toBe(path.resolve(projectRoot, '..', 'Universaarl Projekt BC Basic'));
    expect(resolveBlueprintSourceRoot(projectRoot, '  ')).toBe(path.resolve(projectRoot, '..', 'Universaarl Projekt BC Basic'));
    const override = path.resolve('andere-quelle');
    expect(resolveBlueprintSourceRoot(projectRoot, override)).toBe(path.normalize(override));
    expect(() => resolveBlueprintSourceRoot(projectRoot, 'relative-quelle')).toThrow(/absoluter Pfad/);
  });
});

describe('Kontrast-Tokens', () => {
  const lum = (hex: string) => { const raw = hex.slice(1); const normalized = raw.length === 3 ? [...raw].map((digit) => `${digit}${digit}`).join('') : raw; const c = normalized.match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorTokens = (css: string, selector: string) => { const block = css.match(new RegExp(`${escape(selector)}\\s*\\{([^{}]*)\\}`, 'i'))?.[1] ?? ''; return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)/gi)].map((match) => [match[1], match[2]])); };
  const replaceSelectorToken = (css: string, selector: string, name: string, value: string) => css.replace(new RegExp(`(${escape(selector)}\\s*\\{)([^{}]*)(\\})`, 'i'), (_all, start: string, body: string, end: string) => `${start}${body.replace(new RegExp(`(--${name}:\\s*)#[0-9a-f]{3}(?:[0-9a-f]{3})?`, 'i'), `$1${value}`)}${end}`);
  type ContrastMode = 'light' | 'explicit-dark' | 'system-dark';
  const resolvedTokens = (styles: string, overrides: string, mode: ContrastMode) => {
    const light = { ...selectorTokens(styles, ':root'), ...selectorTokens(overrides, ':root') };
    if (mode === 'light') return light;
    const dark = { ...light, ...selectorTokens(styles, 'html[data-theme=dark]') };
    return mode === 'explicit-dark' ? { ...dark, ...selectorTokens(overrides, "html[data-theme='dark']") } : { ...dark, ...selectorTokens(overrides, "html:not([data-theme='light'])") };
  };
  const enforceRealContrast = (styles: string, overrides: string, mode: ContrastMode) => { const tokens = resolvedTokens(styles, overrides, mode); if (ratio(tokens.muted, tokens.bg) < 4.5 || ratio(tokens['turquoise-dark'], tokens.bg) < 4.5 || ratio(tokens['turquoise-dark'], tokens.surface) < 4.5 || ratio(tokens.turquoise, tokens.graphite) < 3) throw new Error(`Realer UI-Kontrast unterschritten: ${mode}`); };
  it('prüft die reale helle, explizit dunkle und system-dunkle CSS-Kaskade der verwendeten Kontrast-Tokens', () => {
    const styles = fs.readFileSync(path.resolve('src/styles.css'), 'utf8'); const overrides = fs.readFileSync(path.resolve('src/theme/contrast.css'), 'utf8'); const main = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    const light = resolvedTokens(styles, overrides, 'light'); const explicitDark = resolvedTokens(styles, overrides, 'explicit-dark'); const systemDark = resolvedTokens(styles, overrides, 'system-dark');
    expect(styles).toContain('background:var(--bg)'); expect(styles).toContain('background:var(--surface)'); expect(styles).toContain('color:var(--turquoise-dark)'); expect(styles).toContain('border-color:var(--turquoise)');
    expect(styles).toContain('html[data-theme=dark]'); expect(overrides).toContain('@media (prefers-color-scheme: dark)'); expect(main).toContain("matchMedia('(prefers-color-scheme: dark)')"); expect(main.indexOf("import './styles.css'")).toBeLessThan(main.indexOf("import './theme/contrast.css'"));
    for (const mode of ['light', 'explicit-dark', 'system-dark'] as const) expect(() => enforceRealContrast(styles, overrides, mode)).not.toThrow();
    expect(() => enforceRealContrast(styles, replaceSelectorToken(overrides, ':root', 'muted', light.bg), 'light')).toThrow();
    expect(() => enforceRealContrast(styles, replaceSelectorToken(overrides, ':root', 'turquoise-dark', light.bg), 'light')).toThrow();
    expect(() => enforceRealContrast(replaceSelectorToken(styles, ':root', 'turquoise', light.graphite), overrides, 'light')).toThrow();
    expect(() => enforceRealContrast(styles, replaceSelectorToken(overrides, "html[data-theme='dark']", 'turquoise-dark', explicitDark.bg), 'explicit-dark')).toThrow();
    expect(() => enforceRealContrast(styles, replaceSelectorToken(overrides, "html:not([data-theme='light'])", 'turquoise-dark', systemDark.surface), 'system-dark')).toThrow();
    expect(main).not.toContain('@ts-nocheck');
  });
});

describe('Tabletvertrag', () => {
  const enforceTabletContract = (css: string) => {
    if (!/@media\s*\(min-width:\s*721px\)\s*and\s*\(max-width:\s*1000px\)/i.test(css)) throw new Error('Tablet-Bereich fehlt');
    const sidebar = Number(css.match(/--sidebar:\s*([0-9]+)px/i)?.[1]);
    if (!Number.isFinite(sidebar) || sidebar < 64 || sidebar > 96) throw new Error('Tablet-Seitenleiste ist nicht kompakt');
    for (const contract of ['overflow-x: hidden', '.project-switcher { min-width: 0; max-width: 240px; }', '.app-shell > main { min-width: 0;', '.sidebar p { display: none; }', '.bottom-nav { display: none; }']) if (!css.includes(contract)) throw new Error(`Tablet-Vertrag fehlt: ${contract}`);
  };
  it('trennt Mobil, kompakte Tablet-Rail und Desktop ohne Überdeckung', () => { const css = fs.readFileSync(path.resolve('src/theme/responsive.css'), 'utf8'); const styles = fs.readFileSync(path.resolve('src/styles.css'), 'utf8'); const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); expect(() => enforceTabletContract(css)).not.toThrow(); expect(styles).toContain('@media(max-width:720px)'); expect(styles).toContain('--sidebar:216px'); expect(ui).toContain("matchMedia('(min-width: 721px)')"); expect(() => enforceTabletContract(css.replace('--sidebar: 88px', '--sidebar: 216px'))).toThrow(); expect(() => enforceTabletContract(css.replace('overflow-x: hidden', 'overflow-x: visible'))).toThrow(); expect(() => enforceTabletContract(css.replace('.bottom-nav { display: none; }', '.bottom-nav { display: grid; }'))).toThrow(); });
});

describe('Normalisierungsvertrag', () => {
  const artifact = { id: 'UABC-1', kind: 'task', title: 'Test', status: 'offen', wave: '', workstream: 'Projektmanagement', rationale: '', parentId: null, dependencies: [], documents: [], evidence: [], sourcePath: 'atlassian/jira/issues/test.yaml' };
  it('erlaubt nur die definierten Phasen einschliesslich Nicht belegt', () => { expect(artifactSchema.parse({ ...artifact, phase: 'Nicht belegt' }).phase).toBe('Nicht belegt'); expect(() => artifactSchema.parse({ ...artifact, phase: 'Beliebig' })).toThrow(); });
  it('zeigt bekannte Statuswerte deutsch und unbekannte belegte Werte quelltreu', () => { expect(displayStatus('archived')).toBe('Archiviert'); expect(displayStatus('W0 Complete')).toBe('W0 abgeschlossen'); expect(displayStatus('Quellstatus X')).toBe('Nicht unterstützt (Quellstatus: Quellstatus X)'); expect(displayStatus('')).toBe('Nicht belegt'); });
  it('bildet Prüfarten ausdrücklich deutsch ab und kennzeichnet unbekannte Quelltypen', () => { expect(displayVerificationType('human-approval')).toBe('Menschliche Freigabe'); expect(displayVerificationType('automated-test')).toBe('Automatisierte Prüfung'); expect(displayVerificationType('document-review')).toBe('Dokumentenprüfung'); expect(displayVerificationType('eigene-pruefung')).toBe('Nicht unterstützt (Quelltyp: eigene-pruefung)'); expect(displayVerificationType('')).toBe('Nicht belegt'); expect(fs.readFileSync(path.resolve('src/server/adapter.ts'), 'utf8')).not.toContain("verification.type.replaceAll('-', ' ')"); });
  it('mappt ausschließlich feste Fehlercodes auf deutsche, leakfreie und neutrale Meldungen', () => { expect(uiErrorCodeFromBody({ code: 'QUELLE_NICHT_VERFUEGBAR', error: 'Fetch failed C:\\Users\\geheim' }, 'PROJEKTSTAND_NICHT_VERFUEGBAR')).toBe('QUELLE_NICHT_VERFUEGBAR'); expect(uiErrorCodeFromBody({ code: 'Fetch failed C:\\Users\\geheim' }, 'PROJEKTSTAND_NICHT_VERFUEGBAR')).toBe('PROJEKTSTAND_NICHT_VERFUEGBAR'); for (const raw of ['Fetch failed', 'Unexpected token in JSON', 'C:\\Users\\geheim', { message: 'Browser network error' }]) { const message = uiErrorMessage(raw, 'PROJEKTSTAND_NICHT_VERFUEGBAR'); expect(message).toBe('Der commitgebundene Projektstand ist derzeit nicht verfügbar.'); expect(message).not.toContain('Fetch'); expect(message).not.toContain('JSON'); expect(message).not.toContain('geheim'); } const visibleSources = ['src/main.tsx', 'src/model.ts', 'src/server/adapter.ts'].map((relative) => fs.readFileSync(path.resolve(relative), 'utf8')).join('\n'); for (const claim of ['freigegebene Projekt', 'freigegebenen Blueprint', 'freigegebenen Quellenvertrag', 'nicht freigegebene Arbeitskopie']) expect(visibleSources.toLowerCase()).not.toContain(claim.toLowerCase()); expect(visibleSources).toContain('commitgebunden'); const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); expect(ui).not.toContain('error.message'); expect(ui).not.toContain('errorMessage'); });
  it('verwirft verzögerte Antworten und Fehler auch bei A-nach-B sowie A-B-A', async () => {
    const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
    const gate = createProjectRequestGate(); let current = 'projekt-a'; let visible = ''; let error = '';
    const settle = (token: ReturnType<typeof gate.begin>, pending: Promise<{ projectId: string; label: string }>) => pending.then((value) => { if (gate.accepts(token, current, value.projectId)) visible = value.label; }).catch(() => { if (gate.accepts(token, current)) error = 'sichtbar'; });
    const firstA = deferred<{ projectId: string; label: string }>(); const firstAToken = gate.begin('projekt-a'); const firstASettle = settle(firstAToken, firstA.promise);
    current = 'projekt-b'; const b = deferred<{ projectId: string; label: string }>(); const bToken = gate.begin('projekt-b'); const bSettle = settle(bToken, b.promise); b.resolve({ projectId: 'projekt-b', label: 'B-neu' }); await bSettle; firstA.resolve({ projectId: 'projekt-a', label: 'A-alt' }); await firstASettle; expect(visible).toBe('B-neu');
    current = 'projekt-a'; const staleA = deferred<{ projectId: string; label: string }>(); const staleAToken = gate.begin('projekt-a'); const staleASettle = settle(staleAToken, staleA.promise); current = 'projekt-b'; gate.begin('projekt-b'); current = 'projekt-a'; const freshA = deferred<{ projectId: string; label: string }>(); const freshAToken = gate.begin('projekt-a'); const freshASettle = settle(freshAToken, freshA.promise); freshA.resolve({ projectId: 'projekt-a', label: 'A-neu' }); await freshASettle; staleA.reject(new Error('Fetch failed C:\\Users\\geheim')); await staleASettle; expect(visible).toBe('A-neu'); expect(error).toBe(''); expect(projectViewKey('projekt-a', 'quellen')).not.toBe(projectViewKey('projekt-b', 'quellen'));
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); for (const contract of ['requestGate.current.invalidate()', 'requestGate.current.accepts(token', 'state?.projectId === context.projectId', 'state.value.source.projectId === context.projectId', 'selected?.viewKey === viewKey', 'addEventListener(\'popstate\', handleHistory)']) expect(ui).toContain(contract);
  });
  it('begrenzt jede Renderliste hart und meldet jede Kürzung', () => { for (const limit of Object.values(renderLimits)) { expect(boundedList(Array.from({ length: limit - 1 }), limit)).toMatchObject({ visible: limit - 1, total: limit - 1, limited: false }); expect(boundedList(Array.from({ length: limit }), limit)).toMatchObject({ visible: limit, total: limit, limited: false }); expect(boundedList(Array.from({ length: limit + 1 }), limit)).toMatchObject({ visible: limit, total: limit + 1, limited: true }); } const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); for (const contract of ['von ${artifacts.total} Datensätzen', 'von ${evidenceItems.total} Bildnachweisen', 'von {gaps.total} bekannten Datenlücken', 'von {paths.total} belegten Quellpfaden', 'von {warnings.total} Prüf- und Quellenhinweisen', 'von {values.total} Referenzen']) expect(ui).toContain(contract); });
  it('schliesst ein offenes Mobilmenue beim Desktopwechsel mit Hauptinhalt als Fokusziel', () => { expect(mobileMoreViewportDecision(true, 1024, false)).toBe('close-to-main'); expect(mobileMoreViewportDecision(true, 720, true)).toBe('close-to-main'); expect(mobileMoreViewportDecision(true, 720, false)).toBe('keep'); expect(mobileMoreViewportDecision(false, 1200, true)).toBe('keep'); const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); for (const contract of ["addEventListener('resize', handleViewport)", "desktop.addEventListener('change', handleViewport)", "removeEventListener('resize', handleViewport)", "close('main')", 'focusMainAfterMobileMoreNavigation(true, document)']) expect(ui).toContain(contract); });
  it('entfernt das offene Mobilmenue nach Auswahl und fokussiert deterministisch den Hauptinhalt', () => {
    const main = { focus: () => { documentRoot.activeElement = main; } }; const trigger = { focus: () => { documentRoot.activeElement = trigger; } };
    const documentRoot = { activeElement: trigger as unknown, getElementById: (id: string) => id === 'main' ? main : null };
    let dialogVisible = true; const selectFromOpenMenu = () => { dialogVisible = false; focusMainAfterMobileMoreNavigation(true, documentRoot); };
    selectFromOpenMenu(); expect(dialogVisible).toBe(false); expect(documentRoot.activeElement).toBe(main);
    documentRoot.activeElement = trigger; expect(focusMainAfterMobileMoreNavigation(false, documentRoot)).toBe(false); expect(documentRoot.activeElement).toBe(trigger);
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); const navigate = ui.slice(ui.indexOf('const navigate: Navigate'), ui.indexOf('if (error)'));
    expect(navigate).toContain("if (more) closeMore('main')"); expect(navigate).not.toContain('setMore(false)'); expect(ui).toContain('setMore(false);');
  });
});

describe('kanonische Routen', () => {
  it('unterstützt alle sieben Bereiche und erhält die Projekt-ID', () => { for (const area of areas) expect(parseRoute(projectUrl('universaarl', area), ['universaarl'])).toEqual({ kind: 'project', projectId: 'universaarl', area }); });
  it('trennt Root, unbekanntes Projekt und unbekannten Bereich', () => { expect(parseRoute('/', ['universaarl']).kind).toBe('root'); expect(parseRoute('/projekte/fremd/quellen', ['universaarl']).kind).toBe('project-not-found'); expect(parseRoute('/projekte/universaarl/gantt', ['universaarl']).kind).toBe('area-not-found'); });
  it('ignoriert Query-Parameter für asOf und stichtag', () => { expect(parseRoute('/projekte/universaarl/aktueller-stand', ['universaarl'])).toMatchObject({ kind: 'project', area: 'aktueller-stand' }); });
});

describe('Adapter- und Sicherheitsgrenzen', () => {
  it('liefert Projekt-ID, Voll-SHA und vollständige Fingerprints, Nachweise statt Meilensteinen und keine Chronologie', async () => { const state = await createTwinState(fixture()); expect(state.source.projectId).toBe('universaarl'); expect(state.source.commit).toMatch(/^[a-f0-9]{40}$/); expect(state.source.headFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(state.source.indexFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(state.source.statusFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(state.artifacts.some((item) => item.kind === 'evidence')).toBe(true); expect(state.artifacts.some((item) => (item.kind as string) === 'milestone')).toBe(false); expect('history' in state).toBe(false); });
  it('kennzeichnet Adapterfehler mit einem festen deutschen Fehlercode', async () => { const root = fixture(); updateAndCommit(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: [\n'); let caught: unknown; try { await createTwinState(root); } catch (error) { caught = error; } expect(caught).toBeInstanceOf(AdapterSourceError); expect(caught).toMatchObject({ code: 'QUELLVERTRAG_UNGUELTIG' }); expect((caught as Error).message).not.toContain(root); });
  it('zeigt nur sichere, begrenzte Branchbezeichnungen und hält die interne Git-Identität exakt', async () => { const safe = 'codex/responsive-multi-project-shell-foundation'; expect(safeBranchDisplay(safe)).toBe(safe); const unsafe = ['codex/tenant-secret', 'codex/privateCustomer', 'codex/00112233445566778899aabbccddeeff', 'codex/123e4567-e89b-42d3-a456-426614174000', 'codex/%252Fsecret', 'C:\\Users\\kunde', '//server/share', 'https://benutzer:passwort@host/pfad', 'codex/home/customer', `codex/${'a'.repeat(121)}`, 'codex/zeile\nsecret']; for (const branch of unsafe) { const display = safeBranchDisplay(branch); expect(display).toBe('Branchname aus Sicherheitsgründen redigiert'); expect(display).not.toContain(branch); } const normalRoot = fixture(); git(normalRoot, ['branch', '-m', safe]); expect((await createTwinState(normalRoot)).source.branch).toBe(safe); const hostileRoot = fixture(); git(hostileRoot, ['branch', '-m', 'codex/tenant-secret']); const state = await createTwinState(hostileRoot); expect(state.source.branch).toBe('Branchname aus Sicherheitsgründen redigiert'); const api = await dispatchProjectApi('GET', '/api/projects/universaarl/state', productionRegistry(hostileRoot)); expect(api).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } }); expect(JSON.stringify(api.body)).not.toMatch(/tenant|secret/i); }, 20_000);
  it('weist sensible technische IDs und Referenzen vor Artefakt- und Warnungsbildung fail-closed ab', async () => { const nGuid = '00112233445566778899aabbccddeeff'; const longId = `UABC-${'A'.repeat(121)}`; const cases: Array<[string, string, string]> = [['architecture/enterprise-blueprint.yaml', `${nGuid}`, `artifactId: ${nGuid}\ntitle: Architektur\n`], ['atlassian/jira/issues/wave.yaml', 'UABC-secret-parent', 'issues:\n  - { key: UABC-1, type: Task, summary: Test, parent: UABC-secret-parent }\n'], ['capabilities/catalog.yaml', 'UABC-token-dependency', 'domains:\n  - id: UABC-CAP-FIN\n    capabilities:\n      - { id: UABC-CAP-FIN-R2R, dependencies: [UABC-token-dependency] }\n'], ['atlassian/confluence/pages/project.md', 'UABC-private-document', '---\nid: UABC-PROJECT\nreferenceIds: [UABC-private-document]\n---\n# Projekt\n'], ['evidence/verification-register.yaml', nGuid, `verifications:\n  - { id: UABC-VER-APPROVAL-001, changeRef: demo, type: human-approval, subjectRefs: [${nGuid}] }\n`], ['atlassian/jira/issues/wave.yaml', 'UABC..UNGEWOEHNLICH', 'issues:\n  - { key: UABC..UNGEWOEHNLICH, type: Task, summary: Test }\n'], ['atlassian/jira/issues/wave.yaml', longId, `issues:\n  - { key: ${longId}, type: Task, summary: Test }\n`]]; for (const [relative, sensitive, content] of cases) { const root = fixture(); updateAndCommit(root, relative, content); const message = await rejectionMessage(() => createTwinState(root)); expect(message).toContain('Datenvertrag'); expect(message).not.toContain(sensitive); } const apiRoot = fixture(); updateAndCommit(apiRoot, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Task, summary: Test, parent: UABC-secret-parent }\n'); const api = await dispatchProjectApi('GET', '/api/projects/universaarl/state', productionRegistry(apiRoot)); expect(api).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } }); expect(JSON.stringify(api)).not.toMatch(/secret|parent|warning/i); expect(uiErrorMessage('SNAPSHOT_VERTRAG_BLOCKIERT')).not.toMatch(/secret|parent/i); const safeRoot = fixture(); updateAndCommit(safeRoot, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Task, summary: Test, dependencies: [UABC-MISSING-001] }\n'); const safeState = await createTwinState(safeRoot); expect(safeState.warnings.some((warning) => warning.includes('UABC-MISSING-001'))).toBe(true); }, 50_000);
  it('projiziert bekannte und unbekannte Prüfarten ohne Anglizismus-Ersetzung', async () => { const root = fixture(); const known = await createTwinState(root); expect(known.artifacts.find((item) => item.kind === 'evidence')?.title).toBe('Menschliche Freigabe'); updateAndCommit(root, 'evidence/verification-register.yaml', 'verifications:\n  - { id: UABC-VER-APPROVAL-001, changeRef: demo, status: passed, type: eigene-pruefung }\n'); const unknown = await createTwinState(root); expect(unknown.artifacts.find((item) => item.kind === 'evidence')?.title).toBe('Nicht unterstützt (Quelltyp: eigene-pruefung)'); }, 15_000);
  it('liefert nur opake Nachweis-IDs und commitgebundene PNG-Bytes ohne Dateipfade', async () => { const root = fixture(); const state = await createTwinState(root); expect(state.evidenceItems).toHaveLength(1); expect(state.evidenceItems[0].id).toMatch(/^ev_[a-f0-9]{24}$/); expect(JSON.stringify(state)).not.toContain('frame.png'); expect(resolveEvidenceId(root, state.evidenceItems[0].id)).toMatchObject({ contentType: 'image/png', bytes: validPng }); expect(resolveEvidenceId(root, '../frame.png')).toBeNull(); expect(resolveEvidenceId(root, 'ev_000000000000000000000000')).toBeNull(); }, 15_000);
  it('adressiert als Bildnachweis ausschließlich reguläre PNG-Blobs unter evidence', async () => {
    const root = fixture(); updateAndCommit(root, 'architecture/diagram.png', validPng); const state = await createTwinState(root); expect(state.evidenceItems).toHaveLength(1);
    const commit = git(root, ['rev-parse', 'HEAD']); const oid = git(root, ['rev-parse', 'HEAD:architecture/diagram.png']); const foreignId = `ev_${createHash('sha256').update(`universaarl\0${commit}\0${oid}\0architecture/diagram.png`).digest('hex').slice(0, 24)}`;
    expect(state.evidenceItems.some((item) => item.id === foreignId)).toBe(false); expect(resolveEvidenceId(root, foreignId)).toBeNull(); expect(await dispatchProjectApi('GET', `/api/projects/universaarl/evidence/${foreignId}`, productionRegistry(root))).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
    const invalidOutside = fixture(); updateAndCommit(invalidOutside, 'architecture/diagram.png', Buffer.from('kein png')); expect(await rejectionMessage(() => createTwinState(invalidOutside))).toContain('PNG-Quellblob');
  }, 20_000);
  it('begrenzt repository-relative Provenienz', () => { expect(validateProvenancePath('atlassian/jira/issues/wave.yaml')).toBe(true); expect(validateProvenancePath('atlassian/confluence/pages/10-company-profile.md')).toBe(true); expect(validateProvenancePath('governance/reference-lifecycle.yaml')).toBe(true); for (const value of ['../secret', 'C:/Users/x', '\\\\server\\share', 'https://x/evidence', 'evidence/../x.png', 'evidence/trace.png', 'src/main.tsx', 'governance/anderes.yaml', 'governance/reference-lifecycle.yaml/unterpfad', 'governance/../reference-lifecycle.yaml', 'https://example.invalid/governance/reference-lifecycle.yaml']) expect(validateProvenancePath(value)).toBe(false); });
  it('unterscheidet fachliche Unternehmensprofile von sensiblen Laufzeitprofilen', () => {
    for (const value of ['atlassian/confluence/pages/company-profile.md', 'atlassian/confluence/pages/10-company-profile.md']) expect(validateProvenancePath(value)).toBe(true);
    for (const value of ['atlassian/confluence/pages/profile', 'atlassian/confluence/pages/profiles', 'atlassian/confluence/pages/profile.json', 'atlassian/confluence/pages/profiles.json', 'atlassian/confluence/pages/browser-profile.md', 'atlassian/confluence/pages/user-profile.md', 'atlassian/confluence/pages/auth-profile.md', 'atlassian/confluence/pages/credential-profile.md']) expect(validateProvenancePath(value)).toBe(false);
  });
  it('ignoriert boesartige Git-Umgebungsvariablen und deaktiviert fsmonitor sowie Hooks', async () => {
    const root = fixture(); const foreign = fixture(); updateAndCommit(foreign, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-FOREIGN\ntitle: Fremdquelle\n');
    const sentinel = path.join(root, 'git-prozess-ausgefuehrt.txt'); const windows = process.platform === 'win32'; const monitor = write(root, windows ? 'boeser-git-prozess.cmd' : 'boeser-git-prozess.sh', windows ? `@echo off\r\n>"${sentinel}" echo ausgefuehrt\r\nexit /b 0\r\n` : `#!/bin/sh\nprintf ausgefuehrt > '${sentinel}'\nexit 0\n`); fs.chmodSync(monitor, 0o755);
    execFileSync(windows ? (process.env.ComSpec ?? 'cmd.exe') : 'sh', windows ? ['/d', '/c', monitor] : [monitor], { env: gitEnvironment }); expect(fs.existsSync(sentinel)).toBe(true); fs.unlinkSync(sentinel);
    const hooks = path.join(root, 'boese-hooks'); fs.mkdirSync(hooks); const hook = write(hooks, 'post-index-change', `#!/bin/sh\nprintf ausgefuehrt > '${sentinel.replaceAll('\\', '/')}'\n`); fs.chmodSync(hook, 0o755); git(root, ['config', 'core.hooksPath', hooks.replaceAll('\\', '/')]); git(root, ['hook', 'run', 'post-index-change']); expect(fs.existsSync(sentinel)).toBe(true); fs.unlinkSync(sentinel);
    git(root, ['config', 'core.fsmonitor', monitor.replaceAll('\\', '/')]);
    const malicious: Record<string, string> = {
      GIT_DIR: path.join(foreign, '.git'), GIT_WORK_TREE: foreign, GIT_INDEX_FILE: path.join(foreign, '.git', 'index'), GIT_OBJECT_DIRECTORY: path.join(foreign, '.git', 'objects'),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(root, '.git', 'objects'), GIT_CONFIG_GLOBAL: path.join(foreign, 'config'), GIT_CONFIG_SYSTEM: path.join(foreign, 'system-config'),
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'C:/nicht-vorhanden/ausfuehren.exe', GIT_SSH_COMMAND: 'boesartig', GIT_SSH: 'boesartig', GIT_ASKPASS: 'boesartig',
      SSH_ASKPASS: 'boesartig', GCM_INTERACTIVE: 'always', GCM_CREDENTIAL_STORE: 'boesartig', SSL_CERT_FILE: path.join(foreign, 'cert.pem'), CURL_CA_BUNDLE: path.join(foreign, 'bundle.pem'),
    };
    const previous = new Map<string, string | undefined>(); for (const [key, value] of Object.entries(malicious)) { previous.set(key, process.env[key]); process.env[key] = value; }
    try { const state = await createTwinState(root); expect(state.source.commit).toBe(git(root, ['rev-parse', 'HEAD'])); expect(state.artifacts.some((item) => item.id === 'UABC-ARCH-001')).toBe(true); expect(JSON.stringify(state)).not.toContain('Fremdquelle'); expect(fs.existsSync(sentinel)).toBe(false); }
    finally { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    const filtered = fixture(); const filterSentinel = path.join(filtered, 'filter-ausgefuehrt.txt'); const filter = write(filtered, windows ? 'boeser-filter.cmd' : 'boeser-filter.sh', windows ? `@echo off\r\n>"${filterSentinel}" echo ausgefuehrt\r\nmore\r\n` : `#!/bin/sh\nprintf ausgefuehrt > '${filterSentinel}'\ncat\n`); fs.chmodSync(filter, 0o755); execFileSync(windows ? (process.env.ComSpec ?? 'cmd.exe') : 'sh', windows ? ['/d', '/c', filter] : [filter], { env: gitEnvironment, input: '' }); expect(fs.existsSync(filterSentinel)).toBe(true); fs.unlinkSync(filterSentinel); git(filtered, ['config', 'filter.evil.clean', windows ? `"${filter}"` : `sh "${filter}"`]); expect(await rejectionMessage(() => createTwinState(filtered))).toContain('Git-Konfiguration'); expect(fs.existsSync(filterSentinel)).toBe(false);
  });
  it('blockiert wirksame config.worktree-Umlenkungen vor Sentinel-Ausfuehrung', async () => {
    const root = fixture(); const windows = process.platform === 'win32'; const sentinel = path.join(root, 'worktree-config-ausgefuehrt.txt'); const command = write(root, windows ? 'worktree-config.cmd' : 'worktree-config.sh', windows ? `@echo off\r\n>"${sentinel}" echo ausgefuehrt\r\nexit /b 0\r\n` : `#!/bin/sh\nprintf ausgefuehrt > '${sentinel}'\n`); fs.chmodSync(command, 0o755); execFileSync(windows ? (process.env.ComSpec ?? 'cmd.exe') : 'sh', windows ? ['/d', '/c', command] : [command], { env: gitEnvironment }); expect(fs.existsSync(sentinel)).toBe(true); fs.unlinkSync(sentinel);
    git(root, ['config', 'extensions.worktreeConfig', 'true']); git(root, ['config', '--worktree', 'core.fsmonitor', command.replaceAll('\\', '/')]); git(root, ['config', '--worktree', 'filter.evil.clean', windows ? `"${command}"` : `sh "${command}"`]);
    expect(await rejectionMessage(() => createTwinState(root))).toContain('Git-Konfiguration'); expect(fs.existsSync(sentinel)).toBe(false);
  });
  it('ignoriert echte Git-Replace-Refs und liest den ausgewiesenen Originalcommit', async () => {
    const root = fixture(); const original = git(root, ['rev-parse', 'HEAD']); updateAndCommit(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-REPLACED\ntitle: Ersetzter Baum\n'); const replacement = git(root, ['rev-parse', 'HEAD']);
    git(root, ['replace', original, replacement]); git(root, ['update-ref', 'refs/heads/main', original]); const beforeStatus = git(root, ['status', '--porcelain=v1', '-z']); const beforeIndex = indexFingerprint(root);
    const state = await createTwinState(root); expect(state.source.commit).toBe(original); expect(state.artifacts.some((item) => item.id === 'UABC-ARCH-001')).toBe(true); expect(JSON.stringify(state)).not.toContain('Ersetzter Baum'); expect(git(root, ['status', '--porcelain=v1', '-z'])).toBe(beforeStatus); expect(indexFingerprint(root)).toBe(beforeIndex);
  });
  it('liest alle Fachdaten und PNG-Metadaten aus dem Commit statt aus dem Dirty-Worktree', async () => {
    const root = fixture(); const commit = git(root, ['rev-parse', 'HEAD']);
    write(root, 'architecture/enterprise-blueprint.yaml', 'ungueltig: ['); write(root, 'capabilities/catalog.yaml', 'ungueltig: [');
    write(root, 'atlassian/jira/issues/wave.yaml', 'ungueltig: ['); write(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '# Worktree-Manipulation');
    write(root, 'atlassian/confluence/pages/project.md', 'ungueltig'); write(root, 'evidence/verification-register.yaml', 'ungueltig: ['); write(root, 'evidence/run/frame.png', Buffer.from('kein png'));
    const state = await createTwinState(root);
    expect(state.source).toMatchObject({ commit, dirty: true }); expect(state.artifacts.some((item) => item.title === 'Architektur')).toBe(true); expect(state.stats).toMatchObject({ jira: 1, changes: 1, documents: 1, capabilities: 1, evidence: 1 });
    expect(state.warnings[0]).toContain('nicht commitgebundene Aenderungen'); expect(resolveEvidenceId(root, state.evidenceItems[0].id)?.bytes).toEqual(validPng); expect(JSON.stringify(state)).not.toContain(root);
  });
  it('bleibt bei veraendertem Worktree-Inhalt mit identischem Porcelain commitgebunden', async () => {
    const root = fixture(); write(root, 'architecture/enterprise-blueprint.yaml', 'erste Worktree-Fassung');
    const state = await createTwinState(root, { testHookAfterRead: () => { write(root, 'architecture/enterprise-blueprint.yaml', 'zweite Worktree-Fassung'); } });
    expect(state.source.dirty).toBe(true); expect(state.artifacts.some((item) => item.title === 'Architektur')).toBe(true); expect(fs.readFileSync(path.join(root, 'architecture/enterprise-blueprint.yaml'), 'utf8')).toBe('zweite Worktree-Fassung');
  });
  it('hält den strukturierten OpenSpec-Frontmatter-Vertrag stabil und bindet Archivstatus sowie Verzeichnis-ID', async () => {
    const root = fixture(); updateAndCommit(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '---\nid: demo\ntitle: Expliziter Titel\nstatus: proposed\nproblem: Explizit belegt.\nreferences: []\n---\n# Ignorierter Titel UABC-FREITEXT-001\n');
    const state = await createTwinState(root); const change = state.artifacts.find((item) => item.kind === 'change'); expect(change).toMatchObject({ id: 'demo', title: 'Expliziter Titel', status: 'archived', phase: 'Nicht belegt', wave: '', rationale: 'Explizit belegt.', documents: [] });
    const missing = fixture(); updateAndCommit(missing, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '---\nid: demo\nreferences: []\n---\n# Keine strukturierten Anzeigefelder\n'); const missingState = await createTwinState(missing); expect(missingState.artifacts.find((item) => item.kind === 'change')).toMatchObject({ title: 'Nicht belegt', status: 'archived', rationale: 'Nicht belegt' });
    const invalidWave = fixture(); updateAndCommit(invalidWave, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '---\nid: demo\nwave: W9\nreferences: []\n---\n'); const invalidState = await createTwinState(invalidWave); expect(invalidState.stats.changes).toBe(0); expect(invalidState.warnings.some((warning) => warning.includes('begrenzt'))).toBe(true);
    const mismatch = fixture(); updateAndCommit(mismatch, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '---\nid: anderes\nreferences: []\n---\n# Falsche ID\n'); const mismatchState = await createTwinState(mismatch); expect(mismatchState.stats.changes).toBe(0); expect(JSON.stringify(mismatchState)).not.toContain('anderes');
    const wrongPath = fixture(); updateAndCommit(wrongPath, 'openspec/legacy/demo/proposal.md', '---\nid: legacy\nstatus: active\nreferences: []\n---\n'); const unsupported = await createTwinState(wrongPath); expect(unsupported.warnings).toEqual([]); expect(unsupported.artifacts.some((item) => item.id === 'legacy')).toBe(false);
  }, 20_000);
  it('normalisiert die drei beobachteten deutschen OpenSpec-Markdownvarianten semantisch vollständig', async () => {
    const root = fixture(); fs.rmSync(path.join(root, 'openspec', 'changes', 'archive', '2026-07-10-demo'), { recursive: true, force: true });
    write(root, 'openspec/.openspec.yaml', 'schema: spec-driven\n');
    write(root, 'openspec/schemas/universaarl-delivery/templates/proposal.md', '# Blankovorlage\n\nDiese Datei ist kein Change.\n');
    write(root, 'openspec/changes/archive/2026-07-10-umgebung-etablieren/proposal.md', '# Change-Vorschlag: Umgebung etablieren\n\n- **Change:** `umgebung-etablieren`\n- **Status:** Archiviert\n- **Welle:** W0\n\n## Problem\nDie Umgebung muss reproduzierbar beschrieben werden.\n');
    write(root, 'openspec/changes/archive/2026-07-10-walkthrough-pilot/proposal.md', '# Vorschlag\n\n## Metadaten\n\n- **Change-ID:** `walkthrough-pilot`\n- **Status:** Archiviert\n- **Welle:** W1 Grundlagen und Strategie\n\n## Problem und Zweck\nEin geführter Prüflauf wird commitgebunden dokumentiert.\n');
    write(root, 'openspec/changes/archive/2026-07-10-establish-universaarl-enterprise-blueprint/proposal.md', '# Change-Vorschlag: Universaarl-Unternehmens-Blueprint v0.1\n\n## Metadaten\n- **Change:** `establish-universaarl-enterprise-blueprint`\n- **Status:** aktiv, in Review-Vorbereitung\n- **Welle:** W2 Unternehmensarchitektur\n\n## Problem und Zweck\nDer Unternehmens-Blueprint muss als commitgebundene Projektquelle vollständig lesbar sein.\n');
    commitAll(root, 'deutsche OpenSpec-Varianten');
    const state = await createTwinState(root); const changes = state.artifacts.filter((item) => item.kind === 'change'); expect(changes).toHaveLength(3);
    expect(changes.find((item) => item.id === 'umgebung-etablieren')).toMatchObject({ id: 'umgebung-etablieren', title: 'Umgebung etablieren', status: 'archived', phase: 'Strategize', wave: 'W0', rationale: 'Die Umgebung muss reproduzierbar beschrieben werden.' });
    expect(changes.find((item) => item.id === 'walkthrough-pilot')).toMatchObject({ id: 'walkthrough-pilot', title: 'OpenSpec-Aenderung walkthrough-pilot', status: 'archived', phase: 'Initiate', wave: 'W1', rationale: 'Ein geführter Prüflauf wird commitgebunden dokumentiert.' });
    expect(changes.find((item) => item.id === 'establish-universaarl-enterprise-blueprint')).toMatchObject({ id: 'establish-universaarl-enterprise-blueprint', title: 'Universaarl-Unternehmens-Blueprint v0.1', status: 'archived', phase: 'Implement', wave: 'W2', rationale: 'Der Unternehmens-Blueprint muss als commitgebundene Projektquelle vollständig lesbar sein.' });
    for (const change of changes) for (const value of [change.id, change.title, change.status, change.wave, change.rationale]) expect(value).not.toContain('Nicht belegt');
    expect(state.warnings).toEqual([]); expect(JSON.stringify(state)).not.toContain(path.join(root, 'openspec'));
  }, 20_000);
  it('liest OpenSpec-Metadaten nur in erlaubten Zonen und weist Duplikate, Konflikte sowie ungültige Werte zurück', async () => {
    const outside = fixture(); updateAndCommit(outside, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '# Vorschlag\n\n## Problem\nChange-ID: anderes\nDer fachliche Zweck bleibt belegt.\n'); const outsideState = await createTwinState(outside); expect(outsideState.artifacts.find((item) => item.kind === 'change')).toMatchObject({ id: 'demo', title: 'OpenSpec-Aenderung demo', status: 'archived', rationale: 'Change-ID: anderes Der fachliche Zweck bleibt belegt.' });
    const invalidBodies = [
      '# Vorschlag\n\n- Change: demo\n- Change-ID: demo\n\n## Problem\nTest.\n',
      '# Vorschlag\n\n- Change: demo\n\n## Metadaten\n- Change-ID: anderes\n\n## Problem\nTest.\n',
      '# Vorschlag\n\n## Metadaten\n- Change: demo\n- Status: frei erfunden\n\n## Problem\nTest.\n',
      '# Vorschlag\n\n## Metadaten\n- Change: demo\n- Status: aktiv,\n\n## Problem\nTest.\n',
      '# Vorschlag\n\n## Metadaten\n- Change: demo\n- Status: aktiv, in Review, nochmals\n\n## Problem\nTest.\n',
      '# Vorschlag\n\n## Metadaten\n- Change: demo\n- Status: aktiv, https://example.invalid/review\n\n## Problem\nTest.\n',
      '# Vorschlag\n\n## Metadaten\n- Change: demo\n- Welle: W6 Unzulässig\n\n## Problem\nTest.\n',
    ];
    for (const body of invalidBodies) { const root = fixture(); updateAndCommit(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', body); const state = await createTwinState(root); expect(state.stats.changes).toBe(0); expect(state.warnings.some((warning) => warning.includes('Markdown-Vertrag'))).toBe(true); }
  }, 30_000);
  it('ignoriert Blankovorlagen still und meldet weiterhin ehrlich fehlende echte Change-Vorschläge', async () => { const root = fixture(); fs.rmSync(path.join(root, 'openspec', 'changes'), { recursive: true, force: true }); write(root, 'openspec/schemas/universaarl-delivery/templates/proposal.md', '# Blankovorlage\n'); commitAll(root, 'nur OpenSpec-Blankovorlage'); const state = await createTwinState(root); expect(state.stats.changes).toBe(0); expect(state.artifacts.some((item) => item.sourcePath.includes('/templates/'))).toBe(false); expect(state.warnings).toEqual(['Keine OpenSpec-Aenderungsvorschlaege gefunden.']); });
  it('löst ausschließlich streng strukturierte Katalog-, Index- und Main-Spec-IDs auf', async () => {
    const root = fixture();
    write(root, 'capabilities/catalog.yaml', 'artifactId: UABC-CAP-CATALOG-001\ndomains:\n  - id: UABC-CAP-FIN\n    name: Finance\n    capabilities:\n      - { id: UABC-CAP-FIN-R2R, name: Record to Report, status: planned, wave: W1 }\n');
    write(root, 'openspec/specs/project-governance/artifact-index.yaml', 'schemaVersion: 1\nartifacts:\n  - artifactId: UABC-GOV-REFERENCE-001\n    title: Referenz-Governance\n    canonicalPath: governance/reference-lifecycle.yaml\n    lifecycleStatus: approved\n    purpose: Referenzen streng verwalten.\n');
    write(root, 'governance/reference-lifecycle.yaml', 'schemaVersion: 1\n');
    write(root, 'openspec/specs/project-governance/spec.md', '# Projekt-Governance\n\n### Requirement: UABC-REQ-GOV-001 Referenzen sind strukturiert.\n\n#### Scenario: UABC-SCN-GOV-001 Gültige Referenz\n');
    write(root, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Projekt\nstatus: documented\nreferenceIds: [UABC-CAP-CATALOG-001, UABC-GOV-REFERENCE-001, UABC-REQ-GOV-001, UABC-SCN-GOV-001]\n---\n# Projekt\n');
    commitAll(root, 'strukturierte OpenSpec-Referenzquellen');
    const state = await createTwinState(root); expect(state.warnings).toEqual([]);
  });
  it('weist fehlerhafte, doppelte und übergroße OpenSpec-ID-Quellen fail-closed zurück', async () => {
    const invalidIndex = fixture(); updateAndCommit(invalidIndex, 'openspec/specs/project-governance/artifact-index.yaml', 'schemaVersion: 1\nartifacts:\n  - artifactId: UABC..UNGÜLTIG\n    title: Ungültig\n    canonicalPath: openspec/specs/project-governance/spec.md\n    lifecycleStatus: approved\n    purpose: Test.\n');
    const invalidSpec = fixture(); updateAndCommit(invalidSpec, 'openspec/specs/project-governance/spec.md', '# Projekt-Governance\n\n### Requirement: UABC..UNGÜLTIG Test\n');
    const duplicateSpec = fixture(); updateAndCommit(duplicateSpec, 'openspec/specs/project-governance/spec.md', '# Projekt-Governance\n\n### Requirement: UABC-REQ-DUP-001 Test\n\n#### Scenario: UABC-REQ-DUP-001 Test\n');
    const oversizedSpec = fixture(); updateAndCommit(oversizedSpec, 'openspec/specs/project-governance/spec.md', `# Projekt-Governance\n${'x'.repeat(512 * 1024)}\n`);
    for (const root of [invalidIndex, invalidSpec, duplicateSpec, oversizedSpec]) expect(await rejectionMessage(() => createTwinState(root))).toContain('Datenvertrag');
  }, 30_000);
  it('weist OpenSpec-Markdown bei ID-Mismatch, Übergröße, HTML, Link oder freiem Pfad ohne Teilwahrheit zurück', async () => { const mismatch = fixture(); updateAndCommit(mismatch, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '# Change-Vorschlag: Demo\n\n- **Change-ID:** `anderes`\n\n## Problem\nTest.\n'); const mismatchState = await createTwinState(mismatch); expect(mismatchState.stats.changes).toBe(0); expect(JSON.stringify(mismatchState)).not.toContain('anderes'); const oversized = fixture(); updateAndCommit(oversized, 'openspec/changes/archive/2026-07-10-demo/proposal.md', `# Vorschlag\n\n## Zweck\n${'x'.repeat(256 * 1024)}\n`); expect((await createTwinState(oversized)).stats.changes).toBe(0); for (const body of ['# Vorschlag <script>\n', '# Vorschlag\n\n## Zweck\n[Quelle](https://example.invalid)\n', '# Vorschlag\n\n## Zweck\nQuelle=/srv/intern\n']) { const invalid = fixture(); updateAndCommit(invalid, 'openspec/changes/archive/2026-07-10-demo/proposal.md', body); const state = await createTwinState(invalid); expect(state.stats.changes).toBe(0); expect(JSON.stringify(state)).not.toMatch(/script|example\.invalid|\/srv\/intern/i); } }, 30_000);
  it('blockiert HEAD-, Index- und Porcelain-Rennen getrennt', async () => {
    const headRoot = fixture(); const headMessage = await rejectionMessage(() => createTwinState(headRoot, { testHookAfterRead: () => { git(headRoot, ['commit', '--allow-empty', '-m', 'head race']); } }));
    const indexRoot = fixture(); const indexMessage = await rejectionMessage(() => createTwinState(indexRoot, { testHookAfterRead: () => { git(indexRoot, ['update-index', '--assume-unchanged', 'architecture/enterprise-blueprint.yaml']); } }));
    const statusRoot = fixture(); write(statusRoot, 'erster.tmp', 'a'); const statusMessage = await rejectionMessage(() => createTwinState(statusRoot, { testHookAfterRead: () => { fs.renameSync(path.join(statusRoot, 'erster.tmp'), path.join(statusRoot, 'zweiter.tmp')); } }));
    for (const message of [headMessage, indexMessage, statusMessage]) { expect(message).toContain('Quellreferenzen'); expect(message).not.toContain('uabc-shell-'); }
  }, 15_000);
  it('akzeptiert nur regulaere Git-Blobs und weist Symlink sowie Submodul zurueck', async () => {
    const executable = fixture(); git(executable, ['update-index', '--chmod=+x', 'architecture/enterprise-blueprint.yaml']); git(executable, ['commit', '-m', 'regular executable blob']); await expect(createTwinState(executable)).resolves.toBeTruthy();
    const symlink = fixture(); const blob = git(symlink, ['rev-parse', 'HEAD:evidence/run/frame.png']); git(symlink, ['update-index', '--add', '--cacheinfo', `120000,${blob},evidence/link.png`]); git(symlink, ['commit', '-m', 'symlink mode']); const symlinkMessage = await rejectionMessage(() => createTwinState(symlink));
    const submodule = fixture(); const commit = git(submodule, ['rev-parse', 'HEAD']); git(submodule, ['update-index', '--add', '--cacheinfo', `160000,${commit},evidence/submodule`]); git(submodule, ['commit', '-m', 'submodule mode']); const submoduleMessage = await rejectionMessage(() => createTwinState(submodule));
    for (const message of [symlinkMessage, submoduleMessage]) expect(message).toContain('Eintragstyp');
  }, 15_000);
  it('weist einen Repository-Junction als uneindeutige Quellgrenze zurueck', async () => {
    const root = fixture(); const junction = path.join(os.tmpdir(), `uabc-shell-junction-${process.pid}-${Date.now()}`); fs.symlinkSync(root, junction, 'junction');
    try { expect(await rejectionMessage(() => createTwinState(junction))).toContain('nicht verfuegbar'); } finally { fs.unlinkSync(junction); }
  });
  it('weist ein Unterverzeichnis eines umschliessenden Git-Worktrees als Quellroot zurueck', async () => {
    const enclosing = fixture(); const nested = path.join(enclosing, 'verschachtelte-quelle'); fs.mkdirSync(nested); expect(await rejectionMessage(() => createTwinState(nested))).toContain('Arbeitsbaumwurzel');
  });
  it('blockiert sensible Baumsegmente, Traversal und redigiert Fehler', async () => {
    const root = fixture(); updateAndCommit(root, 'evidence/session/frame.png', validPng);
    const message = await rejectionMessage(() => createTwinState(root)); expect(message).toContain('Quellpfad'); expect(message).not.toContain(root); expect(message).not.toContain('session'); expect(message).not.toContain('frame.png');
    for (const value of ['evidence/../frame.png', 'evidence/.env', 'evidence/.env.local', 'evidence/.envrc', 'evidence/.gitconfig', 'evidence/token/result.json', 'evidence/tokens/result.json', 'evidence/clientSecret.json', 'evidence/ClientSecret.json', 'evidence/accessToken.png', 'evidence/refreshToken.yaml', 'evidence/storage_state.json', 'evidence/storageState.json', 'evidence/service_account.yaml', 'evidence/serviceAccount.yaml', 'evidence/connection_string.json', 'evidence/connectionString.json', 'evidence/password/result.json', 'evidence/passwords/result.json', 'evidence/passwd.yaml', 'evidence/api-key/result.json', 'evidence/api_key/result.json', 'evidence/access-key.json', 'evidence/private-key.json', 'evidence/oauth/result.json', 'evidence/oauth2/result.json', 'evidence/ssh/result.json', 'evidence/.npmrc', 'evidence/.netrc', 'evidence/.kube/config', 'evidence/id_rsa', 'evidence/client.pem', 'evidence/client.pfx', 'evidence/client.crt', 'evidence\\frame.png', 'evidence//frame.png']) expect(validateProvenancePath(value)).toBe(false);
    for (const value of ['evidence/serviceAccountBackup.yaml', 'evidence/backupServiceAccount.yml', 'evidence/backup-service_account.snapshot.yaml', 'evidence/connectionStringExport.json', 'evidence/export.connection-string.backup.json', 'evidence/storageStateArchive.png', 'evidence/archive_storage-state.snapshot.png']) expect(validateProvenancePath(value)).toBe(false);
  });
  it('blockiert sensible JSON-, PNG- und YAML-Namen vor jedem Bloblesen', async () => {
    const json = fixture(); updateAndCommit(json, 'evidence/ClientSecret.json', '{');
    const png = fixture(); updateAndCommit(png, 'evidence/accessToken.png', Buffer.from('kein png'));
    const yaml = fixture(); updateAndCommit(yaml, 'evidence/refresh_token.yaml', 'ungueltig: [');
    const storage = fixture(); updateAndCommit(storage, 'evidence/storage_state.json', '{'); const service = fixture(); updateAndCommit(service, 'evidence/serviceAccount.yaml', 'ungueltig: ['); const connection = fixture(); updateAndCommit(connection, 'evidence/connectionString.png', Buffer.from('kein png'));
    for (const [root, parserWord] of [[json, 'JSON'], [png, 'PNG'], [yaml, 'YAML'], [storage, 'JSON'], [service, 'YAML'], [connection, 'PNG']] as const) { const message = await rejectionMessage(() => createTwinState(root)); expect(message).toContain('Quellpfad'); expect(message).not.toContain(parserWord); }
    for (const [name, content, parserWord] of [['evidence/serviceAccountBackup.yaml', 'ungueltig: [', 'YAML'], ['evidence/export.connection-string.backup.json', '{', 'JSON'], ['evidence/archive_storage-state.snapshot.png', Buffer.from('kein png'), 'PNG']] as const) { const family = fixture(); updateAndCommit(family, name, content); const message = await rejectionMessage(() => createTwinState(family)); expect(message).toContain('Quellpfad'); expect(message).not.toContain(parserWord); }
  }, 30_000);
  it('erzwingt Datei-, Gesamt-, Text-, PNG- und Listenlimits', async () => {
    const root = fixture();
    const messages = await Promise.all([
      rejectionMessage(() => createTwinState(root, { limits: { maxFiles: 6 } })),
      rejectionMessage(() => createTwinState(root, { limits: { maxTotalBytes: 64 } })),
      rejectionMessage(() => createTwinState(root, { limits: { maxTextBytes: 16 } })),
      rejectionMessage(() => createTwinState(root, { limits: { maxPngBytes: 7 } })),
    ]);
    expect(messages.join(' ')).toContain('Dateianzahl'); expect(messages.join(' ')).toContain('Gesamtvolumen'); expect(messages.join(' ')).toContain('Textblob'); expect(messages.join(' ')).toContain('PNG-Quellblob');
    const arrays = fixture(); updateAndCommit(arrays, 'capabilities/catalog.yaml', 'domains:\n  - id: UABC-CAP-FIN\n    capabilities:\n      - { id: UABC-CAP-A }\n      - { id: UABC-CAP-B }\n');
    expect(await rejectionMessage(() => createTwinState(arrays, { limits: { maxArrayItems: 1 } }))).toContain('Quellliste');
  }, 15_000);
  it('begrenzt Confluence-Frontmatter nach Bytes, Listen, Tiefe und Aliasexpansion', async () => {
    const bytes = fixture(); expect(await rejectionMessage(() => createTwinState(bytes, { limits: { maxFrontmatterBytes: 32 } }))).toContain('Frontmatter');
    const arrays = fixture(); updateAndCommit(arrays, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\njiraRefs: [UABC-1, UABC-2]\n---\n# Projekt\n'); expect(await rejectionMessage(() => createTwinState(arrays, { limits: { maxArrayItems: 1 } }))).toContain('Quellliste');
    const deep = fixture(); const deepLines = ['---', 'id: UABC-PROJECT', 'nested:']; for (let index = 0; index < 105; index += 1) deepLines.push(`${'  '.repeat(index + 1)}level${index}:`); deepLines.push(`${'  '.repeat(106)}value`); deepLines.push('---', '# Projekt'); updateAndCommit(deep, 'atlassian/confluence/pages/project.md', `${deepLines.join('\n')}\n`); expect(await rejectionMessage(() => createTwinState(deep))).toContain('tief verschachtelt');
    const aliases = fixture(); updateAndCommit(aliases, 'atlassian/confluence/pages/project.md', `---\nid: UABC-PROJECT\nbase: &base { value: Test }\naliases:\n${Array.from({ length: 60 }, () => '  - *base').join('\n')}\n---\n# Projekt\n`); expect(await rejectionMessage(() => createTwinState(aliases))).toContain('YAML');
  }, 20_000);
  it('haelt Confluence-Frontmatter-Caches auf den einzelnen Commitreader begrenzt', async () => {
    const root = fixture(); const titles = new Set<string>();
    for (let index = 1; index <= 6; index += 1) { updateAndCommit(root, 'atlassian/confluence/pages/project.md', `---\nid: UABC-PROJECT\ntitle: Projekt ${index}\nstatus: documented\n---\n# Projekt ${index}\n`); const state = await createTwinState(root); titles.add(state.artifacts.find((item) => item.kind === 'document')?.title ?? ''); }
    expect([...titles]).toEqual(['Projekt 1', 'Projekt 2', 'Projekt 3', 'Projekt 4', 'Projekt 5', 'Projekt 6']); expect(fs.readFileSync(path.resolve('src/server/adapter.ts'), 'utf8')).not.toContain('gray-matter');
  }, 30_000);
  it('unterstützt Jira Sub-task sowie beobachtete Root-Eltern null in Jira und Confluence streng', async () => { const root = fixture(); write(root, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Epic, summary: Root, status: Done, parent: null, components: [Finance] }\n'); write(root, 'atlassian/jira/issues/subtasks.yaml', 'issues:\n  - key: UABC-2\n    type: Sub-task\n    summary: Unteraufgabe\n    status: In Progress\n    wave: W2\n    components: [Finance]\n    acceptanceCriteria: [Geprüft]\n    parent: UABC-1\n    dependencies: [UABC-1]\n    confluenceRefs: [UABC-PROJECT]\n    evidenceRefs: [UABC-VER-APPROVAL-001]\n  - { key: UABC-3, type: Task, summary: Zweiter Root, parent: null }\n'); write(root, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Projekt\nstatus: documented\nparent: null\n---\n# Projekt\n'); commitAll(root, 'reale Jira- und Confluence-Form'); const state = await createTwinState(root); expect(state.stats.jira).toBe(3); expect(state.artifacts.find((item) => item.id === 'UABC-1')?.parentId).toBeNull(); expect(state.artifacts.find((item) => item.id === 'UABC-2')).toMatchObject({ kind: 'task', parentId: 'UABC-1', dependencies: ['UABC-1'], documents: ['UABC-PROJECT'], evidence: ['UABC-VER-APPROVAL-001'] }); expect(state.artifacts.find((item) => item.id === 'UABC-3')?.parentId).toBeNull(); expect(state.artifacts.find((item) => item.id === 'UABC-PROJECT')?.parentId).toBeNull(); const invalidJira = fixture(); updateAndCommit(invalidJira, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Task, summary: Test, parent: { ungueltig: true } }\n'); expect(await rejectionMessage(() => createTwinState(invalidJira))).toContain('Datenvertrag'); const invalidConfluence = fixture(); updateAndCommit(invalidConfluence, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\nparent: 7\n---\n# Projekt\n'); expect(await rejectionMessage(() => createTwinState(invalidConfluence))).toContain('Datenvertrag'); }, 20_000);
  it('bezieht nichtleere Jira- und Confluence-Eltern in die Referenzwahrheit ein', async () => {
    const unknown = fixture(); write(unknown, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Task, summary: Test, parent: UABC-MISSING-JIRA-PARENT }\n'); write(unknown, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Projekt\nparent: UABC-MISSING-DOC-PARENT\n---\n# Projekt\n'); commitAll(unknown, 'unbekannte Elternreferenzen'); const unknownState = await createTwinState(unknown); const warning = unknownState.warnings.find((item) => item.startsWith('Nicht aufgeloeste Quellreferenzen:')) ?? ''; expect(warning).toContain('UABC-MISSING-JIRA-PARENT'); expect(warning).toContain('UABC-MISSING-DOC-PARENT');
    const known = fixture(); write(known, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Epic, summary: Elternvorgang }\n  - { key: UABC-2, type: Task, summary: Kind, parent: UABC-1 }\n'); write(known, 'atlassian/confluence/pages/root.md', '---\nid: UABC-DOC-ROOT\ntitle: Wurzel\n---\n# Wurzel\n'); write(known, 'atlassian/confluence/pages/project.md', '---\nid: UABC-PROJECT\ntitle: Projekt\nparent: UABC-DOC-ROOT\n---\n# Projekt\n'); commitAll(known, 'bekannte Elternreferenzen'); const knownState = await createTwinState(known); expect(knownState.warnings.some((item) => item.startsWith('Nicht aufgeloeste Quellreferenzen:'))).toBe(false);
  }, 20_000);
  it('weist ungueltiges YAML, JSON, PNG und Zod-Vertragsdaten fail-closed zurueck', async () => {
    const yaml = fixture(); updateAndCommit(yaml, 'architecture/enterprise-blueprint.yaml', 'artifactId: [\n');
    const json = fixture(); updateAndCommit(json, 'evidence/invalid.json', '{');
    const png = fixture(); updateAndCommit(png, 'evidence/run/frame.png', Buffer.from('kein png'));
    const zod = fixture(); updateAndCommit(zod, 'architecture/enterprise-blueprint.yaml', 'artifactId: 7\ntitle: Architektur\n');
    const messages = await Promise.all([rejectionMessage(() => createTwinState(yaml)), rejectionMessage(() => createTwinState(json)), rejectionMessage(() => createTwinState(png)), rejectionMessage(() => createTwinState(zod))]);
    expect(messages[0]).toContain('YAML'); expect(messages[1]).toContain('JSON'); expect(messages[2]).toContain('PNG'); expect(messages[3]).toContain('Datenvertrag'); for (const message of messages) expect(message).not.toContain('uabc-shell-');
  }, 15_000);
  it('weist Zod-Vertragsverletzungen jeder unterstuetzten Quellfamilie zurueck oder als nicht unterstuetzt aus', async () => {
    const capabilities = fixture(); updateAndCommit(capabilities, 'capabilities/catalog.yaml', 'domains:\n  - id: UABC-CAP-FIN\n    capabilities:\n      - id: []\n');
    const jira = fixture(); updateAndCommit(jira, 'atlassian/jira/issues/wave.yaml', 'issues:\n  - { key: UABC-1, type: Defect, summary: Test }\n');
    const confluence = fixture(); updateAndCommit(confluence, 'atlassian/confluence/pages/project.md', '---\nid: [UABC-PROJECT]\n---\n# Projekt\n');
    const evidence = fixture(); updateAndCommit(evidence, 'evidence/verification-register.yaml', 'verifications:\n  - { id: UABC-VER-1, changeRef: demo, type: { invalid: true } }\n');
    for (const root of [capabilities, jira, confluence, evidence]) expect(await rejectionMessage(() => createTwinState(root))).toContain('Datenvertrag');
    const openSpec = fixture(); updateAndCommit(openSpec, 'openspec/changes/archive/2026-07-10-demo/proposal.md', '---\nid: demo\nreferences: ["/ungueltig/pfad"]\n---\n'); const state = await createTwinState(openSpec); expect(state.stats.changes).toBe(0); expect(state.warnings.some((warning) => warning.includes('begrenzten strukturierten'))).toBe(true);
  }, 20_000);
  it('weist trunkierte PNGs und extreme IHDR-Abmessungen zurueck', async () => {
    const truncated = fixture(); updateAndCommit(truncated, 'evidence/run/frame.png', validPng.subarray(0, validPng.length - 1));
    const extreme = fixture(); updateAndCommit(extreme, 'evidence/run/frame.png', pngWithDimensions(10_001, 1));
    expect(await rejectionMessage(() => createTwinState(truncated))).toContain('PNG-Quellblob'); expect(await rejectionMessage(() => createTwinState(extreme))).toContain('Bildabmessungen');
  });
  it('erzwingt PNG-CRC, Palette und zusammenhaengende IDAT-Reihenfolge', async () => {
    const idat = pngChunk('IDAT', Buffer.from([1])); const palette = pngChunk('PLTE', Buffer.from([0, 0, 0])); const text = pngChunk('tEXt', Buffer.from('x'));
    const corruptCrc = Buffer.from(validPng); corruptCrc[29] ^= 0xff;
    const cases = [corruptCrc, structuredPng(3, [idat]), structuredPng(3, [palette, palette, idat]), structuredPng(0, [palette, idat]), structuredPng(6, [idat, text, idat])];
    for (const invalid of cases) { const root = fixture(); updateAndCommit(root, 'evidence/run/frame.png', invalid); expect(await rejectionMessage(() => createTwinState(root))).toContain('PNG-Quellblob'); }
  }, 20_000);
  it('redigiert absolute Hostpfade und URI-artige Quellwerte vor State und API', async () => {
    const root = fixture(); const leakedPath = path.join(root, 'private', 'tenant.json'); const encode = (value: string, rounds: number) => { let encoded = value; for (let round = 0; round < rounds; round += 1) encoded = encodeURIComponent(encoded); return encoded; };
    const safeLearn = 'https://learn.microsoft.com/de-de/dynamics365/business-central/dev-itpro/developer/devenv-dev-overview'; const safeOpenSpec = 'https://github.com/Fission-AI/OpenSpec/docs'; const tenantGuid = '123e4567-e89b-42d3-a456-426614174000'; const nGuid = '00112233445566778899aabbccddeeff';
    const tripleEncodedPath = encode('/data/intern/confluence', 3); const quadrupleEncodedUnc = encode('\\\\server\\share\\nachweis', 4); const overEncodedPath = encode('/srv/intern/zu-tief', 12); const oversized = `https://oversized.example.invalid/${'x'.repeat(32_769)}`;
    const encodeEveryCharacter = (value: string) => [...value].map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''); const encodedNGuid = encodeEveryCharacter(nGuid); const encodedGuid = encodeEveryCharacter(tenantGuid); const doubleEncodedNGuid = encode(encodedNGuid, 1); const doublePrivate = encode('/private/customer-acme', 2); const doubleQuery = encode('page?customer=acme', 2); const encodedFragment = encode('page#customer-acme', 1);
    const publicUrls = [safeLearn, safeOpenSpec, `https://businesscentral.dynamics.com/${tenantGuid}/`, 'https://localhost/intern', 'https://127.0.0.1/intern', 'https://evil.learn.microsoft.com/de-de/dynamics365/business-central/', 'https://benutzer:passwort@learn.microsoft.com/de-de/dynamics365/business-central/', 'https://learn.microsoft.com:443/de-de/dynamics365/business-central/', 'https://learn.microsoft.com:8443/de-de/dynamics365/business-central/', 'https://learn.microsoft.com%3A443/de-de/dynamics365/business-central/', 'https://learn.microsoft.com%253A443/de-de/dynamics365/business-central/', 'https://learn.microsoft.com./de-de/dynamics365/business-central/', 'https://learn%2Emicrosoft.com/de-de/dynamics365/business-central/', 'https://%6cearn.microsoft.com/de-de/dynamics365/business-central/', `https://learn.microsoft.com/de-de/dynamics365/business-central/tenant/${tenantGuid}`, 'https://learn.microsoft.com/de-de/dynamics365/business-central/accessTokenBackup/seite', 'https://learn.microsoft.com/de-de/dynamics365/business-central/private/customer-acme', 'https://learn.microsoft.com/de-de/dynamics365/business-central/privateCustomerAcme', `https://learn.microsoft.com/de-de/dynamics365/business-central/page${doublePrivate}`, `https://learn.microsoft.com/de-de/dynamics365/business-central/${nGuid}`, `https://learn.microsoft.com/de-de/dynamics365/business-central/${encodedNGuid}`, `https://learn.microsoft.com/de-de/dynamics365/business-central/${doubleEncodedNGuid}`, `https://learn.microsoft.com/de-de/dynamics365/business-central/${encodedGuid}`, `https://learn.microsoft.com/de-de/dynamics365/business-central/${doubleQuery}`, `https://learn.microsoft.com/de-de/dynamics365/business-central/${encodedFragment}`, 'https://learn.microsoft.com/de-de/dynamics365/business-central/?token=geheim', 'https://learn.microsoft.com/de-de/dynamics365/business-central/#session-geheim', 'https://learn.microsoft.com/de-de/dynamics365/business-central/dev-overview%3Ftoken%3Dgeheim', 'https://learn.microsoft.com/de-de/dynamics365/business-central/dev-overview%23session-geheim', 'http://learn.microsoft.com/de-de/dynamics365/business-central/']; const publicUrlYaml = publicUrls.map((url) => `'${url}'`).join(', ');
    write(root, 'architecture/enterprise-blueprint.yaml', `artifactId: UABC-ARCH-001\ntitle: 'Quelle=/srv/intern/architektur'\nlifecycleStatus: approved\napproval:\n  scope: '${oversized}'\nactualSandboxBaseline:\n  unknowns: ['Quelle=${leakedPath.replaceAll("'", "''")}', 'Quelle=/Volumes/Intern/architektur', ${publicUrlYaml}, 'Quelle=${overEncodedPath}', 'urn:intern:geheim', 'mailto:geheim@example.invalid']\n`);
    write(root, 'capabilities/catalog.yaml', "domains:\n  - id: UABC-CAP-FIN\n    name: 'pfad:/run/intern/domaene'\n    capabilities:\n      - id: UABC-CAP-FIN-R2R\n        name: 'pfad:/workspace/intern/faehigkeit'\n        purpose: 'C:\\Users\\geheim\\capability.txt'\n        status: planned\n        wave: W1\n");
    write(root, 'atlassian/jira/issues/wave.yaml', "issues:\n  - key: UABC-1\n    type: Epic\n    summary: 'Quelle=//server/share/jira'\n    status: Done\n    components: ['\\\\server\\share\\team']\n");
    write(root, 'openspec/changes/archive/2026-07-10-demo/proposal.md', "---\nid: demo\ntitle: 'Quelle=/usr/intern/openspec'\nstatus: archived\nproblem: 'smb://server/share/problem'\nreferences: []\n---\n# /srv/Freitext/wird-nicht-gelesen\n");
    write(root, 'atlassian/confluence/pages/project.md', `---\nid: UABC-PROJECT\ntitle: 'Quelle=${tripleEncodedPath}'\nstatus: documented\n---\n# Quelle=/var/intern/inhalt\n`);
    write(root, 'evidence/verification-register.yaml', `verifications:\n  - id: UABC-VER-APPROVAL-001\n    changeRef: demo\n    status: passed\n    type: human-approval\n    evidence: 'Pfad=/home/intern/nachweis Quelle=${quadrupleEncodedUnc} custom+opaque:geheim'\n`);
    commitAll(root, 'host path injection');
    const state = await createTwinState(root); const serialized = JSON.stringify(state); const uiProjection = JSON.stringify({ artifacts: state.artifacts, gaps: state.gaps, warnings: state.warnings }); for (const leaked of [root, tenantGuid, nGuid, encodedNGuid, encodedGuid, doubleEncodedNGuid, 'private/customer-acme', 'privateCustomerAcme', doublePrivate, 'customer=acme', doubleQuery, 'customer-acme', encodedFragment, 'businesscentral.dynamics.com', 'localhost', '127.0.0.1', 'evil.learn.microsoft.com', 'benutzer:passwort', ':443', ':8443', '%3A443', '%253A443', 'learn.microsoft.com.', 'learn%2Emicrosoft.com', '%6cearn.microsoft.com', 'accessTokenBackup', 'token=geheim', 'session-geheim', '%3Ftoken%3Dgeheim', '%23session-geheim', 'http://', 'https://oversized.example.invalid/', 'smb://', 'urn:', 'mailto:', 'custom+opaque:', '/srv/', '/run/', '/workspace/', '/data/', '/usr/', '/Volumes/', '/var/', '/home/', 'C:\\Users', '\\\\server', '//server/', '%25', '%2F', '%5C']) { expect(serialized).not.toContain(leaked); expect(uiProjection).not.toContain(leaked); } expect(serialized).toContain(safeLearn); expect(serialized).toContain(safeOpenSpec); expect(serialized).toContain('redigiert'); expect(state.artifacts.find((item) => item.kind === 'architecture')?.rationale).toBe('[Verweis redigiert]');
    const api = await dispatchProjectApi('GET', '/api/projects/universaarl/state', productionRegistry(root)); const apiBody = JSON.stringify(api.body); expect(api).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } }); for (const leaked of [root, tenantGuid, nGuid, encodedNGuid, encodedGuid, doubleEncodedNGuid, 'privateCustomerAcme', 'customer-acme', doublePrivate, doubleQuery, encodedFragment, 'http://', '%25']) expect(apiBody).not.toContain(leaked);
  });
  it('redigiert narrative Kennungen und sensible Wertpaare teilinhaltserhaltend in allen gerenderten Quellfamilien', async () => {
    const root = fixture(); const guid = '123e4567-e89b-42d3-a456-426614174000'; const nGuid = '00112233445566778899aabbccddeeff'; const embeddedIdentifier = 'xffeeddccbbaa00998877665544332211y'; const commitLike = 'a'.repeat(40); const safeUrl = 'https://learn.microsoft.com/de-de/dynamics365/business-central/dev-itpro/developer/devenv-dev-overview'; const longSecret = `${'x'.repeat(700)}EINDEUTIGES_ENDE`; const longQuotedSecret = `${'q'.repeat(700)}ZITIERTES_ENDE`; const longEscapedSecret = `${'e'.repeat(350)}\\"${'f'.repeat(350)}MASKIERTES_ENDE`;
    write(root, 'architecture/enterprise-blueprint.yaml', `artifactId: UABC-ARCH-001\ntitle: 'Architektur ${guid} tenantId=mandant-alpha mit sicherem Titel'\nlifecycleStatus: approved\napproval:\n  evidenceId: UABC-VER-APPROVAL-001\n  scope: 'Sichere Architekturprosa ${guid} access_token:tok-alpha und ${safeUrl}'\n`);
    write(root, 'capabilities/catalog.yaml', `domains:\n  - id: UABC-CAP-FIN\n    name: Finanzwesen\n    capabilities:\n      - id: UABC-CAP-FIN-R2R\n        name: Berichtswesen\n        purpose: 'Fachlicher Zweck ${guid} credential-id=cred-alpha und status=approved bleibt stabil; Basic Warehouse bleibt fachlich; ${embeddedIdentifier} und ${commitLike} sind keine alleinstehenden GUIDs.'\n        status: planned\n        wave: W1\n`);
    write(root, 'atlassian/jira/issues/wave.yaml', `issues:\n  - key: UABC-1\n    type: Task\n    summary: 'Aufgabe ${guid} password_value:pass-alpha mit Fachtext'\n    acceptanceCriteria: ['Prüfschritt ${guid} secretValue=sec-alpha bleibt belegt.']\n`);
    write(root, 'atlassian/confluence/pages/project.md', `---\nid: UABC-PROJECT\ntitle: 'Dokument ${guid} apiKey:key-alpha mit sicherem Titel'\nstatus: documented\n---\n# Fachseite\nSicherer Inhalt ${guid} tenant_id:tenant-alpha bleibt nachvollziehbar.\n`);
    write(root, 'evidence/verification-register.yaml', `verifications:\n  - id: UABC-VER-APPROVAL-001\n    changeRef: demo\n    status: passed\n    type: human-approval\n    evidence: 'Nachweis Bearer bearer-alpha und Basic basic-alpha; ${nGuid} Client Secret: "geheim" Access Token=access-mehrteilig Refresh Token: refresh-mehrteilig API Key=api-mehrteilig Private Key: private-mehrteilig Tenant Identifier=tenant-mehrteilig clientSecret: "wert mit leerzeichen" authorization: Bearer auth-bearer-alpha token=${longSecret} Basic "${longQuotedSecret}" Bearer "${longEscapedSecret}" apiKey=$SONDERWERT'\n`);
    commitAll(root, 'narrative Geheimniswerte');
    const state = await createTwinState(root); const serialized = JSON.stringify(state); const uiProjection = JSON.stringify({ artifacts: state.artifacts, gaps: state.gaps, warnings: state.warnings });
    for (const leaked of [guid, nGuid, 'mandant-alpha', 'tok-alpha', 'cred-alpha', 'pass-alpha', 'sec-alpha', 'key-alpha', 'tenant-alpha', 'bearer-alpha', 'basic-alpha', 'geheim', 'access-mehrteilig', 'refresh-mehrteilig', 'api-mehrteilig', 'private-mehrteilig', 'tenant-mehrteilig', 'wert mit leerzeichen', 'auth-bearer-alpha', longSecret, 'EINDEUTIGES_ENDE', longQuotedSecret, 'ZITIERTES_ENDE', longEscapedSecret, 'MASKIERTES_ENDE', '$SONDERWERT']) for (const projection of [serialized, uiProjection]) expect(projection).not.toContain(leaked);
    for (const safe of ['mit sicherem Titel', 'Sichere Architekturprosa', 'Fachlicher Zweck', 'status=approved', 'Basic Warehouse bleibt fachlich', 'mit Fachtext', 'Prüfschritt', 'Sicherer Inhalt', 'Nachweis', safeUrl]) expect(serialized).toContain(safe);
    expect(serialized).toContain('[Kennung redigiert]'); expect(serialized).toContain('[Wert redigiert]'); expect(serialized).toContain(embeddedIdentifier); expect(serialized).toContain(commitLike);
  }, 20_000);
  it('kuratiert Titel ohne Begruendung zu ueberschreiben und haelt UI-Begrenzungen ehrlich', async () => {
    const root = fixture(); updateAndCommit(root, 'architecture/enterprise-blueprint.yaml', 'artifactId: UABC-ARCH-001\ntitle: Universaarl enterprise architecture blueprint\nlifecycleStatus: approved\napproval:\n  scope: Explizit belegter Umfang\n');
    const state = await createTwinState(root); const architecture = state.artifacts.find((item) => item.kind === 'architecture'); expect(architecture).toMatchObject({ title: 'Universaarl-Unternehmensarchitektur', rationale: 'Explizit belegter Umfang' });
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); for (const text of ['displayStatus(artifact.status)', 'von ${artifacts.total} Datensätzen', 'BILDNACHWEISE', 'Prüf- und Quellenhinweise', 'von {paths.total} belegten Quellpfaden']) expect(ui).toContain(text); expect(ui).not.toContain('@ts-nocheck');
  });
  it('liefert Evidence nach Worktree-Austausch oder Loeschung weiterhin nur als Commitbytes', async () => {
    const root = fixture(); const state = await createTwinState(root); const id = state.evidenceItems[0].id; const file = path.join(root, 'evidence', 'run', 'frame.png');
    fs.writeFileSync(file, Buffer.from('Worktree-Manipulation')); expect(resolveEvidenceId(root, id)?.bytes).toEqual(validPng);
    fs.unlinkSync(file); expect(resolveEvidenceId(root, id)?.bytes).toEqual(validPng);
  }, 15_000);
  it('bindet Nachweis-IDs an den Commit', async () => { const root = fixture(); const first = await createTwinState(root); git(root, ['commit', '--allow-empty', '-m', 'new snapshot']); const second = await createTwinState(root); expect(second.source.commit).not.toBe(first.source.commit); expect(second.evidenceItems[0].id).not.toBe(first.evidenceItems[0].id); expect(resolveEvidenceId(root, first.evidenceItems[0].id)).toBeNull(); });
  it('schreibt weder Worktree noch HEAD oder Index', async () => { const root = fixture(); const beforeStatus = git(root, ['status', '--porcelain=v1', '-z']); const beforeHead = git(root, ['rev-parse', 'HEAD']); const beforeIndex = indexFingerprint(root); await createTwinState(root); expect(git(root, ['status', '--porcelain=v1', '-z'])).toBe(beforeStatus); expect(git(root, ['rev-parse', 'HEAD'])).toBe(beforeHead); expect(indexFingerprint(root)).toBe(beforeIndex); });
});

describe('indexgebundener project-data/v1-Vertrag', () => {
  it('blockiert die Produktions-API ohne Snapshotmanifest', async () => {
    const root = projectDataFixture();
    const response = await dispatchProjectApi('GET', '/api/projects/bc-basic/state', productionRegistry(root));
    expect(response).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } });
  });
});

describe('projektgescopte API', () => {
  it('liefert die normale Projektliste vollständig und explizit projektgebundenen Universaarl-State', async () => { const root = fixture(); const registry = productionRegistry(root); const list = await dispatchProjectApi('GET', '/api/projects', registry); const expected = [{ id: 'universaarl', key: 'UABC', name: 'Universaarl' }, { id: 'bc-basic', key: 'BCB', name: 'Business Central Basic' }]; expect(list).toMatchObject({ status: 200, body: { projects: expected } }); expect(projectListFromApiBody(list.body)).toEqual(expected); const result = await dispatchProjectApi('GET', '/api/projects/universaarl/state', registry); expect(result).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } }); });
  it('weist eine übergroße valide Projektliste server- und clientseitig ohne Trunkierung fail-closed ab', async () => { const entries = Array.from({ length: renderLimits.projects + 1 }, (_, index) => ({ id: `projekt-${String(index).padStart(2, '0')}`, key: `P${String(index).padStart(3, '0')}`, name: index === renderLimits.projects ? 'Nicht sichtbarer Rohname Geheim' : `Projekt ${index}`, sourceRoot: 'C:\\quelle' })); const registry = createProjectRegistry(entries); const result = await dispatchProjectApi('GET', '/api/projects', registry); expect(result).toEqual({ status: 503, body: { code: 'PROJEKTLISTE_ZU_GROSS' } }); const publicBody = { projects: entries.map(({ id, key, name }) => ({ id, key, name })) }; expect(projectListFromApiBody(publicBody)).toBeNull(); const message = uiErrorMessage('PROJEKTLISTE_NICHT_VERFUEGBAR'); expect(message).toBe('Die konfigurierte Projektliste ist derzeit nicht verfügbar.'); expect(JSON.stringify(result)).not.toContain('Geheim'); const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8'); expect(ui).toContain('projectListFromApiBody(await readJson(response))'); expect(ui).not.toContain('projects.slice('); });
  it('weist unbekannte Projekte vor Adapterzugriff mit festem deutschem Code zurück', async () => { const reader = vi.fn(); const result = await dispatchProjectApi('GET', '/api/projects/fremd/state', productionRegistry('C:\\x'), reader); expect(result).toEqual({ status: 404, body: { code: 'PROJEKT_NICHT_GEFUNDEN' } }); expect(reader).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('universaarl'); });
  it('liefert ausschließlich feste deutsche Fehlercodes und verbirgt Rohfehler vollständig', async () => { const reader = vi.fn().mockRejectedValue(new Error('Fetch failed: C:\\Users\\secret\\tenant.json')); const errorRegistry = createProjectRegistry([{ id: 'universaarl', key: 'UABC', name: 'Universaarl', sourceRoot: 'C:\\missing', sourceContract: bcBasicContract }]); const unavailable = await dispatchProjectApi('GET', '/api/projects/universaarl/state', errorRegistry, reader); expect(unavailable).toEqual({ status: 503, body: { code: 'QUELLE_NICHT_VERFUEGBAR' } }); const missing = await dispatchProjectApi('GET', '/api/project-state', productionRegistry('C:\\x')); expect(missing).toEqual({ status: 404, body: { code: 'ENDPUNKT_NICHT_GEFUNDEN' } }); expect(await dispatchProjectApi('POST', '/api/projects', productionRegistry('C:\\x'))).toEqual({ status: 405, body: { code: 'METHODE_NICHT_ERLAUBT' } }); expect(JSON.stringify([unavailable, missing])).not.toMatch(/Fetch|Users|secret|tenant|error|message/i); expect(apiErrorCodes).toEqual(['METHODE_NICHT_ERLAUBT', 'ENDPUNKT_NICHT_GEFUNDEN', 'ANFRAGE_UNGUELTIG', 'PROJEKT_NICHT_GEFUNDEN', 'PROJEKTLISTE_ZU_GROSS', 'QUELLE_NICHT_VERFUEGBAR', 'SNAPSHOT_VERTRAG_BLOCKIERT', 'NACHWEIS_NICHT_GEFUNDEN', 'API_NICHT_VERFUEGBAR']); expect(fs.readFileSync(path.resolve('vite.config.ts'), 'utf8')).toContain('{"code":"API_NICHT_VERFUEGBAR"}'); });
  it('bindet identische Commitblobs an die Projekt-ID und macht A-IDs unter B unauflösbar', async () => { const root = fixture(); const stateA = await createBoundTwinState('projekt-a', root); const stateB = await createBoundTwinState('projekt-b', root); expect(stateA.source.commit).toBe(stateB.source.commit); expect(stateA.source.projectId).toBe('projekt-a'); expect(stateB.source.projectId).toBe('projekt-b'); expect(stateA.evidenceItems[0].id).not.toBe(stateB.evidenceItems[0].id); expect(resolveBoundEvidenceId('projekt-a', root, stateA.evidenceItems[0].id)?.bytes).toEqual(validPng); expect(resolveBoundEvidenceId('projekt-b', root, stateA.evidenceItems[0].id)).toBeNull(); expect(resolveBoundEvidenceId('projekt-a', root, stateB.evidenceItems[0].id)).toBeNull(); }, 20_000);
  it('isoliert Nachweise projektgebunden und lehnt Traversal-IDs ab', async () => { const root = fixture(); const state = await createBoundTwinState('universaarl', root); expect(resolveBoundEvidenceId('universaarl', root, state.evidenceItems[0].id)?.bytes).toEqual(validPng); expect(resolveBoundEvidenceId('universaarl', root, '../secret')).toBeNull(); expect(await dispatchProjectApi('GET', `/api/projects/fremd/evidence/${state.evidenceItems[0].id}`, productionRegistry(root))).toEqual({ status: 404, body: { code: 'PROJEKT_NICHT_GEFUNDEN' } }); expect(await dispatchProjectApi('GET', `/api/projects/universaarl/evidence/${state.evidenceItems[0].id}`, productionRegistry(root))).toEqual({ status: 503, body: { code: 'SNAPSHOT_VERTRAG_BLOCKIERT' } }); });
});
