import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import fg from 'fast-glob';
import YAML from 'yaml';
import matter from 'gray-matter';
import { createHash } from 'node:crypto';
import { type Artifact, projectStateSchema, type ProjectState } from '../model';

const safeRoots = ['architecture', 'capabilities', 'openspec', 'atlassian/jira', 'atlassian/confluence', 'evidence'] as const;
const forbidden = /(^|[\\/._-])(auth|storage-?state|trace|video|tenant|token|secret)([\\/._-]|$)/i;
const uabcId = /\bUABC-[A-Z0-9][A-Z0-9-]*\b/g;

type RecordValue = Record<string, any>;
type ReadResult = { artifacts: Artifact[]; warnings: string[]; knownIds: Set<string> };

const empty = (): ReadResult => ({ artifacts: [], warnings: [], knownIds: new Set() });
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const rel = (repo: string, file: string) => path.relative(repo, file).replaceAll('\\', '/');
const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const parseYaml = (file: string): RecordValue => YAML.parse(fs.readFileSync(file, 'utf8')) as RecordValue;

export function validateProvenancePath(value: string) {
  if (!value || path.isAbsolute(value) || /^[A-Za-z]:|^\\\\|^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || forbidden.test(segment))) return false;
  return safeRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function safeRel(repo: string, file: string) {
  const relative = rel(repo, file);
  if (!validateProvenancePath(relative)) throw new Error('Unsichere Provenienz');
  return relative;
}

const evidenceIdFor = (relative: string) => `ev_${createHash('sha256').update(relative).digest('hex').slice(0, 24)}`;

function registeredEvidenceFiles(repo: string) {
  const root = path.resolve(repo, 'evidence');
  let realRoot: string;
  try { realRoot = fs.realpathSync(root); } catch { return [] as Array<{ id: string; file: string }> ; }
  return fg.sync('evidence/**/*.png', { cwd: repo, onlyFiles: true }).sort().flatMap((relative) => {
    if (forbidden.test(relative) || !validateProvenancePath(relative)) return [];
    const candidate = path.resolve(repo, relative);
    try {
      const stat = fs.lstatSync(candidate); const real = fs.realpathSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 15 * 1024 * 1024 || !real.startsWith(`${realRoot}${path.sep}`)) return [];
      return [{ id: evidenceIdFor(relative.replaceAll('\\', '/')), file: real }];
    } catch { return []; }
  });
}

function waveToPhase(wave: string) {
  if (wave === 'W0') return 'Strategize' as const;
  if (wave === 'W1') return 'Initiate' as const;
  if (wave === 'W2' || wave === 'W3') return 'Implement' as const;
  if (wave === 'W4') return 'Prepare' as const;
  return 'Operate' as const;
}

function collectIds(value: unknown, target: Set<string>) {
  if (typeof value === 'string') for (const id of value.match(uabcId) ?? []) target.add(id);
  else if (Array.isArray(value)) value.forEach((item) => collectIds(item, target));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectIds(item, target));
}

function jiraWorkstream(components: unknown) {
  const names = strings(components);
  const preferred = names.find((name) => name !== 'Projektmanagement');
  return preferred ?? names[0] ?? 'Projektmanagement';
}

