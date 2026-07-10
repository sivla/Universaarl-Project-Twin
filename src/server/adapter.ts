import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import fg from 'fast-glob';
import YAML from 'yaml';
import matter from 'gray-matter';
import { type Artifact, type HistoryEvent, projectStateSchema, type ProjectState } from '../model';

const safeRoots = ['architecture', 'capabilities', 'openspec', 'atlassian/jira', 'atlassian/confluence', 'evidence'] as const;
const forbidden = /(^|[\\/._-])(auth|storage-?state|trace|video|tenant|token|secret)([\\/._-]|$)/i;
const uabcId = /\bUABC-[A-Z0-9][A-Z0-9-]*\b/g;

type RecordValue = Record<string, any>;
type ReadResult = { artifacts: Artifact[]; history: HistoryEvent[]; warnings: string[]; knownIds: Set<string> };

const empty = (): ReadResult => ({ artifacts: [], history: [], warnings: [], knownIds: new Set() });
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const rel = (repo: string, file: string) => path.relative(repo, file).replaceAll('\\', '/');
const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const parseYaml = (file: string): RecordValue => YAML.parse(fs.readFileSync(file, 'utf8')) as RecordValue;

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
  if (!fs.existsSync(file)) { result.warnings.push('Architecture source is missing: architecture/enterprise-blueprint.yaml'); return result; }
  try {
    const data = parseYaml(file); collectIds(data, result.knownIds);
    const id = String(data.artifactId ?? '');
    if (!id.startsWith('UABC-')) throw new Error('artifactId is missing');
    const approval = data.approval ?? {};
    result.artifacts.push({
      id, kind: 'architecture', title: String(data.title ?? id), status: String(data.lifecycleStatus ?? 'unknown'), phase: 'Strategize', wave: 'W0',
      workstream: 'Projektmanagement', rationale: [approval.scope, approval.exclusions ? `Exclusions: ${approval.exclusions}` : ''].filter(Boolean).join('\n'),
      parentId: null, dependencies: [], documents: [], evidence: strings(approval.evidenceId ? [approval.evidenceId] : data.actualSandboxBaseline?.evidenceIds),
      sourcePath: rel(repo, file),
    });
    for (const decision of data.decisions ?? []) result.artifacts.push({
      id: String(decision.id), kind: 'architecture', title: String(decision.statement), status: String(decision.status ?? 'unknown'), phase: 'Strategize', wave: 'W0',
      workstream: 'Projektmanagement', rationale: `Decision recorded ${String(decision.decidedAt ?? '')}`.trim(), parentId: id,
      dependencies: [], documents: [], evidence: [], sourcePath: rel(repo, file),
    });
  } catch (error) { result.warnings.push(`Could not parse architecture/enterprise-blueprint.yaml: ${error instanceof Error ? error.message : 'unknown error'}`); }
  return result;
}

export async function readCapabilities(repo: string): Promise<ReadResult> {
  const result = empty();
  const file = path.join(repo, 'capabilities', 'catalog.yaml');
  if (!fs.existsSync(file)) { result.warnings.push('Capability source is missing: capabilities/catalog.yaml'); return result; }
  try {
    const data = parseYaml(file); collectIds(data, result.knownIds);
    for (const domain of data.domains ?? []) for (const capability of domain.capabilities ?? []) {
      const wave = String(capability.wave ?? '');
      result.artifacts.push({
        id: String(capability.id), kind: 'capability', title: String(capability.name ?? capability.id), status: String(capability.status ?? 'unknown'),
        phase: waveToPhase(wave), wave, workstream: String(domain.name ?? domain.id ?? 'Unassigned'),
        rationale: String(capability.purpose ?? capability.rationale ?? 'Canonical capability catalog entry.'), parentId: String(domain.id ?? '') || null,
        dependencies: strings(capability.dependencies), documents: strings(capability.confluenceRefs), evidence: strings(capability.evidenceRefs), sourcePath: rel(repo, file),
      });
    }
  } catch (error) { result.warnings.push(`Could not parse capabilities/catalog.yaml: ${error instanceof Error ? error.message : 'unknown error'}`); }
  return result;
}

