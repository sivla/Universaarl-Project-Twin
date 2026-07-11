import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const validator = path.resolve('scripts/validate-german.mjs');
const roots: string[] = [];
const gitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function git(root: string, args: string[], input?: string) {
  return execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', env: gitEnvironment, input }).trim();
}

function write(root: string, relative: string, content: string | Buffer) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function repository(files: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projektzwilling-deutsch-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main', root], { env: gitEnvironment });
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'user.name', 'Prüfung']);
  git(root, ['config', 'user.email', 'pruefung@example.invalid']);
  write(root, 'README.md', '# Deutscher Prüfraum\n\nDie sichtbaren Inhalte sind vollständig deutsch.\n');
  for (const [relative, content] of Object.entries(files)) write(root, relative, content);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'deutscher ausgangsstand']);
  return root;
}

type GateOptions = { defaults?: boolean; environment?: Record<string, string | null> };

function runGate(root: string, options: GateOptions = {}) {
  const environment: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
  delete environment.UNIVERSAARL_PROJECT_ID;
  delete environment.UNIVERSAARL_EXPECTED_COMMIT;
  if (options.defaults !== false) {
    environment.UNIVERSAARL_PROJECT_ID = 'project-twin';
    environment.UNIVERSAARL_EXPECTED_COMMIT = git(root, ['rev-parse', 'HEAD']);
  }
  for (const [key, value] of Object.entries(options.environment ?? {})) {
    if (value === null) delete environment[key]; else environment[key] = value;
  }
  return spawnSync(process.execPath, [validator], { cwd: root, env: environment, encoding: 'utf8' });
}

function expectRejected(root: string, expectedPath?: string) {
  const result = runGate(root);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Deutschgate');
  if (expectedPath) expect(result.stderr).toContain(expectedPath);
}