function changeWave(text: string, sourcePath: string) {
  const explicit = text.match(/(?:Welle|Wave):?\s*`?(W[0-5])/i)?.[1]?.toUpperCase();
  if (explicit) return explicit;
  return sourcePath.includes('/archive/') ? 'W0' : 'W1';
}

export async function readArchitecture(repo: string): Promise<ReadResult> {
  const result = empty();
  const file = path.join(repo, 'architecture', 'enterprise-blueprint.yaml');
  if (!fs.existsSync(file)) { result.warnings.push('Architekturquelle fehlt: architecture/enterprise-blueprint.yaml'); return result; }
  try {
    const data = parseYaml(file); collectIds(data, result.knownIds);
    const id = String(data.artifactId ?? '');
    if (!id.startsWith('UABC-')) throw new Error('artifactId is missing');
    const approval = data.approval ?? {};
    result.artifacts.push({
      id, kind: 'architecture', title: String(data.title ?? id), status: String(data.lifecycleStatus ?? 'unbekannt'), phase: 'Strategize', wave: 'W0',
      workstream: 'Projektmanagement', rationale: [approval.scope, approval.exclusions ? `Ausnahmen: ${approval.exclusions}` : ''].filter(Boolean).join('\n'),
      parentId: null, dependencies: [], documents: [], evidence: strings(approval.evidenceId ? [approval.evidenceId] : data.actualSandboxBaseline?.evidenceIds),
      sourcePath: safeRel(repo, file),
    });
    for (const decision of data.decisions ?? []) result.artifacts.push({
      id: String(decision.id), kind: 'architecture', title: String(decision.statement), status: String(decision.status ?? 'unbekannt'), phase: 'Strategize', wave: 'W0',
      workstream: 'Projektmanagement', rationale: `Entscheidung dokumentiert ${String(decision.decidedAt ?? '')}`.trim(), parentId: id,
      dependencies: [], documents: [], evidence: [], sourcePath: safeRel(repo, file),
    });
  } catch { result.warnings.push('Architekturquelle konnte nicht gelesen werden: architecture/enterprise-blueprint.yaml'); }
  return result;
}

export async function readCapabilities(repo: string): Promise<ReadResult> {
  const result = empty();
  const file = path.join(repo, 'capabilities', 'catalog.yaml');
  if (!fs.existsSync(file)) { result.warnings.push('Fähigkeitsquelle fehlt: capabilities/catalog.yaml'); return result; }
  try {
    const data = parseYaml(file); collectIds(data, result.knownIds);
    for (const domain of data.domains ?? []) for (const capability of domain.capabilities ?? []) {
      const wave = String(capability.wave ?? '');
      result.artifacts.push({
        id: String(capability.id), kind: 'capability', title: String(capability.name ?? capability.id), status: String(capability.status ?? 'unbekannt'),
        phase: waveToPhase(wave), wave, workstream: String(domain.name ?? domain.id ?? 'Nicht zugeordnet'),
        rationale: String(capability.purpose ?? capability.rationale ?? 'Kanonischer Eintrag im Fähigkeitskatalog.'), parentId: String(domain.id ?? '') || null,
        dependencies: strings(capability.dependencies), documents: strings(capability.confluenceRefs), evidence: strings(capability.evidenceRefs), sourcePath: safeRel(repo, file),
      });
    }
  } catch { result.warnings.push('Fähigkeitsquelle konnte nicht gelesen werden: capabilities/catalog.yaml'); }
  return result;
}

export async function readJira(repo: string): Promise<ReadResult> {
  const result = empty();
  const files = await fg('atlassian/jira/issues/*.yaml', { cwd: repo, absolute: true, onlyFiles: true });
  if (!files.length) result.warnings.push('Keine Jira-Vorgangsexporte gefunden.');
  for (const file of files) try {
    const data = parseYaml(file); collectIds(data, result.knownIds);
    const wave = path.basename(file).includes('environment-baseline') ? 'W1' : 'W0';
    for (const issue of data.issues ?? []) {
      const kind = issue.type === 'Epic' ? 'epic' : issue.type === 'Story' ? 'story' : 'task';
      result.artifacts.push({
        id: String(issue.key), kind, title: String(issue.summary), status: String(issue.status ?? 'unbekannt'), phase: waveToPhase(wave), wave,
        workstream: jiraWorkstream(issue.components), rationale: strings(issue.acceptanceCriteria).join(' · '), parentId: issue.parent ? String(issue.parent) : null,
        dependencies: strings(issue.dependencies), documents: strings(issue.confluenceRefs), evidence: strings(issue.evidenceRefs), sourcePath: safeRel(repo, file),
      });
    }
  } catch { result.warnings.push(`Jira-Quelle konnte nicht gelesen werden: ${rel(repo, file)}`); }
  return result;
}

export async function readOpenSpec(repo: string): Promise<ReadResult> {
  const result = empty();
  const files = await fg(['openspec/changes/*/proposal.md', 'openspec/changes/archive/*/proposal.md'], { cwd: repo, absolute: true, onlyFiles: true });
  if (!files.length) result.warnings.push('Keine OpenSpec-Änderungsvorschläge gefunden.');
  for (const file of files) try {
    const text = fs.readFileSync(file, 'utf8'); for (const id of text.match(uabcId) ?? []) result.knownIds.add(id);
    const relative = rel(repo, file); const rawDir = path.basename(path.dirname(file)); const id = rawDir.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const wave = changeWave(text, relative);
    result.artifacts.push({
      id, kind: 'change', title: text.match(/^#\s+(.+)$/m)?.[1] ?? id,
      status: text.match(/(?:Status|Status):\s*`?([^`\n]+?)(?:`|$)/i)?.[1]?.trim() ?? (relative.includes('/archive/') ? 'archived' : 'active'),
      phase: waveToPhase(wave), wave, workstream: 'Projektmanagement',
      rationale: text.match(/## (?:Problem und Zweck|Problem)\s+([\s\S]*?)(?=\n##)/)?.[1]?.trim() ?? 'OpenSpec-Änderungsvorschlag.',
      parentId: null, dependencies: [], documents: [...new Set(text.match(uabcId) ?? [])], evidence: [], sourcePath: validateProvenancePath(relative) ? relative : (() => { throw new Error('Unsichere Provenienz'); })(),
    });
  } catch { result.warnings.push(`OpenSpec-Quelle konnte nicht gelesen werden: ${rel(repo, file)}`); }
  return result;
}