export async function readJira(repo: string): Promise<ReadResult> {
  const result = empty();
  const files = await fg('atlassian/jira/issues/*.yaml', { cwd: repo, absolute: true, onlyFiles: true });
  if (!files.length) result.warnings.push('No Jira issue exports were found.');
  for (const file of files) try {
    const data = parseYaml(file); collectIds(data, result.knownIds);
    const wave = path.basename(file).includes('environment-baseline') ? 'W1' : 'W0';
    for (const issue of data.issues ?? []) {
      const kind = issue.type === 'Epic' ? 'epic' : issue.type === 'Story' ? 'story' : 'task';
      result.artifacts.push({
        id: String(issue.key), kind, title: String(issue.summary), status: String(issue.status ?? 'unknown'), phase: waveToPhase(wave), wave,
        workstream: jiraWorkstream(issue.components), rationale: strings(issue.acceptanceCriteria).join(' · '), parentId: issue.parent ? String(issue.parent) : null,
        dependencies: strings(issue.dependencies), documents: strings(issue.confluenceRefs), evidence: strings(issue.evidenceRefs), sourcePath: rel(repo, file),
      });
      for (const [index, event] of (issue.history ?? []).entries()) result.history.push({
        id: `${String(issue.key)}-${index + 1}`, artifactId: String(issue.key), at: String(event.at), from: String(event.from), to: String(event.to),
        wave, sourcePath: rel(repo, file),
      });
    }
  } catch (error) { result.warnings.push(`Could not parse ${rel(repo, file)}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  return result;
}

export async function readOpenSpec(repo: string): Promise<ReadResult> {
  const result = empty();
  const files = await fg(['openspec/changes/*/proposal.md', 'openspec/changes/archive/*/proposal.md'], { cwd: repo, absolute: true, onlyFiles: true });
  if (!files.length) result.warnings.push('No OpenSpec change proposals were found.');
  for (const file of files) try {
    const text = fs.readFileSync(file, 'utf8'); for (const id of text.match(uabcId) ?? []) result.knownIds.add(id);
    const relative = rel(repo, file); const rawDir = path.basename(path.dirname(file)); const id = rawDir.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const wave = changeWave(text, relative);
    result.artifacts.push({
      id, kind: 'change', title: text.match(/^#\s+(.+)$/m)?.[1] ?? id,
      status: text.match(/(?:Status|Status):\s*`?([^`\n]+?)(?:`|$)/i)?.[1]?.trim() ?? (relative.includes('/archive/') ? 'archived' : 'active'),
      phase: waveToPhase(wave), wave, workstream: 'Projektmanagement',
      rationale: text.match(/## (?:Problem und Zweck|Problem)\s+([\s\S]*?)(?=\n##)/)?.[1]?.trim() ?? 'OpenSpec change proposal.',
      parentId: null, dependencies: [], documents: [...new Set(text.match(uabcId) ?? [])], evidence: [], sourcePath: relative,
    });
  } catch (error) { result.warnings.push(`Could not parse ${rel(repo, file)}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  return result;
}

export async function readConfluence(repo: string): Promise<ReadResult> {
  const result = empty();
  const files = await fg('atlassian/confluence/pages/*.md', { cwd: repo, absolute: true, onlyFiles: true });
  if (!files.length) result.warnings.push('No Confluence page exports were found.');
  for (const file of files) try {
    const parsed = matter(fs.readFileSync(file, 'utf8')); collectIds(parsed.data, result.knownIds); collectIds(parsed.content, result.knownIds);
    if (!parsed.data.id) throw new Error('frontmatter id is missing');
    const status = String(parsed.data.status ?? 'documented'); const wave = /W1|In Review/i.test(status) ? 'W1' : 'W0';
    result.artifacts.push({
      id: String(parsed.data.id), kind: 'document', title: String(parsed.data.title ?? parsed.data.id), status, phase: waveToPhase(wave), wave,
      workstream: 'Projektmanagement', rationale: parsed.content.replace(/[#\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 420),
      parentId: parsed.data.parent ? String(parsed.data.parent) : null, dependencies: strings(parsed.data.jiraRefs), documents: strings(parsed.data.referenceIds),
      evidence: strings(parsed.data.referenceIds).filter((id) => id.startsWith('UABC-VER-')), sourcePath: rel(repo, file),
    });
  } catch (error) { result.warnings.push(`Could not parse ${rel(repo, file)}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  return result;
}

export async function readEvidence(repo: string): Promise<ReadResult & { images: ProjectState['evidenceImages'] }> {
  const result = { ...empty(), images: [] as ProjectState['evidenceImages'] };
  const registerFile = path.join(repo, 'evidence', 'verification-register.yaml');
  if (!fs.existsSync(registerFile)) result.warnings.push('Evidence verification register is missing.');
  else try {
    const data = parseYaml(registerFile); collectIds(data, result.knownIds);
    for (const verification of data.verifications ?? []) {
      const wave = String(verification.changeRef).includes('playthru-environment') ? 'W1' : 'W0';
      const milestone = ['human-approval', 'automated-policy-gate'].includes(String(verification.type));
      result.artifacts.push({
        id: String(verification.id), kind: milestone ? 'milestone' : 'evidence', title: String(verification.type).replaceAll('-', ' '),
        status: String(verification.status ?? 'unknown'), phase: waveToPhase(wave), wave, workstream: 'Projektmanagement', rationale: String(verification.evidence ?? ''),
        parentId: null, dependencies: strings(verification.subjectRefs), documents: [], evidence: [], sourcePath: rel(repo, registerFile),
      });
    }
  } catch (error) { result.warnings.push(`Could not parse evidence/verification-register.yaml: ${error instanceof Error ? error.message : 'unknown error'}`); }

  const imageFiles = (await fg('evidence/**/*.png', { cwd: repo, onlyFiles: true })).filter((file) => !forbidden.test(file)).sort();
  result.images = imageFiles.map((imagePath) => {
    const run = imagePath.includes('/run-1/') ? 'UABC-VER-ENV-RUN1-001' : 'UABC-VER-ENV-RUN2-001';
    return { id: imagePath, path: imagePath.replaceAll('\\', '/'), title: path.basename(imagePath, '.png').toUpperCase(), evidenceIds: [run, 'UABC-VER-ENV-VISUAL-001'] };
  });
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
  if (unresolved.length) warnings.push(`Unresolved source references: ${unresolved.join(', ')}`);
  const duplicateIds = [...new Set(artifacts.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index))];
  if (duplicateIds.length) warnings.push(`Duplicate normalized artifact IDs: ${duplicateIds.join(', ')}`);

  const history = jira.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const actualUnknowns = (() => { try { return strings(parseYaml(path.join(repo, 'architecture', 'enterprise-blueprint.yaml')).actualSandboxBaseline?.unknowns); } catch { return []; } })();
  const gaps = [
    ...actualUnknowns.map((gap) => `Architecture baseline unknown: ${gap}.`),
    'Project calendar and milestone dates are not normalized by the approved source contract.',
    'Meetings and decision chronology beyond evidenced Jira transitions are not normalized.',
    'Worklogs, rates, invoices and T&M data are intentionally outside the MVP source contract.',
  ];
  const workstreams = [...new Set(artifacts.map((item) => item.workstream))].sort((a, b) => a.localeCompare(b, 'de'));
  const state = {
    source: { branch: git(repo, ['branch', '--show-current']) || '(detached)', commit: git(repo, ['rev-parse', '--short', 'HEAD']), dirty: git(repo, ['status', '--porcelain']).length > 0, readAt: new Date().toISOString(), pathLabel: path.basename(repo) },
    artifacts, history, evidenceImages: evidence.images, workstreams, gaps, warnings,
    stats: {
      jira: jira.artifacts.length, changes: openSpec.artifacts.length, documents: confluence.artifacts.length,
      capabilities: capabilities.artifacts.length, evidence: evidence.images.length, history: history.length,
    },
  };
  return projectStateSchema.parse(state);
}

export function resolveEvidencePath(repo: string, requested: string) {
  if (!requested || forbidden.test(requested) || path.isAbsolute(requested)) return null;
  const normalized = requested.replaceAll('\\', '/');
  if (!normalized.startsWith('evidence/') || !/\.png$/i.test(normalized)) return null;
  const candidate = path.resolve(repo, normalized);
  const root = path.resolve(repo, 'evidence');
  if (!candidate.startsWith(`${root}${path.sep}`) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  try {
    const realRoot = fs.realpathSync(root); const realCandidate = fs.realpathSync(candidate);
    return realCandidate.startsWith(`${realRoot}${path.sep}`) ? realCandidate : null;
  } catch { return null; }
}

export const adapterPolicy = { safeRoots, forbidden };