function indexFingerprint(root: string) {
  const name = git(root, ['rev-parse', '--git-path', 'index']);
  const file = path.isAbsolute(name) ? name : path.resolve(root, name);
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Maschinenlesbarer deutscher Sprachvertrag', () => {
  it('liefert ausschließlich die sechs festgelegten Felder mit exakter Commitbindung', () => {
    const root = repository();
    const head = git(root, ['rev-parse', 'HEAD']);
    const result = runGate(root, { environment: { UNIVERSAARL_ZUSATZFELD: 'nicht-ausgeben' } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(JSON.stringify({ schemaVersion: 1, status: 'passed', language: 'de', projectId: 'project-twin', commit: head, userVisibleOwnContentGerman: true }));
    expect(Object.keys(JSON.parse(result.stdout))).toEqual(['schemaVersion', 'status', 'language', 'projectId', 'commit', 'userVisibleOwnContentGerman']);
  });

  it('verwendet ohne Bindungsvariablen HEAD und weist jede unvollständige oder falsche Bindung zurück', () => {
    const root = repository();
    const head = git(root, ['rev-parse', 'HEAD']);
    const unbound = runGate(root, { defaults: false });
    expect(unbound.status).toBe(0);
    expect(JSON.parse(unbound.stdout).commit).toBe(head);
    const cases: GateOptions[] = [
      { environment: { UNIVERSAARL_PROJECT_ID: 'anderes-projekt' } },
      { environment: { UNIVERSAARL_PROJECT_ID: 'Project-Twin' } },
      { environment: { UNIVERSAARL_EXPECTED_COMMIT: '0'.repeat(40) } },
      { environment: { UNIVERSAARL_EXPECTED_COMMIT: head.toUpperCase() } },
      { environment: { UNIVERSAARL_EXPECTED_COMMIT: '7' } },
      { defaults: false, environment: { UNIVERSAARL_PROJECT_ID: 'project-twin' } },
      { defaults: false, environment: { UNIVERSAARL_EXPECTED_COMMIT: head } },
    ];
    for (const options of cases) {
      const result = runGate(root, options);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.length).toBeGreaterThan(0);
    }
  });

  it('erlaubt nur eng formgebundene und exakt geschriebene technische Angaben', () => {
    const root = repository({
      'README.md': '# Deutscher Vertrag\n\n`ProjectContext`, `SourceSnapshot`, `GET /api/projects`, `implemented-awaiting-approval`, `UABC-TWIN-001`, `.env.example`, `evidence/`, `C:\\Pfad mit Leerzeichen\\Quelle`, `UNIVERSAARL_EXPECTED_COMMIT=<vollständige-neue-sha>`, `REVIEW.md in HEAD: leer` und `Deutschgate: bestanden` sind eng gebundene technische Angaben. Die Produkte Git, OpenSpec, Jira, Confluence, React, Vite, Node.js sowie Zod bleiben exakt benannt. Das System bleibt geschützt.\n',
      '.env.example': '# Absoluter Pfad zur commitgebundenen Momentaufnahme.\nUABC_SOURCE_REPO=C:\\technisch\\quelle\n',
      'docs/powershell.md': '# Befehlsbeispiel\n\n```powershell\n$hinweis = @"\nDies ist ein deutscher Hinweis mit Leerzeichen.\n"@\nWrite-Output $hinweis\n```\n',
      'openspec/changes/beispiel/proposal.md': '# Änderungsvorschlag\n\n## Status\n\nproposed\n',
      'schema.json': JSON.stringify({ type: 'object', properties: { wert: { description: 'Sicherer deutscher Wert' } } }),
      'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: {} }),
    });
    const result = runGate(root);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('erlaubt etablierte Fachsprache in deutschen Sätzen und sperrt englische Überschriften', () => {
    const accepted = repository({
      'docs/fachsprache.md': '# Sicheres Operations-Dashboard\n\nDer Build läuft stabil im CI-Setup, der Commit bleibt read-only und das Team prüft den Worktree. Workshop, Support, Go-live und Hypercare sind fachlich passende Begriffe.\n',
    });
    expect(runGate(accepted).status).toBe(0);
    const rejected = repository({
      'docs/dashboard.md': '# Project Operations Dashboard\n',
      'docs/aktion.md': '# Open project now\n',
    });
    const result = runGate(rejected);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/dashboard.md');
    expect(result.stderr).toContain('docs/aktion.md');
  });

  it('weist unbekannte kurze Fremdprosa und englische Prosa nach deutschem Vorspann zurück', () => {
    const rawFixturePhrases = [
      'Quick brown fox.',
      'Nimbus frob quux.',
      'Brisk journey.',
      'Die brisk journey.',
      'Hinweis: quick brown fox jumps.',
      'Deutscher Vorspann: unable to load source safely.',
    ];
    const files = Object.fromEntries(rawFixturePhrases.map((value, index) => [`fremdprosa/fall-${index}.md`, `# Prüfraum\n\n${value}\n`]));
    const result = runGate(repository(files));
    expect(result.status).toBe(1);
    for (const index of [0, 2, 4, 5]) expect(result.stderr).toContain(`fremdprosa/fall-${index}.md`);
  });

  it('erfasst Überschriften, Inlinekommentare und sämtliche menschlichen Senken', () => {
    const rawFixtureFiles = {
      'senken/ueberschrift.md': '# Open project now\n',
      'senken/befehl.md': '# Prüfraum\n\n```bash\ngit status # Open project now\n```\n',
      'senken/daten.yaml': 'title: Deutscher Wert # Open project now\n',
      'senken/ausdruck.tsx': 'export const Ansicht = () => <p>{"Open project now"}</p>;',
      'senken/wert.html': '<!doctype html><html lang="de"><body><input value="Open project now"></body></html>',
      'senken/text.ts': 'document.body.textContent = "Open project now";',
      'senken/tief.json': JSON.stringify({ outer: { inner: { detail: 'Open project now' } } }),
      'senken/vitest.test.ts': 'it("prüft den Wert", () => { expect(wert, "Open project now").toBe(true); });',
      'senken/node.test.ts': 'assert.equal(wert, true, "Open project now");',
      'senken/attribut.ts': 'element.setAttribute("aria-label", "Open project now");',
      'senken/nachricht.ts': 'throw new Message("Open project now");',
      'senken/kommentar.ts': 'const wert = 1; // Open project now',
    };
    const result = runGate(repository(rawFixtureFiles));
    expect(result.status).toBe(1);
    for (const relative of Object.keys(rawFixtureFiles)) expect(result.stderr).toContain(relative);
  });

  it('weist eine leere JavaScript-Zuweisung als Syntaxmüll geschlossen zurück', () => {
    expectRejected(repository({ 'src/kaputt.js': 'const x = ;' }), 'src/kaputt.js');
  });

  it('prüft Markdown-Inlinecode formgebunden und schließt fehlerhafte Spannen', () => {
    const rejected = [
      '`Quick brown fox`',
      '`approval granted`',
      '`nicht geschlossener Inlinecode',
    ];
    for (const value of rejected) expectRejected(repository({ 'README.md': `# Prüfraum\n\nDie Angabe ${value} bleibt sichtbar.\n` }));
    const accepted = repository({ 'README.md': '# Prüfraum\n\nDie Angaben `ProjectContext`, `GET /api/projects`, `npm run build` und `implemented-awaiting-approval` sind technisch formgebunden.\n' });
    const acceptedResult = runGate(accepted);
    expect(acceptedResult.stderr).toBe('');
    expect(acceptedResult.status).toBe(0);
  });

  it('parst gültige Codeblöcke nach Sprache und prüft Kommentare sowie Meldungen', () => {
    const rawFixtureBlocks: Array<[string, string]> = [
      ['javascript', '// Open project now\nthrow new Error("Quelle fehlt");'],
      ['tsx', 'export const A = () => <button aria-label="Open project now">Öffnen</button>;'],
      ['typescript', 'throw new Error("Unable to load source safely");'],
      ['bash', 'echo "Open project now"'],
      ['bash', 'cat <<EOF\nOpen project now\nEOF'],
      ['json', '{"nested":{"title":"Open project now"}}'],
      ['yaml', 'nested:\n  description: Open project now'],
    ];
    const files = Object.fromEntries(rawFixtureBlocks.map(([language, body], index) => [`code/fall-${index}.md`, `# Prüfraum\n\n\u0060\u0060\u0060${language}\n${body}\n\u0060\u0060\u0060\n`]));
    const result = runGate(repository(files));
    expect(result.status).toBe(1);
    for (const [index] of rawFixtureBlocks.entries()) expect(result.stderr).toContain(`code/fall-${index}.md`);
  });

  it('weist Syntaxmüll in JavaScript- und Befehlsblöcken geschlossen zurück', () => {
    expectRejected(repository({ 'README.md': '# Prüfraum\n\n```javascript\nexport function kaputt( {\n```\n' }));
    expectRejected(repository({ 'README.md': '# Prüfraum\n\n```bash\necho "nicht geschlossen\n```\n' }));
  });

  it('weist ungültige strukturierte Codeblöcke geschlossen zurück', () => {
    expectRejected(repository({ 'README.md': '# Prüfraum\n\n```json\n{"title":\n```\n' }));
    expectRejected(repository({ 'README.md': '# Prüfraum\n\n```yaml\nnested: [\n```\n' }));
  });

  it('weist unbekannte Sprachen und nicht geschlossene Codeblöcke zurück', () => {
    expectRejected(repository({ 'README.md': '# Prüfraum\n\n```ruby\nputs "Projekt öffnen"\n```\n' }));
    expectRejected(repository({ 'README.md': '# Prüfraum\n\n```javascript\nthrow new Error("Quelle fehlt");\n' }));
  });

  it('prüft JSON und YAML in beliebiger Tiefe über alle narrativen Felder', () => {
    const rawFixtureSentence = ['Open', 'project', 'details', 'now'].join(' ');
    const keys = ['title', 'description', 'label', 'name', 'summary', 'message', 'caption', 'purpose', 'problem', 'rationale'];
    const files: Record<string, string> = {};
    for (const key of keys) {
      files[`daten/${key}.json`] = JSON.stringify({ outer: { inner: { [key]: rawFixtureSentence } } });
      files[`daten/${key}.yaml`] = `outer:\n  inner:\n    ${key}: ${rawFixtureSentence}\n`;
    }
    const result = runGate(repository(files));
    expect(result.status).toBe(1);
    for (const key of keys) {
      expect(result.stderr).toContain(`daten/${key}.json`);
      expect(result.stderr).toContain(`daten/${key}.yaml`);
    }
  });

  it('prüft HTML, SVG, eingebettetes JSON, CSS-Inhalte und Kommentare der Ausschlussdatei', () => {
    const rawFixtureCases: Array<[string, string]> = [
      ['index.html', '<!doctype html><html lang="de"><body>Open project details now</body></html>'],
      ['index.html', '<!doctype html><html lang="de"><body><button aria-label="Open project now">Öffnen</button></body></html>'],
      ['index.html', '<!doctype html><html lang="de"><body><script type="application/json">{"title":"Open project now"}</script></body></html>'],
      ['symbol.svg', '<svg xmlns="http://www.w3.org/2000/svg"><title>Open project now</title></svg>'],
      ['stil.css', '.hinweis::before { content: "Open project now"; }'],
      ['.gitignore', '# Ignore generated project output\ndist/\n'],
    ];
    const files = Object.fromEntries(rawFixtureCases.map(([file, content], index) => [`format/fall-${index}/${file}`, content]));
    const result = runGate(repository(files));
    expect(result.status).toBe(1);
    for (const [index] of rawFixtureCases.entries()) expect(result.stderr).toContain(`format/fall-${index}`);
    expectRejected(repository({ 'index.html': '<html><body><p>Deutscher Text</body></html>' }));
    expectRejected(repository({ 'stil.css': '.a { content: "Hinweis"; ' }));
  });

  it('prüft Testtitel, Prüfaussagen, Quellmeldungen und die Nutzung roher Prüfdaten', () => {
    const rawFixtureSources = [
      'it("loads project data now", () => {});',
      'it("prüft die Ausgabe", () => { expect(anzeige).toBe("Open project now"); });',
      'export function lesen() { throw new Error("Unable to load source safely"); }',
      'export const Ansicht = () => <button aria-label="Open project now">Öffnen</button>;',
      'const rawFixture = "Unable to load source safely"; throw new Error(rawFixture);',
      '// Open project details now\nexport const wert = 1;',
    ];
    const files = Object.fromEntries(rawFixtureSources.map((content, index) => [`tests/fall-${index}.test.tsx`, content]));
    const rejected = runGate(repository(files));
    expect(rejected.status).toBe(1);
    for (const [index] of rawFixtureSources.entries()) expect(rejected.stderr).toContain(`tests/fall-${index}.test.tsx`);
    const allowed = repository({
      'tests/rohwert.test.ts': 'const rawFixture = "Quick brown fox jumps"; it("behandelt rohe synthetische Prüfdaten getrennt", () => { expect(rawFixture.length).toBeGreaterThan(0); });',
      'src/fehler.ts': 'export function lesen() { throw new Error("Die konfigurierte Quelle ist nicht verfügbar."); }',
    });
    expect(runGate(allowed).status).toBe(0);
  });

  it('bindet technische Quell- und Prüfwerte ohne Ausnahme menschlicher Testtitel', () => {
    const accepted = repository({
      'src/adapter.ts': '/// <reference types="node" />\nexport class AdapterSourceError extends Error { constructor() { super("Die Quelle fehlt."); this.name = "AdapterSourceError"; } }',
      'src/narrativ.ts': 'export const wert = {\n  title: "Universaarl-Unternehmens-Blueprint v0.1",\n  status: "archived",\n  phase: "Implement",\n  rationale: "Der Unternehmens-Blueprint muss als commitgebundene Projektquelle vollständig lesbar sein."\n};',
      'src/formgebunden.ts': 'export const beobachtet = { rationale: "Change-ID: anderes Der fachliche Zweck bleibt belegt." };',
      'vite.config.ts': 'export default { name: "uabc-project-scoped-read-only-api" };',
      'tests/technik.test.ts': 'it("blockiert config.worktree-Umlenkungen", () => { expect(route.kind).toBe("root"); expect(css).toContain("background:var(--bg)"); expect(css).toContain("html[data-theme=dark]"); expect(code).toBe("API_NICHT_VERFUEGBAR"); expect(text).not.toContain("Fetch failed"); expect(fs.readFileSync(datei, "utf8")).toBe("zweite Worktree-Fassung"); for (const raw of ["Unable to load source safely"]) expect(raw.length).toBeGreaterThan(0); const mock = vi.fn().mockRejectedValue(new Error("Fetch failed")); expect(mock).toBeDefined(); }); it("unterstützt Jira Sub-task sowie beobachtete Root-Eltern null streng", () => {});',
    });
    const acceptedResult = runGate(accepted);
    expect(acceptedResult.stderr).toBe('');
    expect(acceptedResult.status).toBe(0);
    expectRejected(repository({ 'tests/titel.test.ts': 'it("checks dark state now", () => {});' }), 'tests/titel.test.ts');
  });

  it('prüft unversionierte Nachbardateien ohne Verzeichnis- oder Modusausnahme', () => {
    const root = repository();
    write(root, 'docs/neue-nachbardatei.md', '# Ergänzung\n\nQuick brown fox.\n');
    expectRejected(root, 'docs/neue-nachbardatei.md');

    const linked = repository();
    const blob = git(linked, ['hash-object', '-w', '--stdin'], 'README.md');
    git(linked, ['update-index', '--add', '--cacheinfo', `120000,${blob},verweis.md`]);
    git(linked, ['commit', '-m', 'technischer verweis']);
    write(linked, 'verweis.md', 'README.md');
    expectRejected(linked, 'verweis.md');
  });

  it('validiert Binärsignaturen vor jeder Textdekodierung', () => {
    const invalidPng = repository();
    write(invalidPng, 'bild.png', Buffer.from('kein png', 'utf8'));
    expectRejected(invalidPng, 'bild.png');
    const invalidIco = repository();
    write(invalidIco, 'symbol.ico', Buffer.from([0, 0, 0, 0, 0, 0]));
    expectRejected(invalidIco, 'symbol.ico');
  });

  it('weist übergroße, ungültig kodierte und unbekannte Textformate geschlossen zurück', () => {
    const tooLarge = repository();
    write(tooLarge, 'docs/gross.md', Buffer.alloc(1024 * 1024 + 1, 0x61));
    expectRejected(tooLarge, 'docs/gross.md');
    const invalidUtf8 = repository();
    write(invalidUtf8, 'docs/kodierung.md', Buffer.from([0xc3, 0x28]));
    expectRejected(invalidUtf8, 'docs/kodierung.md');
    expectRejected(repository({ 'unbekannt.xyz': 'Deutscher Inhalt' }), 'unbekannt.xyz');
  });

  it('verändert weder Arbeitsbaumstatus noch Indexfingerabdruck', () => {
    const root = repository();
    write(root, 'docs/deutsche-nachbardatei.md', '# Ergänzung\n\nDiese neue Datei enthält ausschließlich deutsche Prosa.\n');
    const beforeStatus = git(root, ['status', '--porcelain=v1', '-z']);
    const beforeIndex = indexFingerprint(root);
    const result = runGate(root);
    const afterStatus = git(root, ['status', '--porcelain=v1', '-z']);
    const afterIndex = indexFingerprint(root);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(afterStatus).toBe(beforeStatus);
    expect(afterIndex).toBe(beforeIndex);
  });
});