export async function readConfluence(repo: string): Promise<ReadResult> {
  const result = empty();
  const files = await fg('atlassian/confluence/pages/*.md', { cwd: repo, absolute: true, onlyFiles: true });
  if (!files.length) result.warnings.push('Keine Confluence-Seitenexporte gefunden.');
  for (const file of files) try {
    const parsed = matter(fs.readFileSync(file, 'utf8')); collectIds(parsed.data, result.knownIds); collectIds(parsed.content, result.knownIds);
    if (!parsed.data.id) throw new Error('frontmatter id is missing');
    const status = String(parsed.data.status ?? 'documented'); const wave = /W1|In Review/i.test(status) ? 'W1' : 'W0';
    result.artifacts.push({
      id: String(parsed.data.id), kind: 'document', title: String(parsed.data.title ?? parsed.data.id), status, phase: waveToPhase(wave), wave,
      workstream: 'Projektmanagement', rationale: parsed.content.replace(/[#\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 420),
      parentId: parsed.data.parent ? String(parsed.data.parent) : null, dependencies: strings(parsed.data.jiraRefs), documents: strings(parsed.data.referenceIds),
      evidence: strings(parsed.data.referenceIds).filter((id) => id.startsWith('UABC-VER-')), sourcePath: safeRel(repo, file),
    });
  } catch { result.warnings.push(`Confluence-Quelle konnte nicht gelesen werden: ${rel(repo, file)}`); }
  return result;
}

export async function readEvidence(repo: string): Promise<ReadResult & { items: ProjectState['evidenceItems'] }> {
  const result = { ...empty(), items: [] as ProjectState['evidenceItems'] };
  const registerFile = path.join(repo, 'evidence', 'verification-register.yaml');
  if (!fs.existsSync(registerFile)) result.warnings.push('Verification-Register für Nachweise fehlt.');
  else try {
    const data = parseYaml(registerFile); collectIds(data, result.knownIds);
    for (const verification of data.verifications ?? []) {
      const wave = String(verification.changeRef).includes('playthru-environment') ? 'W1' : 'W0';
      result.artifacts.push({
        id: String(verification.id), kind: 'evidence', title: String(verification.type).replaceAll('-', ' '),
        status: String(verification.status ?? 'unbekannt'), phase: waveToPhase(wave), wave, workstream: 'Projektmanagement', rationale: String(verification.evidence ?? ''),
        parentId: null, dependencies: strings(verification.subjectRefs), documents: [], evidence: [], sourcePath: safeRel(repo, registerFile),
      });
    }
  } catch { result.warnings.push('Verification-Register konnte nicht gelesen werden: evidence/verification-register.yaml'); }

  result.items = registeredEvidenceFiles(repo).map((entry, index) => ({ id: entry.id, title: `Bildnachweis ${String(index + 1).padStart(2, '0')}` }));
  return result;
}

async function collectKnownIds(repo: string) {
  const ids = new Set<string>();
  const files = await fg(safeRoots.map((root) => `${root}/**/*.{yaml,yml,md,json}`), { cwd: repo, absolute: true, onlyFiles: true, ignore: ['**/events.jsonl', '**/*trace*', '**/*video*', '**/*auth*', '**/*tenant*', '**/*token*', '**/*secret*'] });
  for (const file of files) if (!forbidden.test(rel(repo, file))) {
    const text = fs.readFileSync(file, 'utf8');
    const declarations = [
      ...text.matchAll(/^\s*(?:-\s*)?(?:id|artifactId|key):\s*(UABC-[A-Z0-9][A-Z0-9-]*)/gm),
      ...text.matchAll(/(?:[{,]\s*)(?:id|artifactId|key):\s*(UABC-[A-Z0-9][A-Z0-9-]*)/gm),
      ...text.matchAll(/^#{2,6}\s+(?:Requirement|Scenario):\s*(UABC-[A-Z0-9][A-Z0-9-]*)/gm),
    ];
    declarations.forEach((match) => ids.add(match[1]));
  }
  return ids;
}

export async function createTwinState(repo: string): Promise<ProjectState> {
  if (!repo || !path.isAbsolute(repo)) throw new Error('UABC_SOURCE_REPO must be configured as an absolute path');
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) throw new Error('UABC_SOURCE_REPO does not exist or is not a directory');
  try { if (git(repo, ['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error(); } catch { throw new Error('UABC_SOURCE_REPO is not a Git worktree'); }

  const [architecture, capabilities, jira, openSpec, confluence, evidence, knownSourceIds] = await Promise.all([
    readArchitecture(repo), readCapabilities(repo), readJira(repo), readOpenSpec(repo), readConfluence(repo), readEvidence(repo), collectKnownIds(repo),
  ]);
  const results = [architecture, capabilities, jira, openSpec, confluence, evidence];
  const artifacts = results.flatMap((item) => item.artifacts);
  const warnings = results.flatMap((item) => item.warnings);
  const referenced = artifacts.flatMap((artifact) => [...artifact.dependencies, ...artifact.documents, ...artifact.evidence]).filter((id) => id.startsWith('UABC-'));
  const unresolved = [...new Set(referenced.filter((id) => !knownSourceIds.has(id)))];
  if (unresolved.length) warnings.push(`Nicht aufgelöste Quellreferenzen: ${unresolved.join(', ')}`);
  const duplicateIds = [...new Set(artifacts.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index))];
  if (duplicateIds.length) warnings.push(`Doppelte normalisierte Artefakt-IDs: ${duplicateIds.join(', ')}`);

  const actualUnknowns = (() => { try { return strings(parseYaml(path.join(repo, 'architecture', 'enterprise-blueprint.yaml')).actualSandboxBaseline?.unknowns); } catch { return []; } })();
  const gaps = [
    ...actualUnknowns.map((gap) => `Architektur-Baseline unbekannt: ${gap}.`),
    'Projektkalender und Meilensteintermine sind im freigegebenen Quellenvertrag nicht normalisiert.',
    'Meetings und Entscheidungsverläufe außerhalb belegter Jira-Übergänge sind nicht normalisiert.',
    'Arbeitsprotokolle, Verrechnungssätze, Rechnungen und T&M-Daten liegen bewusst außerhalb des MVP-Quellenvertrags.',
  ];
  const workstreams = [...new Set(artifacts.map((item) => item.workstream))].sort((a, b) => a.localeCompare(b, 'de'));
  const state = {
    source: { branch: git(repo, ['branch', '--show-current']) || '(abgelöst)', commit: git(repo, ['rev-parse', 'HEAD']), dirty: git(repo, ['status', '--porcelain']).length > 0, readAt: new Date().toISOString() },
    artifacts, evidenceItems: evidence.items, workstreams, gaps, warnings,
    stats: {
      jira: jira.artifacts.length, changes: openSpec.artifacts.length, documents: confluence.artifacts.length,
      capabilities: capabilities.artifacts.length, evidence: evidence.artifacts.length,
    },
  };
  return projectStateSchema.parse(state);
}

export function resolveEvidenceId(repo: string, evidenceId: string) {
  if (!/^ev_[a-f0-9]{24}$/.test(evidenceId)) return null;
  return registeredEvidenceFiles(repo).find((entry) => entry.id === evidenceId)?.file ?? null;
}

export const adapterPolicy = { safeRoots, forbidden };
