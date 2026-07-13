/// <reference types="node" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { z } from 'zod';
import Ajv2020 from 'ajv/dist/2020.js';
import { artifactSchema, displayStatus, displayVerificationType, type Artifact, presentationContractSchema, presentationInitialStateSchema, type PresentationContract, projectDocumentSchema, projectResourceSchema, projectStateSchema, resourceArtifactTypeSchema, resourcePreviewModeSchema, setupWaveProjectionSchema, sourceBillingStatusSchema, sourceBillingWeekSchema, sourceDateSchema, sourceDateTimeSchema, sourceEffortSchema, sourceHistoryEventSchema, storyProjectionSchema, type ProjectDocument, type ProjectResource, type ProjectState, type SetupWaveProjection } from '../model';
import type { ProjectSourceBinding, ProjectSourceContract } from '../projects/registry';

const safeRoots = ['architecture', 'capabilities', 'openspec', 'atlassian/jira', 'atlassian/confluence', 'evidence'] as const;
const exactSafePaths = ['governance/reference-lifecycle.yaml', 'governance/schemas/project-snapshot-manifest.schema.json', 'exports/project-data/v1/index.yaml', 'exports/project-data/v1/snapshot-manifest.json'] as const;
const fullSha = /^[a-f0-9]{40}$/;
const blobSha = /^[a-f0-9]{40}$/;
const sourceBranchName = z.string().min(1).max(200).refine((value) => !value.startsWith('/') && !value.endsWith('/') && !value.includes('..') && !value.includes('//') && !value.includes('@{') && !/[~^:?*[\]\\\s]/.test(value));
const projectIdPattern = /^[a-z][a-z0-9-]{1,47}$/;
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const gitNullDevice = process.platform === 'win32' ? 'NUL' : os.devNull;
const snapshotSchemaId = 'urn:universaarl:schema:project-snapshot-manifest:v1';
const forbidden = /(^|[\/._-])(auth|authentication|authorization|storage-?state|trace|traces|video|videos|credential|credentials|cookie|cookies|session|sessions|tenant|token|tokens|secret|secrets|password|passwords|passwd|oauth2?|bearer|jwt|ssh|keystore|connection-?string|service-?account)([\/._-]|$)/i;
const sensitiveIdentifier = /(?:^|[^0-9a-f])(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?=$|[^0-9a-f])/i;

type RecordValue = Record<string, unknown>;
type TreeEntry = { mode: '100644' | '100755'; oid: string; path: string; size: number };
type ArtifactInput = z.input<typeof artifactSchema>;
type ReadResult = { artifacts: ArtifactInput[]; warnings: string[]; knownIds: Set<string>; actualUnknowns?: string[] };
type EvidenceResult = ReadResult & { items: ProjectState['evidenceItems'] };
type SourceFingerprint = {
  branch: string;
  commit: string;
  dirty: boolean;
  headFingerprint: string;
  indexFingerprint: string;
  statusFingerprint: string;
  repositoryFingerprint: string;
};

type ReaderLimits = {
  maxFiles: number;
  maxTotalBytes: number;
  maxTextBytes: number;
  maxFrontmatterBytes: number;
  maxPngBytes: number;
  maxPngWidth: number;
  maxPngHeight: number;
  maxPngPixels: number;
  maxArrayItems: number;
};

export type AdapterReadOptions = {
  /** Nur fuer deterministische Sicherheitsregressionen; produktive Aufrufer lassen diese Option leer. */
  testHookAfterRead?: () => void;
  /** Testwerte koennen die produktiven Grenzen ausschliesslich verschaerfen. */
  limits?: Partial<ReaderLimits>;
  /** Technische, serverseitige Bindung an einen expliziten schreibgeschuetzten Projektvertrag. */
  projectDataContract?: ProjectSourceContract;
  sourceBinding?: ProjectSourceBinding;
};

export type EvidenceBlob = { contentType: 'image/png'; bytes: Buffer };
export type ResourceBlob = { contentType: ProjectResource['mediaType']; bytes: Buffer; fileName: string; disposition: 'inline' | 'attachment' };

const defaultLimits: ReaderLimits = {
  maxFiles: 5_000,
  maxTotalBytes: 64 * 1024 * 1024,
  maxTextBytes: 2 * 1024 * 1024,
  maxFrontmatterBytes: 256 * 1024,
  maxPngBytes: 15 * 1024 * 1024,
  maxPngWidth: 10_000,
  maxPngHeight: 10_000,
  maxPngPixels: 40_000_000,
  maxArrayItems: 10_000,
};

const empty = (): ReadResult => ({ artifacts: [], warnings: [], knownIds: new Set() });
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export const adapterErrorCodes = ['QUELLKONFIGURATION_UNGUELTIG', 'QUELLVERTRAG_UNGUELTIG', 'GIT_QUELLE_NICHT_VERFUEGBAR', 'QUELLE_WAEHREND_LESEN_GEAENDERT'] as const;
export type AdapterErrorCode = typeof adapterErrorCodes[number];

export class AdapterSourceError extends Error {
  constructor(readonly code: AdapterErrorCode, message: string) { super(message); this.name = 'AdapterSourceError'; }
}

function sourceError(message: string, code: AdapterErrorCode = 'QUELLVERTRAG_UNGUELTIG'): never {
  throw new AdapterSourceError(code, message);
}

function assertProjectId(projectId: string) {
  if (!projectIdPattern.test(projectId) || ['constructor', 'prototype', '__proto__'].includes(projectId)) sourceError('Die Projektkennung ist nicht gültig.', 'QUELLKONFIGURATION_UNGUELTIG');
  return projectId;
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'LANG', 'LC_ALL']);
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (allowed.has(key.toUpperCase()) && value !== undefined) environment[key] = value;
  environment.GIT_OPTIONAL_LOCKS = '0';
  environment.GIT_TERMINAL_PROMPT = '0';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = gitNullDevice;
  environment.GIT_PAGER = 'cat';
  environment.GIT_LITERAL_PATHSPECS = '1';
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  return environment;
}

function gitBuffer(repo: string, args: string[], input?: Buffer, maxBuffer = 16 * 1024 * 1024) {
  try {
    return execFileSync('git', [
      '-C', repo,
      '--no-pager',
      '--no-optional-locks',
      '-c', `safe.directory=${path.resolve(repo)}`,
      '-c', 'core.bare=false',
      '-c', `core.hooksPath=${gitNullDevice}`,
      '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false',
      '-c', 'core.ignoreStat=false',
      '-c', 'core.trustctime=true',
      '-c', 'core.checkStat=default',
      '-c', 'status.aheadBehind=false',
      '-c', 'credential.helper=',
      ...args,
    ], {
      encoding: null,
      input,
      maxBuffer,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanGitEnvironment(),
    });
  } catch {
    return sourceError('Die Git-Quelle konnte nicht sicher gelesen werden.', 'GIT_QUELLE_NICHT_VERFUEGBAR');
  }
}

function gitText(repo: string, args: string[]) {
  return gitBuffer(repo, args).toString('utf8').trim();
}

function tightenLimits(overrides: Partial<ReaderLimits> | undefined): ReaderLimits {
  const result = { ...defaultLimits };
  for (const key of Object.keys(defaultLimits) as Array<keyof ReaderLimits>) {
    const value = overrides?.[key];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 1) sourceError('Die Lesebegrenzung ist ungueltig.');
      result[key] = Math.min(result[key], value);
    }
  }
  return result;
}

function captureFingerprint(repo: string): SourceFingerprint {
  const repositoryFingerprint = captureRepositoryIdentity(repo);
  const commit = gitText(repo, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!fullSha.test(commit)) sourceError('Die Quelle besitzt keinen eindeutigen vollstaendigen Commit.');
  const branch = gitText(repo, ['branch', '--show-current']) || '(abgeloest)';
  const status = gitBuffer(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const symbolicHead = gitBuffer(repo, ['rev-parse', '--symbolic-full-name', 'HEAD']);
  const indexName = gitText(repo, ['rev-parse', '--git-path', 'index']);
  const indexPath = path.isAbsolute(indexName) ? indexName : path.resolve(repo, indexName);
  let index: Buffer;
  try {
    const gitDirectory = fs.realpathSync(gitText(repo, ['rev-parse', '--absolute-git-dir']));
    const indexStat = fs.lstatSync(indexPath);
    const realIndex = fs.realpathSync(indexPath);
    const indexRelative = path.relative(gitDirectory, realIndex);
    if (indexStat.isSymbolicLink() || !indexStat.isFile() || !indexRelative || indexRelative === '..' || indexRelative.startsWith(`..${path.sep}`) || path.isAbsolute(indexRelative)) throw new Error();
    index = fs.readFileSync(realIndex);
  }
  catch { return sourceError('Der Git-Index konnte nicht sicher gelesen werden.'); }
  return {
    branch,
    commit,
    dirty: status.length > 0,
    headFingerprint: hash(Buffer.concat([Buffer.from(commit), Buffer.from([0]), symbolicHead])),
    indexFingerprint: hash(index),
    statusFingerprint: hash(status),
    repositoryFingerprint,
  };
}

function sameFingerprint(before: SourceFingerprint, after: SourceFingerprint) {
  return before.commit === after.commit
    && before.branch === after.branch
    && before.dirty === after.dirty
    && before.headFingerprint === after.headFingerprint
    && before.indexFingerprint === after.indexFingerprint
    && before.statusFingerprint === after.statusFingerprint
    && before.repositoryFingerprint === after.repositoryFingerprint;
}

function captureBoundFingerprint(repo: string, binding: ProjectSourceBinding): SourceFingerprint {
  const branchCommitMode = process.env.UABC_BRANCH_COMMIT_CONTRACT === '1';
  const checkout = branchCommitMode ? null : captureFingerprint(repo);
  const repositoryFingerprint = captureRepositoryIdentity(repo);
  const branchRef = `refs/heads/${binding.expectedBranch}`;
  const commit = binding.branchTipRequired ? gitText(repo, ['rev-parse', '--verify', `${branchRef}^{commit}`]) : gitText(repo, ['rev-parse', '--verify', `${binding.expectedCommit}^{commit}`]);
  if (!fullSha.test(commit) || commit !== binding.expectedCommit) sourceError('Der konfigurierte Freigabebranch hat sich vor oder während des commitgebundenen Lesens verändert.', 'QUELLE_WAEHREND_LESEN_GEAENDERT');
  const tree = gitText(repo, ['rev-parse', '--verify', `${commit}^{tree}`]);
  if (!fullSha.test(tree)) sourceError('Der gepinnte Quellen-Tree ist nicht eindeutig.');
  return {
    branch: binding.expectedBranch,
    commit,
    dirty: checkout?.dirty ?? false,
    headFingerprint: hash(`${branchRef}\0${commit}`),
    indexFingerprint: checkout?.indexFingerprint ?? hash(`${commit}\0commitgebundener-index-wird-nicht-gelesen`),
    statusFingerprint: checkout?.statusFingerprint ?? hash(`${commit}\0commitgebundener-arbeitsbaum-wird-nicht-gelesen`),
    repositoryFingerprint,
  };
}

function captureSourceFingerprint(repo: string, binding: ProjectSourceBinding | undefined) {
  return binding ? captureBoundFingerprint(repo, binding) : captureFingerprint(repo);
}

const fixtureTicketTypePresentation = {
  phase: { typeLabel: 'Phase', displayIconKey: 'phase-flag', displayColorToken: 'slate' },
  epic: { typeLabel: 'Epic', displayIconKey: 'epic-layers', displayColorToken: 'violet' },
  story: { typeLabel: 'Story', displayIconKey: 'story-bookmark', displayColorToken: 'violet' },
  bug: { typeLabel: 'Fehler', displayIconKey: 'bug-mark', displayColorToken: 'red' },
  task: { typeLabel: 'Aufgabe', displayIconKey: 'task-check', displayColorToken: 'blue' },
} as const;

const producerTicketTypePresentation = {
  phase: { typeLabel: 'Phase', displayIconKey: 'jira-phase', displayColorToken: 'teal' },
  epic: { typeLabel: 'Epic', displayIconKey: 'jira-epic', displayColorToken: 'purple' },
  story: { typeLabel: 'Story', displayIconKey: 'jira-story', displayColorToken: 'green' },
  bug: { typeLabel: 'Fehler', displayIconKey: 'jira-bug', displayColorToken: 'red' },
  task: { typeLabel: 'Aufgabe', displayIconKey: 'jira-task', displayColorToken: 'blue' },
} as const;

const ticketTypePresentationProfiles = [fixtureTicketTypePresentation, producerTicketTypePresentation] as const;

export function validatePresentationContract(input: unknown, context: { ticketTypes?: ReadonlyMap<string, string>; ticketStatuses?: ReadonlyMap<string, string>; documentIds?: ReadonlySet<string>; ticketWorklogs?: ReadonlyMap<string, { hours: number; amountEur: number }>; billingTotal?: { hours: number; amountEur: number } } = {}): PresentationContract {
  const parsed = presentationContractSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.map(String).join('.') || 'Wurzel';
    sourceError(`Die producerdefinierte Präsentationsstruktur ist im Feld ${field} ungültig.`);
  }
  const contract = parsed.data;
  const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
  if (!unique(contract.spaces.map((space) => space.id)) || !unique(contract.spaces.map((space) => space.order))) sourceError('Die Wissensräume besitzen doppelte Kennungen oder Reihenfolgen.');
  const requiredTypes = ['phase', 'epic', 'story', 'task'] as const;
  const activeProfile = ticketTypePresentationProfiles.find((profile) => contract.jira.ticketTypes.every(({ type }) => {
    const item = contract.jira.ticketTypes.find((entry) => entry.type === type);
    return item && type in profile && JSON.stringify(profile[type as keyof typeof profile]) === JSON.stringify({ typeLabel: item.typeLabel, displayIconKey: item.displayIconKey, displayColorToken: item.displayColorToken });
  }));
  if (!activeProfile || !unique(contract.jira.ticketTypes.map((item) => item.type)) || requiredTypes.some((type) => !contract.jira.ticketTypes.some((item) => item.type === type))) sourceError('Die Tickettypdarstellung verletzt die geschlossene Allowlist.');
  const ticketIds = contract.jira.tickets.map((ticket) => ticket.ticketId);
  if (contract.jira.canonicalTicketCount !== ticketIds.length || !unique(ticketIds)) sourceError('Die kanonische Ticketmenge besitzt widersprüchliche Zähler oder Kennungen.');
  const ticketsById = new Map(contract.jira.tickets.map((ticket) => [ticket.ticketId, ticket]));
  for (const ticket of contract.jira.tickets) {
    const expected = activeProfile[ticket.type];
    if (ticket.typeLabel !== expected.typeLabel || ticket.displayIconKey !== expected.displayIconKey || ticket.displayColorToken !== expected.displayColorToken || (ticket.parentId && !ticketsById.has(ticket.parentId))) sourceError('Ein Ticket besitzt eine ungültige Typdarstellung oder Elternreferenz.');
    if (context.ticketTypes && context.ticketTypes.get(ticket.ticketId) !== ticket.type) sourceError('Die Präsentationsstruktur widerspricht dem kanonischen Story-Tickettyp.');
  }
  const assertAcyclic = (ids: readonly string[], parentOf: (id: string) => string | null | undefined, message: string) => {
    for (const id of ids) { const seen = new Set<string>([id]); let current = parentOf(id); while (current) { if (seen.has(current)) sourceError(message); seen.add(current); current = parentOf(current); } }
  };
  assertAcyclic(ticketIds, (id) => ticketsById.get(id)?.parentId, 'Die Tickethierarchie enthält einen Zyklus.');
  const childrenByParent = new Map<string, PresentationContract['jira']['tickets']>();
  for (const ticket of contract.jira.tickets) if (ticket.parentId) childrenByParent.set(ticket.parentId, [...(childrenByParent.get(ticket.parentId) ?? []), ticket]);
  const coreTypes = new Set(['phase', 'epic', 'story', 'bug', 'task']);
  if (contract.jira.tickets.some((ticket) => !coreTypes.has(ticket.type))) sourceError('Die abrechenbare Projekthierarchie enthält einen nicht freigegebenen Issue-Typ.');
  const phaseTickets = contract.jira.tickets.filter((ticket) => ticket.type === 'phase');
  const phaseTicketIds = contract.jira.tickets.slice(0, 3).map((ticket) => ticket.ticketId);
  if (phaseTickets.length !== 3 || contract.jira.tickets.slice(0, 3).some((ticket) => ticket.type !== 'phase') || contract.jira.tickets.slice(3).some((ticket) => ticket.type === 'phase')) sourceError('Die ersten drei kanonischen Tickets sind nicht eindeutig die producerdefinierten Phasen.' );
  for (const ticket of contract.jira.tickets) {
    const parent = ticket.parentId ? ticketsById.get(ticket.parentId) : undefined;
    const children = childrenByParent.get(ticket.ticketId) ?? [];
    if (ticket.type === 'phase') {
      if (ticket.parentId || ticket.phaseId !== ticket.ticketId || ticket.phaseRefs.length !== 1 || ticket.phaseRefs[0] !== ticket.ticketId || ticket.billingSource !== 'task-rollup-only' || ticket.billable) sourceError('Ein Phase-Ticket verletzt die Wurzel-, Phasen- oder Abrechnungsgrenze.');
    } else if (ticket.type === 'epic') {
      if (!parent || parent.type !== 'phase' || ticket.phaseId !== parent.ticketId || ticket.phaseRefs.length !== 1 || ticket.phaseRefs[0] !== parent.ticketId || ticket.billingSource !== 'task-rollup-only' || ticket.billable || !children.length || children.some((child) => child.type !== 'story' && child.type !== 'bug')) sourceError('Ein fachlicher Epic besitzt keine eindeutige Phase oder keinen fachlichen Story-/Fehlerinhalt.');
    } else if (ticket.type === 'story' || ticket.type === 'bug') {
      if (!parent || parent.type !== 'epic' || !ticket.phaseId || ticket.phaseId !== parent.phaseId || ticket.phaseRefs.length || ticket.billingSource !== 'task-rollup-only' || ticket.billable || !children.length || children.some((child) => child.type !== 'task')) sourceError('Eine Story oder ein Fehler besitzt keinen eindeutigen fachlichen Epic oder keine Aufgaben.' );
    } else {
      if (!parent || (parent.type !== 'story' && parent.type !== 'bug') || !ticket.phaseId || ticket.phaseId !== parent.phaseId || ticket.phaseRefs.length || ticket.billingSource !== 'task-worklogs' || !ticket.billable || children.length) sourceError('Eine Aufgabe verletzt die eindeutige Story-/Fehler- oder Abrechnungsbindung.');
    }
    const worklog = context.ticketWorklogs?.get(ticket.ticketId);
    if (ticket.type !== 'task' && worklog && (worklog.hours !== 0 || worklog.amountEur !== 0)) sourceError('Nur Aufgaben dürfen fakturierbare Worklogs besitzen.');
    if (ticket.type === 'task' && worklog && (ticket.actualHours !== worklog.hours || ticket.amountEur !== worklog.amountEur)) sourceError('Eine Aufgabe widerspricht ihren fakturierbaren Worklogs.');
  }
  const descendantTasks = (rootId: string) => {
    const result: PresentationContract['jira']['tickets'] = []; const queue = [...(childrenByParent.get(rootId) ?? [])];
    while (queue.length) { const item = queue.shift()!; if (item.type === 'task') result.push(item); else queue.push(...(childrenByParent.get(item.ticketId) ?? [])); }
    return result;
  };
  const sum = (tickets: PresentationContract['jira']['tickets']) => tickets.reduce((totals, ticket) => ({ estimateHours: totals.estimateHours + ticket.estimateHours, actualHours: totals.actualHours + ticket.actualHours, remainingHours: totals.remainingHours + ticket.remainingHours, amountEur: totals.amountEur + ticket.amountEur }), { estimateHours: 0, actualHours: 0, remainingHours: 0, amountEur: 0 });
  const sameRollup = (left: { estimateHours: number; actualHours: number; remainingHours: number; amountEur: number }, right: { estimateHours: number; actualHours: number; remainingHours: number; amountEur: number }, includeEstimate: boolean) => (!includeEstimate || left.estimateHours === right.estimateHours) && left.actualHours === right.actualHours && left.remainingHours === right.remainingHours && left.amountEur === right.amountEur;
  for (const ticket of contract.jira.tickets.filter((item) => item.type !== 'task')) {
    const taskRollup = sum(ticket.type === 'phase' ? contract.jira.tickets.filter((item) => item.type === 'task' && item.phaseId === ticket.ticketId) : descendantTasks(ticket.ticketId));
    if (!sameRollup(ticket, taskRollup, false)) sourceError('Ein Elternvorgang besitzt keinen eindeutigen Task-basierten Ist-/Rest-/Betragsrollup.');
  }
  for (const epic of contract.jira.tickets.filter((ticket) => ticket.type === 'epic')) {
    const actualPhaseRefs = [...new Set((childrenByParent.get(epic.ticketId) ?? []).map((child) => child.phaseId).filter((id): id is string => Boolean(id)))];
    if (!unique(epic.phaseRefs) || epic.phaseRefs.length !== actualPhaseRefs.length || epic.phaseRefs.some((id) => !actualPhaseRefs.includes(id))) sourceError('Ein fachlicher Epic besitzt widersprüchliche Phasenreferenzen.');
  }
  const tasks = contract.jira.tickets.filter((ticket) => ticket.type === 'task'); const taskTotals = sum(tasks);
  if (context.billingTotal && (taskTotals.actualHours !== context.billingTotal.hours || taskTotals.amountEur !== context.billingTotal.amountEur)) sourceError('Die fakturierbare Gesamtsumme stammt nicht exakt einmal aus Aufgaben-Worklogs.');
  for (const space of contract.spaces) {
    const nodeIds = space.nodes.map((node) => node.id);
    if (!unique(nodeIds)) sourceError('Ein Wissensraum besitzt doppelte Navigationskennungen.');
    const nodesById = new Map(space.nodes.map((node) => [node.id, node]));
    const siblingOrders = new Map<string, number[]>();
    for (const node of space.nodes) {
      if (node.parentId && !nodesById.has(node.parentId)) sourceError('Ein Navigationsknoten verweist auf ein fehlendes Elternziel.');
      if ((node.kind === 'page') !== Boolean(node.documentId)) sourceError('Ein Seitenknoten besitzt keine eindeutige Dokumentbindung.');
      if (node.documentId && context.documentIds && !context.documentIds.has(node.documentId)) sourceError('Ein Seitenknoten verweist auf ein unbekanntes Dokument.');
      const key = node.parentId ?? '__root__'; const orders = siblingOrders.get(key) ?? []; orders.push(node.order); siblingOrders.set(key, orders);
    }
    if ([...siblingOrders.values()].some((orders) => !unique(orders))) sourceError('Geschwisterknoten besitzen eine doppelte Reihenfolge.');
    assertAcyclic(nodeIds, (id) => nodesById.get(id)?.parentId, 'Die Wissensraumhierarchie enthält einen Zyklus.');
  }
  if (!unique(contract.jira.views.map((view) => view.id)) || !unique(contract.jira.views.map((view) => view.order)) || new Set(contract.jira.views.map((view) => view.kind)).size !== 2) sourceError('Die Jira-Ansichten sind nicht eindeutig als Board und Liste definiert.');
  let boundGroups: string | null = null;
  for (const view of contract.jira.views) {
    if (!unique(view.visibleFields) || !unique(view.filters.map((filter) => filter.id))) sourceError('Eine Jira-Ansicht besitzt doppelte Felder oder Filter.');
    for (const filter of view.filters) if (!unique(filter.options.map((option) => option.value))) sourceError('Ein Jira-Filter besitzt doppelte Optionen.');
    if (!unique(view.groups.map((group) => group.id)) || !unique(view.groups.map((group) => group.order)) || JSON.stringify(view.groups.map((group) => group.phaseTicketId)) !== JSON.stringify(phaseTicketIds)) sourceError('Eine Jira-Ansicht besitzt nicht dieselben drei Phase-Tickets in producerdefinierter Reihenfolge.');
    for (const group of view.groups) {
      if (!unique(group.epicIds) || !unique(group.ticketIds) || ticketsById.get(group.phaseTicketId)?.type !== 'phase') sourceError('Eine Phasengruppe besitzt doppelte oder ungültige Ticketreferenzen.');
      const expectedEpics = contract.jira.tickets.filter((ticket) => ticket.type === 'epic' && ticket.phaseRefs.includes(group.phaseTicketId)).map((ticket) => ticket.ticketId);
      const expectedTickets = contract.jira.tickets.filter((ticket) => ticket.ticketId === group.phaseTicketId || (ticket.type === 'epic' ? ticket.phaseRefs.includes(group.phaseTicketId) : ticket.phaseId === group.phaseTicketId)).map((ticket) => ticket.ticketId);
      if (group.epicIds.length !== expectedEpics.length || group.epicIds.some((id) => !expectedEpics.includes(id)) || group.ticketIds.length !== expectedTickets.length || group.ticketIds.some((id) => !expectedTickets.includes(id))) sourceError('Eine Phasengruppe bildet ihre source-driven Epic- und Ticketmenge nicht exakt ab.');
    }
    const groupedTasks = view.groups.flatMap((group) => group.ticketIds).filter((id) => ticketsById.get(id)?.type === 'task');
    if (!unique(groupedTasks) || groupedTasks.length !== tasks.length) sourceError('Eine Jira-Ansicht zählt Aufgaben oder Worklogs phasenübergreifend doppelt.');
    const currentGroups = JSON.stringify(view.groups.map(({ id: _id, ...group }) => group));
    if (boundGroups !== null && currentGroups !== boundGroups) sourceError('Board und kompakte Liste besitzen widersprüchliche Phasengruppen.');
    boundGroups = currentGroups;
    if (view.kind === 'board') {
      if (!unique(view.columns.map((column) => column.id)) || !unique(view.columns.map((column) => column.order))) sourceError('Das Jira-Board besitzt doppelte Spalten oder Reihenfolgen.');
      const statuses = view.columns.flatMap((column) => column.statuses);
      if (!unique(statuses) || (context.ticketStatuses && [...context.ticketStatuses.values()].some((status) => !statuses.includes(status)))) sourceError('Das Jira-Board besitzt eine widersprüchliche Statuszuordnung.');
    }
  }
  return contract;
}

function assertSnapshotBinding(repo: string, fingerprint: SourceFingerprint, binding: ProjectSourceBinding | undefined) {
  if (!binding) return;
  if (!fullSha.test(binding.expectedCommit)) sourceError('Die erwartete vollstaendige Commit-SHA fehlt oder ist ungueltig.', 'QUELLKONFIGURATION_UNGUELTIG');
  if (binding.expectedTree && (!fullSha.test(binding.expectedTree) || gitText(repo, ['rev-parse', `${binding.expectedCommit}^{tree}`]) !== binding.expectedTree)) sourceError('Der gebundene Quellen-Tree stimmt nicht mit dem erwarteten V1.0-Snapshotanker ueberein.');
  if (fingerprint.commit !== binding.expectedCommit) sourceError('Der aktuelle Quellen-Commit stimmt nicht mit der erwarteten Momentaufnahme ueberein.');
  if (fingerprint.branch !== binding.expectedBranch) sourceError('Der aktuelle Quellen-Branch stimmt nicht mit der erwarteten Bindung ueberein.');
  if (gitText(repo, ['remote', 'get-url', 'origin']) !== binding.expectedRemote) sourceError('Das Quellen-Remote stimmt nicht mit der erwarteten Bindung ueberein.');
  if (process.env.UABC_BRANCH_COMMIT_CONTRACT !== '1' && fingerprint.dirty) sourceError('Die Arbeitskopie ist nicht sauber. Momentaufnahme nicht freigegeben.');
}

const sensitiveTokens = new Set([
  'auth', 'authentication', 'authorization', 'bearer', 'cookie', 'cookies', 'credential', 'credentials', 'jwt', 'oauth', 'oauth2',
  'password', 'passwords', 'passwd', 'secret', 'secrets', 'session', 'sessions', 'ssh', 'tenant', 'token', 'tokens', 'trace', 'traces', 'video', 'videos',
]);

const sensitiveProfileContexts = new Set([
  'auth', 'authentication', 'authorization', 'browser', 'browsers', 'credential', 'credentials', 'user', 'users',
]);

const sensitiveNameFamilies = [
  'storagestate', 'clientsecret', 'accesstoken', 'refreshtoken', 'privatekey', 'accesskey', 'apikey', 'serviceaccount', 'connectionstring',
] as const;

function canonicalNameTokens(segment: string) {
  return segment
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSensitiveSegment(segment: string) {
  if (segment.toLowerCase() === 'traceability-matrix.yaml') return false;
  const lower = segment.toLowerCase();
  const tokens = canonicalNameTokens(segment);
  const semanticTokens = [...tokens];
  while (semanticTokens.length && ['json', 'yaml', 'yml', 'png', 'md', 'txt', 'csv'].includes(semanticTokens.at(-1) ?? '')) semanticTokens.pop();
  const collapsed = semanticTokens.join('');
  const keyIndex = tokens.indexOf('key');
  const hasProfileToken = semanticTokens.some((token) => token === 'profile' || token === 'profiles');
  const sensitiveProfile = hasProfileToken && (
    semanticTokens.every((token) => token === 'profile' || token === 'profiles')
    || semanticTokens.some((token) => sensitiveProfileContexts.has(token))
  );
  return /^\.env(?:\.|$)/i.test(segment)
    || /^\.(?:envrc|git|gitconfig|npmrc|netrc|kube)$/i.test(segment)
    || /^(?:id_(?:rsa|dsa|ecdsa|ed25519))(?:\.pub)?$/i.test(segment)
    || /\.(?:pem|pfx|p12|key|jks|keystore|crt|cer)$/i.test(lower)
    || sensitiveProfile
    || tokens.some((token) => sensitiveTokens.has(token))
    || sensitiveNameFamilies.some((family) => collapsed.includes(family))
    || (keyIndex > 0 && ['api', 'access', 'private', 'client', 'secret', 'ssh'].includes(tokens[keyIndex - 1]))
    || forbidden.test(segment);
}

function isSafeTechnicalIdentifier(value: string) {
  const collapsed = canonicalNameTokens(value).join('');
  const identifierForSensitivity = value.replace(/(^|-)TRACE(?=-|$)/g, '$1');
  return !sensitiveIdentifier.test(value) && !collapsed.includes('private') && !isSensitiveSegment(identifierForSensitivity);
}

export function safeBranchDisplay(value: string) {
  if (!value) return 'Nicht belegt';
  const hostPathTokens = new Set(['home', 'srv', 'users', 'volumes', 'workspace', 'documents']);
  const segments = value.split('/');
  const safe = value.length <= 120 && /^[A-Za-z0-9](?:[A-Za-z0-9._\/-]{0,118}[A-Za-z0-9])?$/.test(value)
    && !value.includes('//') && !value.includes('..') && !sensitiveIdentifier.test(value)
    && segments.every((segment) => isSafeTechnicalIdentifier(segment) && !canonicalNameTokens(segment).some((token) => hostPathTokens.has(token)));
  return safe ? value : 'Branchname aus Sicherheitsgründen redigiert';
}

export function validateProvenancePath(value: string) {
  if (!value || value.includes('\\') || value.includes('\0') || value.includes('\uFFFD') || /[\r\n\t]/.test(value)) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:|^\/\/|^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || isSensitiveSegment(segment))) return false;
  return exactSafePaths.includes(value as typeof exactSafePaths[number]) || safeRoots.some((root) => value === root || value.startsWith(`${root}/`));
}

function parseTree(repo: string, commit: string, limits: ReaderLimits): TreeEntry[] {
  const output = gitBuffer(repo, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', ...safeRoots, ...exactSafePaths]);
  const rawEntries = output.subarray(0, Math.max(0, output.length - (output.at(-1) === 0 ? 1 : 0))).toString('utf8');
  const records = rawEntries ? rawEntries.split('\0') : [];
  if (records.length > limits.maxFiles) sourceError('Die Quelle ueberschreitet die zulaessige Dateianzahl.');
  const entries = records.map((record): Omit<TreeEntry, 'size'> => {
    const match = record.match(/^([0-7]{6}) ([a-z]+) ([a-f0-9]+)\t([\s\S]+)$/);
    if (!match || match[2] !== 'blob' || !blobSha.test(match[3]) || !['100644', '100755'].includes(match[1])) {
      return sourceError('Der Git-Baum enthaelt einen nicht zulaessigen Eintragstyp.');
    }
    const relative = match[4];
    if (!validateProvenancePath(relative)) sourceError('Der Git-Baum enthaelt einen nicht zulaessigen Quellpfad.');
    return { mode: match[1] as TreeEntry['mode'], oid: match[3], path: relative };
  });
  if (!entries.length) return [];
  const query = Buffer.from(`${entries.map((entry) => entry.oid).join('\n')}\n`);
  const sizeOutput = gitBuffer(repo, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], query, Math.max(1024 * 1024, entries.length * 128)).toString('utf8').trim();
  const sizeLines = sizeOutput ? sizeOutput.split('\n') : [];
  if (sizeLines.length !== entries.length) sourceError('Der Git-Baum konnte nicht vollstaendig vermessen werden.');
  let total = 0;
  return entries.map((entry, index) => {
    const match = sizeLines[index].match(/^([a-f0-9]{40}) blob ([0-9]+)$/);
    const size = match ? Number(match[2]) : Number.NaN;
    if (!match || match[1] !== entry.oid || !Number.isSafeInteger(size) || size < 0) sourceError('Ein Quellblob ist ungueltig.');
    total += size;
    if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes) sourceError('Die Quelle ueberschreitet das zulaessige Gesamtvolumen.');
    return { ...entry, size };
  });
}

function validateContractPath(value: string) {
  if (!value || value.length > 1_000 || value.includes('\\') || value.includes('\0') || value.includes('\uFFFD') || /[\r\n\t]/.test(value)) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:|^\/\/|^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..' && !isSensitiveSegment(segment));
}

function parseExactTree(repo: string, commit: string, requestedPaths: readonly string[], limits: ReaderLimits) {
  const unique = [...new Set(requestedPaths)];
  if (!unique.length || unique.length !== requestedPaths.length || unique.length > limits.maxFiles || unique.some((value) => !validateContractPath(value))) {
    sourceError('Der Projektindex enthält keinen gültigen, eindeutigen Pfadsatz.');
  }
  const allowed = new Set(unique);
  const output = gitBuffer(repo, ['ls-tree', '-r', '-z', '-l', '--full-tree', commit, '--', ...unique], undefined, Math.max(1024 * 1024, unique.length * 256));
  const records = output.subarray(0, Math.max(0, output.length - (output.at(-1) === 0 ? 1 : 0))).toString('utf8').split('\0').filter(Boolean);
  const entries: TreeEntry[] = [];
  let total = 0;
  for (const record of records) {
    const match = record.match(/^([0-7]{6}) ([a-z]+) ([a-f0-9]{40})\s+([0-9-]+)\t([\s\S]+)$/);
    if (!match || match[2] !== 'blob' || match[1] !== '100644' || !blobSha.test(match[3]) || !allowed.has(match[5])) {
      sourceError('Ein indexierter Quellpfad besitzt keinen zulässigen regulären Git-Blob.');
    }
    const size = Number(match[4]);
    if (!Number.isSafeInteger(size) || size < 0) sourceError('Ein indexierter Quellblob besitzt keine gültige Größe.');
    total += size;
    if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes) sourceError('Die indexierten Quellen überschreiten das zulässige Gesamtvolumen.');
    entries.push({ mode: '100644', oid: match[3], size, path: match[5] });
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) sourceError('Der Projektindex löst einen Quellpfad mehrfach auf.');
  return entries;
}

function assertBoundedArrays(value: unknown, limit: number, depth = 0): void {
  if (depth > 100) sourceError('Die Quelldaten sind zu tief verschachtelt.');
  if (Array.isArray(value)) {
    if (value.length > limit) sourceError('Eine Quellliste ueberschreitet die zulaessige Laenge.');
    value.forEach((item) => assertBoundedArrays(item, limit, depth + 1));
  } else if (value && typeof value === 'object') {
    const values = Object.values(value);
    values.forEach((item) => assertBoundedArrays(item, limit, depth + 1));
  }
}

function parseYamlRecord(text: string, limits: ReaderLimits): RecordValue {
  try {
    const value = YAML.parse(text, { maxAliasCount: 50 });
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    assertBoundedArrays(value, limits.maxArrayItems);
    return value as RecordValue;
  } catch (error) {
    if (error instanceof AdapterSourceError) throw error;
    return sourceError('Ein YAML-Quellblob ist ungueltig.');
  }
}

type FrontmatterDocument = { data: RecordValue; content: string };

function parseBoundedFrontmatter(text: string, limits: ReaderLimits): FrontmatterDocument | null {
  const openingLength = text.startsWith('---\r\n') ? 5 : text.startsWith('---\n') ? 4 : 0;
  if (!openingLength) return null;
  const searchEnd = Math.min(text.length, openingLength + limits.maxFrontmatterBytes + 8);
  const search = text.slice(openingLength, searchEnd);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(search);
  if (!closing) sourceError('Der Frontmatter-Block fehlt oder ueberschreitet die zulaessige Groesse.');
  const yamlText = search.slice(0, closing.index).replace(/\r?\n$/, '');
  if (Buffer.byteLength(yamlText, 'utf8') > limits.maxFrontmatterBytes) sourceError('Der Frontmatter-Block ueberschreitet die zulaessige Groesse.');
  const contentStart = openingLength + closing.index + closing[0].length;
  return { data: parseYamlRecord(yamlText, limits), content: text.slice(contentStart) };
}

const pngCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function pngCrc(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePngStructure(blob: Buffer, limits: ReaderLimits) {
  if (blob.length < 45 || !blob.subarray(0, pngSignature.length).equals(pngSignature)) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
  let offset = pngSignature.length;
  let first = true;
  let hasHeader = false;
  let hasImageData = false;
  let hasEnd = false;
  let hasPalette = false;
  let imageDataClosed = false;
  let headerColorType: number | undefined;
  while (offset < blob.length) {
    if (blob.length - offset < 12) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
    const length = blob.readUInt32BE(offset);
    const typeBytes = blob.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    const dataStart = offset + 8;
    const crcOffset = dataStart + length;
    const next = crcOffset + 4;
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase() || next > blob.length || length > limits.maxPngBytes) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
    const expectedCrc = blob.readUInt32BE(crcOffset);
    if (pngCrc(blob.subarray(offset + 4, crcOffset)) !== expectedCrc) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
    if (first && type !== 'IHDR') sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
    if (type === 'IHDR') {
      if (!first || hasHeader || length !== 13) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
      const width = blob.readUInt32BE(dataStart);
      const height = blob.readUInt32BE(dataStart + 4);
      const bitDepth = blob[dataStart + 8];
      const colorType = blob[dataStart + 9]; headerColorType = colorType;
      const validDepth = (colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth))
        || (colorType === 2 && [8, 16].includes(bitDepth))
        || (colorType === 3 && [1, 2, 4, 8].includes(bitDepth))
        || ([4, 6].includes(colorType) && [8, 16].includes(bitDepth));
      if (!width || !height || width > limits.maxPngWidth || height > limits.maxPngHeight || width * height > limits.maxPngPixels) sourceError('Ein PNG-Quellblob ueberschreitet die zulaessigen Bildabmessungen.');
      if (!validDepth || blob[dataStart + 10] !== 0 || blob[dataStart + 11] !== 0 || ![0, 1].includes(blob[dataStart + 12])) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
      hasHeader = true;
    } else if (type === 'PLTE') {
      if (!hasHeader || hasPalette || hasImageData || [0, 4].includes(headerColorType ?? -1) || length === 0 || length % 3 !== 0 || length > 768) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
      hasPalette = true;
    } else if (type === 'IDAT') {
      if (!hasHeader || hasEnd || imageDataClosed || length === 0) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
      hasImageData = true;
    } else if (type === 'IEND') {
      if (!hasHeader || !hasImageData || hasEnd || length !== 0 || next !== blob.length) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
      hasEnd = true;
    } else if (type[0] === type[0].toUpperCase()) {
      sourceError('Ein PNG-Quellblob enthaelt einen nicht unterstuetzten kritischen Block.');
    }
    if (hasImageData && type !== 'IDAT' && type !== 'IEND') imageDataClosed = true;
    first = false;
    offset = next;
  }
  if (!hasHeader || !hasImageData || !hasEnd || (headerColorType === 3 && !hasPalette)) sourceError('Ein PNG-Quellblob ist strukturell ungueltig.');
}

class CommitBlobReader {
  readonly entries: readonly TreeEntry[];
  private readonly byPath: Map<string, TreeEntry>;
  private readonly blobs = new Map<string, Buffer>();
  private readonly documents = new Map<string, unknown>();

  constructor(readonly repo: string, readonly commit: string, readonly limits: ReaderLimits, entries?: readonly TreeEntry[], private readonly pathValidator = validateProvenancePath) {
    this.entries = entries ?? parseTree(repo, commit, limits);
    this.byPath = new Map(this.entries.map((entry) => [entry.path, entry]));
  }

  has(relative: string) { return this.byPath.has(relative); }

  paths(predicate: (relative: string) => boolean) {
    return this.entries.map((entry) => entry.path).filter(predicate).sort((a, b) => a.localeCompare(b, 'en'));
  }

  entry(relative: string) {
    if (!this.pathValidator(relative)) sourceError('Ein angeforderter Quellpfad ist nicht zulaessig.');
    const entry = this.byPath.get(relative);
    if (!entry) sourceError('Ein erforderlicher Quellblob fehlt.');
    return entry;
  }

  blob(relative: string) {
    const entry = this.entry(relative);
    const cached = this.blobs.get(entry.oid);
    if (cached) return cached;
    const blob = gitBuffer(this.repo, ['cat-file', 'blob', entry.oid], undefined, Math.max(1024, entry.size + 1024));
    if (blob.length !== entry.size) sourceError('Ein Quellblob wurde nicht vollstaendig gelesen.');
    this.blobs.set(entry.oid, blob);
    return blob;
  }

  text(relative: string) {
    const entry = this.entry(relative);
    if (entry.size > this.limits.maxTextBytes) sourceError('Ein Textblob ueberschreitet die zulaessige Groesse.');
    const text = this.blob(relative).toString('utf8');
    if (text.includes('\uFFFD') || Buffer.byteLength(text, 'utf8') !== entry.size) sourceError('Ein Textblob ist nicht gueltig UTF-8-kodiert.');
    return text;
  }

  yaml(relative: string): RecordValue {
    const cached = this.documents.get(relative);
    if (cached) return cached as RecordValue;
    const value = parseYamlRecord(this.text(relative), this.limits);
    this.documents.set(relative, value);
    return value;
  }

  json(relative: string): unknown {
    const cached = this.documents.get(relative);
    if (cached) return cached;
    try {
      const value = JSON.parse(this.text(relative));
      assertBoundedArrays(value, this.limits.maxArrayItems);
      this.documents.set(relative, value);
      return value;
    } catch (error) {
      if (error instanceof AdapterSourceError) throw error;
      return sourceError('Ein JSON-Quellblob ist ungueltig.');
    }
  }

  png(relative: string) {
    const entry = this.entry(relative);
    if (entry.size > this.limits.maxPngBytes) sourceError('Ein PNG-Quellblob ueberschreitet die zulaessige Groesse.');
    const blob = this.blob(relative);
    validatePngStructure(blob, this.limits);
    return blob;
  }

  frontmatter(relative: string) {
    return parseBoundedFrontmatter(this.text(relative), this.limits);
  }

  preflight() {
    for (const entry of this.entries) {
      if (/\.(?:md|ya?ml|json|csv)$/i.test(entry.path) && entry.size > this.limits.maxTextBytes) sourceError('Ein Textblob ueberschreitet die zulaessige Groesse.');
      if (/\.ya?ml$/i.test(entry.path)) this.yaml(entry.path);
      else if (/\.json$/i.test(entry.path)) this.json(entry.path);
      else if (/\.png$/i.test(entry.path)) this.png(entry.path);
      else if (/\.csv$/i.test(entry.path)) this.text(entry.path);
    }
  }
}

const limitedString = z.string().min(1).max(100_000);
const optionalString = z.string().max(100_000).optional();
const technicalId = z.string().min(1).max(120).regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/).refine((value) => !/[._-]{2}/.test(value) && isSafeTechnicalIdentifier(value));
const optionalWave = z.enum(['W0', 'W1', 'W2', 'W3', 'W4', 'W5']).optional();
const sourcePhase = z.string().min(1).max(80);
const sourceDocumentType = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/);

const architectureSchema = z.object({
  artifactId: technicalId,
  title: limitedString,
  lifecycleStatus: optionalString,
  approval: z.object({ scope: optionalString, exclusions: optionalString, evidenceId: technicalId.optional() }).passthrough().default({}),
  decisions: z.array(z.object({ id: technicalId, statement: limitedString, status: optionalString, decidedAt: optionalString }).passthrough()).default([]),
  actualSandboxBaseline: z.object({ evidenceIds: z.array(technicalId).optional(), unknowns: z.array(z.string()).optional() }).passthrough().optional(),
}).passthrough();

const capabilitiesSchema = z.object({
  artifactId: technicalId.optional(),
  domains: z.array(z.object({
    id: technicalId,
    name: optionalString,
    capabilities: z.array(z.object({
      id: technicalId, name: optionalString, status: optionalString, wave: optionalWave, purpose: optionalString, rationale: optionalString,
      dependencies: z.array(technicalId).optional(), confluenceRefs: z.array(technicalId).optional(), evidenceRefs: z.array(technicalId).optional(),
    }).passthrough()).default([]),
  }).passthrough()).default([]),
}).passthrough();

const openSpecArtifactIndexSchema = z.object({
  schemaVersion: z.literal(1),
  artifacts: z.array(z.object({
    artifactId: technicalId,
    title: z.string().min(1).max(4_000),
    canonicalPath: z.string().min(1).max(1_000).refine(validateProvenancePath),
    lifecycleStatus: z.string().min(1).max(80),
    purpose: z.string().min(1).max(4_000),
  }).strict()).max(10_000),
}).strict();

const jiraSchema = z.object({
  issues: z.array(z.object({
    key: technicalId, type: z.enum(['Epic', 'Story', 'Task', 'Sub-task', 'Bug']), summary: limitedString, status: optionalString, wave: optionalWave,
    phase: sourcePhase.optional(), phaseId: technicalId.optional(), workstream: limitedString.optional(), startDate: sourceDateSchema.optional(), dueDate: sourceDateSchema.optional(),
    effort: z.string().min(1).max(80).optional(), estimateHours: z.number().finite().nonnegative().optional(), plannedBillableHours: z.number().finite().nonnegative().optional(), actualHours: z.number().finite().nonnegative().optional(), billable: z.boolean().optional(),
    billingWeek: sourceBillingWeekSchema.nullable().optional(), billingStatus: sourceBillingStatusSchema.optional(),
    components: z.array(z.string()).optional(), acceptanceCriteria: z.array(z.string()).optional(), parent: technicalId.nullish(),
    dependencies: z.array(technicalId).optional(), confluenceRefs: z.array(technicalId).optional(), evidenceRefs: z.array(technicalId).optional(),
    meetingRefs: z.array(technicalId).optional(), deliverables: z.array(z.object({
      id: technicalId, type: sourceDocumentType, path: z.string().min(1).max(1_000).refine(validateProvenancePath), status: z.string().min(1).max(80),
    }).strict()).optional(), historySynthetic: z.boolean().optional(),
    history: z.array(z.object({ at: sourceDateTimeSchema, from: z.string().min(1).max(80), to: z.string().min(1).max(80), by: technicalId }).passthrough()).optional(),
  }).passthrough()).default([]),
}).passthrough();

const confluenceSchema = z.object({
  id: technicalId, title: optionalString, status: optionalString, wave: optionalWave, parent: technicalId.nullish(),
  jiraRefs: z.array(technicalId).optional(), referenceIds: z.array(technicalId).optional(), documentType: sourceDocumentType.optional(), meetingDate: sourceDateSchema.optional(),
}).passthrough();

const evidenceSchema = z.object({
  verifications: z.array(z.object({
    id: technicalId, changeRef: technicalId, status: optionalString, type: technicalId, evidence: z.string().max(100_000).nullish(),
    wave: optionalWave, subjectRefs: z.array(technicalId).optional(),
  }).passthrough()).default([]),
}).passthrough();

const openSpecProposalSchema = z.object({
  id: technicalId,
  title: limitedString.optional(),
  status: z.string().min(1).max(80).optional(),
  wave: z.enum(['W0', 'W1', 'W2', 'W3', 'W4', 'W5']).optional(),
  problem: limitedString.optional(),
  references: z.array(technicalId).default([]),
}).strict();

const projectDataArtifactSchema = z.object({
  id: technicalId,
  kindId: technicalId,
  path: z.string().min(1).max(1_000).refine(validateContractPath),
  selector: z.string().min(1).max(1_000).optional(),
  format: z.enum(['yaml', 'json', 'json-schema', 'markdown', 'text', 'csv', 'png', 'jpeg', 'webp', 'pdf', 'docx', 'xlsx', 'pptx', 'javascript']),
  required: z.boolean(),
}).strict();

function isSafeHttpsOrigin(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.origin === value;
  } catch { return false; }
}

const documentCatalogSharedEntrySchema = z.object({
  artifactId: technicalId, documentId: technicalId, title: z.string().min(1).max(500), documentType: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/),
  parentId: technicalId.nullable(), phase: z.string().min(1).max(120).nullable(), process: z.string().min(1).max(120).nullable(), status: z.string().min(1).max(120),
  ownerRefs: z.array(technicalId).max(50), jiraRefs: z.array(technicalId).max(200), referenceIds: z.array(technicalId).max(200), lastReviewed: sourceDateSchema.nullable(),
  visibility: z.literal('twin-visible'), readiness: z.string().min(1).max(120), externalUrl: z.string().url().nullable(), pageId: z.string().min(1).max(240).nullable(), spaceKey: z.string().min(1).max(120).nullable(),
  spaceId: technicalId.optional(), spaceType: z.enum(['customer-project', 'standard-product', 'consultant-internal']).optional(), order: z.number().int().nonnegative().optional(), storyPageId: technicalId.optional(),
}).strict();

const catalogSpaceSchema = z.object({
  spaceId: technicalId, spaceType: z.enum(['customer-project', 'standard-product', 'consultant-internal']), title: z.string().min(1).max(300), purpose: z.string().min(1).max(1_000),
  audience: z.array(z.string().min(1).max(120)).min(1).max(30), order: z.number().int().nonnegative(), homeDocumentId: technicalId,
  externalUrl: z.string().url().nullable(), pageId: z.string().min(1).max(240).nullable(), spaceKey: z.string().min(1).max(120).nullable(),
}).strict();
const catalogNavigationModuleSchema = z.object({ moduleId: technicalId, spaceId: technicalId, title: z.string().min(1).max(300), order: z.number().int().nonnegative() }).strict();
const catalogNavigationNodeSchema = z.object({
  nodeId: technicalId, moduleId: technicalId, nodeType: z.enum(['group', 'section', 'page']), title: z.string().min(1).max(300), order: z.number().int().nonnegative(),
  parentNodeId: technicalId.nullable(), documentId: technicalId.nullable(), description: z.string().min(1).max(1_000).optional(), initialState: presentationInitialStateSchema,
}).strict();
const catalogRedirectSchema = z.object({
  documentId: technicalId, storyPageId: technicalId, sourcePath: z.string().refine(validateContractPath), previousTitle: z.string().min(1).max(500), previousParentId: technicalId.nullable(),
  targetTitle: z.string().min(1).max(500), targetParentId: technicalId.nullable(), migrationStatus: z.literal('migrated-in-place'),
}).strict();

const documentCatalogIndexSchema = z.object({
  catalogId: z.literal('UABC-DOCUMENT-CATALOG-V1'), path: z.literal('exports/project-data/v1/document-catalog.json'), schemaPath: z.literal('governance/schemas/project-document-catalog.schema.json'),
  documentCount: z.number().int().positive().max(1_000), commitResolution: z.literal('allowed-branch-head-resolved-once'),
  allowedExternalOrigins: z.array(z.string().refine(isSafeHttpsOrigin)).max(20), definitions: z.array(documentCatalogSharedEntrySchema).min(1).max(1_000),
  spaces: z.array(catalogSpaceSchema).length(3), navigationModules: z.array(catalogNavigationModuleSchema).length(3), navigationNodes: z.array(catalogNavigationNodeSchema).min(1).max(1_000), redirects: z.array(catalogRedirectSchema).max(1_000),
  referenceDefinitions: z.object({ ownerRefs: z.array(technicalId).max(1_000), jiraRefs: z.array(technicalId).max(10_000), projectRefs: z.array(technicalId).max(10_000) }).strict(),
}).strict();

const artifactCatalogIndexSchema = z.object({
  catalogId: z.literal('UABC-ARTIFACT-CATALOG-V1'), path: z.string().refine(validateContractPath), schemaPath: z.string().refine(validateContractPath), resourceCount: z.number().int().positive().max(1_000),
}).strict();

const artifactCatalogResourceSchema = z.object({
  artifactId: technicalId, title: z.string().min(1).max(500), artifactType: resourceArtifactTypeSchema, mediaType: projectResourceSchema.shape.mediaType,
  path: z.string().refine(validateContractPath), gitMode: z.literal('100644'), sizeBytes: z.number().int().positive().max(50_000_000), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceCommitBinding: z.literal('same-pinned-commit'), status: z.string().min(1).max(120), createdAt: sourceDateTimeSchema.nullable(), actorRef: technicalId.nullable(),
  jiraRefs: z.array(technicalId).max(200), confluenceRefs: z.array(technicalId).max(200), deliverableRefs: z.array(technicalId).max(200),
  caption: z.string().min(1).max(1_000).nullable().default(null), processStep: z.string().min(1).max(500).nullable().default(null), precondition: z.string().min(1).max(1_000).nullable().default(null), postcondition: z.string().min(1).max(1_000).nullable().default(null),
  previewMode: resourcePreviewModeSchema, downloadable: z.boolean(),
}).strict();
const artifactCatalogSchema = z.object({
  schemaVersion: z.literal(1), catalogId: z.literal('UABC-ARTIFACT-CATALOG-V1'), projectId: z.literal('UABC-BC-BASIC-001'), commitBinding: z.literal('same-pinned-commit'), readOnly: z.literal(true), validationStatus: z.literal('validated'), resources: z.array(artifactCatalogResourceSchema).min(1).max(1_000),
}).strict();

const projectDocumentCatalogEntrySchema = documentCatalogSharedEntrySchema.extend({
  sourcePath: z.string().min(1).max(1_000).refine(validateContractPath), contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const projectDocumentCatalogSchema = z.object({
  schemaVersion: z.literal(1), catalogId: z.literal('UABC-DOCUMENT-CATALOG-V1'), contractId: z.literal('UABC-PROJECT-DATA-V1'), projectId: z.literal('UABC-BC-BASIC-001'),
  sourceIndexPath: z.literal('exports/project-data/v1/index.yaml'), allowedBranch: sourceBranchName, commitBinding: z.literal('allowed-branch-head-resolved-once'),
  readOnly: z.literal(true), validationStatus: z.literal('validated'), allowedExternalOrigins: z.array(z.string().refine(isSafeHttpsOrigin)).max(20),
  spaces: z.array(catalogSpaceSchema).length(3), navigationModules: z.array(catalogNavigationModuleSchema).length(3), navigationNodes: z.array(catalogNavigationNodeSchema).min(1).max(1_000), redirects: z.array(catalogRedirectSchema).max(1_000),
  documentCount: z.number().int().positive().max(1_000), confluenceDocumentCount: z.number().int().nonnegative().max(1_000), documents: z.array(projectDocumentCatalogEntrySchema).min(1).max(1_000),
}).strict();

const producerTicketTypePresentationSchema = z.object({ typeLabel: z.string().min(1).max(40), displayIconKey: z.enum(['jira-phase', 'jira-epic', 'jira-story', 'jira-bug', 'jira-task']), displayColorToken: z.enum(['teal', 'purple', 'green', 'blue', 'red']) }).strict();
const producerTicketTypesSchema = z.object({ phase: producerTicketTypePresentationSchema, epic: producerTicketTypePresentationSchema, story: producerTicketTypePresentationSchema, bug: producerTicketTypePresentationSchema.optional(), task: producerTicketTypePresentationSchema }).strict();
const producerTicketColumnSchema = z.object({ id: technicalId, title: z.string().min(1).max(120), order: z.number().int().nonnegative(), statuses: z.array(z.string().min(1).max(80)).min(1).max(30) }).strict();
const producerTicketGroupSchema = z.object({ id: technicalId, type: z.literal('phase'), phaseId: technicalId, title: z.string().min(1).max(200), order: z.number().int().nonnegative(), collapsible: z.literal(true), initialState: presentationInitialStateSchema, epicIds: z.array(technicalId).min(1).max(1_000), ticketIds: z.array(technicalId).min(1).max(1_000) }).strict();
const producerActorTypeSchema = z.enum(['human', 'simulated-customer-role', 'codex-spectra', 'playwright', 'system-automation']);
const producerActorProfileSchema = z.object({ personId: technicalId, displayName: z.string().min(1).max(160), organization: z.string().min(1).max(160), actorType: producerActorTypeSchema,
  activeRoles: z.array(z.string().min(1).max(160)).min(1).max(30), responsibilities: z.array(z.string().min(1).max(500)).min(1).max(100), availabilityStatus: z.string().min(1).max(160), allowedApprovalRoles: z.array(z.string().min(1).max(160)).max(30) }).strict();
const producerTicketViewSchema = z.object({
  id: technicalId, type: z.enum(['board', 'compact-list']), title: z.string().min(1).max(120), order: z.number().int().nonnegative(), initialState: presentationInitialStateSchema,
  allowedFilters: z.array(z.enum(['status', 'type'])).min(1).max(10), visibleFields: z.array(z.enum(['id', 'type', 'summary', 'status', 'parent'])).min(1).max(20),
  columns: z.array(producerTicketColumnSchema).default([]), groups: z.array(producerTicketGroupSchema).min(1).max(100),
}).strict();
const producerTicketRecordSchema = z.object({
  id: technicalId, type: z.enum(['phase', 'epic', 'story', 'bug', 'task']), sourceType: z.string().min(1).max(80), canonicalType: z.enum(['phase', 'epic', 'story', 'bug', 'task']),
  typeLabel: z.string().min(1).max(40), displayIconKey: z.string().min(1).max(80), displayColorToken: z.string().min(1).max(40), parent: technicalId.nullable(), childTicketIds: z.array(technicalId).max(1_000), dependencyRefs: z.array(technicalId).max(100),
  sourcePath: z.string().refine(validateContractPath), visibility: z.literal('twin-visible'), visibilityRole: z.enum(['customer-project-story', 'internal-traceability']), countingScope: z.enum(['active-project', 'excluded-from-story-counts']),
  planningRef: technicalId.nullable().optional(), status: z.string().min(1).max(80), statusReason: z.string().min(1).max(8_000), summary: z.string().min(1).max(500), description: z.string().min(1).max(4_000), deliverable: z.string().min(1).max(1_000),
  deliverableRefs: z.array(technicalId).max(1_000), pageRefs: z.array(technicalId).max(1_000), decisionRefs: z.array(technicalId).max(1_000), meetingTranscriptRefs: z.array(technicalId).max(1_000),
  phaseId: technicalId.nullable(), phaseRefs: z.array(technicalId).nullable(), phase: z.string().min(1).max(80).nullable(), billable: z.boolean(), billingSource: z.enum(['task-rollup-only', 'task-worklogs']),
  reporter: technicalId, reporterRole: z.string().min(1).max(160), assignee: technicalId, assigneeRole: z.string().min(1).max(160), participants: z.array(technicalId).max(1_000),
  estimateHours: z.number().nonnegative(), actualHours: z.number().nonnegative(), remainingHours: z.number().nonnegative(), hourlyRate: z.number().nonnegative().nullable(), netAmount: z.number().nonnegative(), acceptance: z.array(z.object({ criterion: z.string().min(1).max(2_000), fulfilled: z.boolean() }).strict()).default([]),
  history: z.array(z.object({ status: z.string().min(1).max(80), time: sourceDateSchema, actorRef: technicalId, actorType: producerActorTypeSchema, actionRole: z.string().min(1).max(160) }).strict()).default([]),
  worklogs: z.array(z.object({ id: technicalId, taskId: technicalId, date: sourceDateSchema, role: z.string().min(1).max(160), hours: z.number().nonnegative(), activity: z.string().min(1).max(8_000), phase: z.string().min(1).max(80), billable: z.boolean(), hourlyRate: z.number().nonnegative(), netAmount: z.number().nonnegative(), actorRef: technicalId, actorType: producerActorTypeSchema, actionRole: z.string().min(1).max(160) }).strict()).default([]),
  worklogHours: z.number().nonnegative(), evidence: z.array(z.string().min(1).max(1_000)).default([]),
  comments: z.array(z.object({ id: technicalId, type: z.string().min(1).max(80), time: sourceDateSchema, actorRef: technicalId, actorType: producerActorTypeSchema, actionRole: z.string().min(1).max(160), evidenceRef: z.string().min(1).max(1_000), text: z.string().min(1).max(8_000) }).strict()).default([]),
}).strict();
const producerTraceabilityRecordSchema = z.object({ id: technicalId, type: z.enum(['phase', 'epic', 'story', 'bug', 'task']), sourceType: z.string().min(1).max(80), canonicalType: z.enum(['phase', 'epic', 'story', 'bug', 'task']),
  typeLabel: z.string().min(1).max(40), displayIconKey: z.string().min(1).max(80), displayColorToken: z.string().min(1).max(40), parent: technicalId.nullable(), dependencyRefs: z.array(technicalId).max(100), sourcePath: z.string().refine(validateContractPath),
  visibility: z.literal('twin-visible'), visibilityRole: z.literal('internal-traceability'), countingScope: z.literal('excluded-from-story-counts'), status: z.string().min(1).max(80), summary: z.string().min(1).max(500) }).strict();
const producerTraceabilityRelationSchema = z.object({ type: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/), from: technicalId, to: technicalId }).strict();
const producerTicketCatalogSchema = z.object({
  schemaVersion: z.literal(1), projectId: z.literal('UABC-BC-BASIC-001'), classification: z.literal('synthetic-only'), sourceContract: z.literal('evidence/simulation/project-story.json'), generated: z.literal(true),
  derivedFrom: z.array(z.string().refine(validateContractPath)).min(1).max(20), actorProfiles: z.array(producerActorProfileSchema).min(1).max(1_000), canonicalTypes: z.array(z.enum(['phase', 'epic', 'story', 'bug', 'task'])).min(4).max(5), typePresentations: producerTicketTypesSchema,
  liveIconPolicy: z.object({ sourceMode: z.literal('local-allowlist-only'), allowlistedAssets: z.array(z.string()).max(20), allowedOrigins: z.array(z.string()).max(20), digestAlgorithm: z.literal('SHA-256'), digestRequired: z.literal(true) }).strict(),
  views: z.array(producerTicketViewSchema).length(2), recordCount: z.number().int().positive(), customerStoryCount: z.number().int().positive(), internalTraceabilityCount: z.number().int().nonnegative(),
  countedWorklogHours: z.number().nonnegative(), historicalPlanningBaselineHours: z.number().nonnegative().optional(), ticketRecords: z.array(producerTicketRecordSchema).min(1).max(1_000),
  traceabilityRecords: z.array(producerTraceabilityRecordSchema).default([]), traceabilityRelations: z.array(producerTraceabilityRelationSchema).default([]),
}).strict();
const ticketCatalogIndexSchema = z.object({
  path: z.literal('atlassian/jira/issues/bc-basic-story-tickets.yaml'), sourceContract: z.literal('evidence/simulation/project-story.json'), migrationMatrix: z.literal('project/bc-basic/ticket-migration.yaml'),
  recordCount: z.number().int().positive(), customerStoryCount: z.number().int().positive(), internalTraceabilityCount: z.number().int().nonnegative(), canonicalTypes: z.array(z.enum(['phase', 'epic', 'story', 'bug', 'task'])).min(4).max(5),
  typeField: z.literal('type'), canonicalTypeField: z.literal('canonicalType'), parentField: z.literal('parent'), visibilityRoleField: z.literal('visibilityRole'), countingScopeField: z.literal('countingScope'), typePresentationsField: z.literal('typePresentations'),
  typeLabelField: z.literal('typeLabel'), displayIconKeyField: z.literal('displayIconKey'), displayColorTokenField: z.literal('displayColorToken'), liveIconPolicyField: z.literal('liveIconPolicy'), viewsField: z.literal('views'),
  presentationTypes: z.array(z.enum(['phase', 'epic', 'story', 'bug', 'task'])).min(4).max(5), viewIds: z.array(technicalId).length(2), viewTypes: z.array(z.enum(['board', 'compact-list'])).length(2), inferTypeFromKeyOrTitle: z.literal(false),
}).strict();

const projectDataIndexSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: z.literal('UABC-PROJECT-DATA-V1'),
  contractRole: z.literal('repository-relative-data-allowlist'),
  snapshotManifestIncluded: z.literal(false),
  projectId: technicalId,
  projectKey: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/),
  routeKey: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/),
  displayName: z.string().min(1).max(160),
  governingChange: technicalId,
  lifecycleStatus: z.string().min(1).max(80),
  readOnly: z.literal(true),
  sourceOfTruth: z.literal('openspec'),
  pathSemantics: z.literal('repository-relative'),
  allowedBranch: sourceBranchName.optional(),
  deliveryBranch: sourceBranchName.optional(),
  validationStatus: z.literal('validated').optional(),
  missingValuePolicy: z.literal('leer'),
  documentCatalog: documentCatalogIndexSchema.optional(),
  artifactCatalog: artifactCatalogIndexSchema.optional(),
  ticketCatalog: ticketCatalogIndexSchema.optional(),
  referenceDefinitions: z.object({ jiraRefs: z.array(technicalId).min(1).max(1_000) }).strict().optional(),
  consumerRules: z.array(z.string().min(1).max(2_000)).min(1).max(100),
  artifacts: z.array(projectDataArtifactSchema).min(1).max(1_000),
}).strict();

export function validateProjectDataIndexContract(input: unknown): ProjectDataIndex {
  const parsed = projectDataIndexSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.map(String).join('.') || 'Wurzel';
    sourceError(`Der Projektindex verletzt den festgelegten project-data/v1-Vertrag im Feld ${field}.`);
  }
  return parsed.data;
}

const projectStorySchema = z.object({
  schemaVersion: z.literal(1), storyId: technicalId, projectId: technicalId, classification: z.string().min(1).max(80), status: z.string().min(1).max(80),
  offer: z.record(z.string(), z.unknown()).optional(),
  pages: z.array(z.record(z.string(), z.unknown())).default([]),
  tickets: z.array(z.record(z.string(), z.unknown())).default([]),
  timeline: z.array(z.record(z.string(), z.unknown())).default([]),
  hypercare: z.array(z.record(z.string(), z.unknown())).default([]),
  controls: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const snapshotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  producerId: z.literal('blueprint'),
  projectId: z.literal('UABC-BC-BASIC-001'),
  contractId: z.literal('UABC-PROJECT-DATA-V1'),
  producerCommitSha: z.string().regex(fullSha),
  schemaPath: z.literal('governance/schemas/project-snapshot-manifest.schema.json'),
  indexPath: z.literal('exports/project-data/v1/index.yaml'),
  consumer: z.object({ consumerId: z.literal('project-twin'), repositoryUrl: z.literal('https://github.com/sivla/FiBu.git'), branch: z.literal('codex/universaarl-projekt-twin'), access: z.literal('nur-lesend') }).strict(),
  spectraReleaseBinding: z.object({
    bindingStatus: z.literal('BOUND'), productId: z.literal('spectra'), technicalRepositoryName: z.literal('BCProjectOS'), repositoryUrl: z.literal('https://github.com/sivla/BCProjectOS.git'),
    releaseVersion: z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    releaseTag: z.string().regex(/^spectra-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    tagCommit: z.string().regex(fullSha), manifestPath: z.string().min(1).max(1_000).refine(validateContractPath), manifestSourceCommit: z.string().regex(fullSha), consumerMode: z.literal('INSTALLABLE_BLUEPRINT'), installableBlueprint: z.literal(true), digestAlgorithm: z.literal('SHA-256'), payloadBundleDigest: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  consumerBindingDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  payloadDigestFormat: z.literal('uabc-snapshot-records-v1'),
  index: z.object({ path: z.literal('exports/project-data/v1/index.yaml'), gitMode: z.literal('100644'), sizeBytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  payloads: z.array(z.object({ id: technicalId, path: z.string().min(1).max(1_000).refine(validateContractPath), selector: z.string().min(1).max(1_000).nullable(), gitMode: z.literal('100644'), sizeBytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(1_000),
  payloadBundleDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  validationStatus: z.literal('validated'),
}).strict();

type SnapshotManifest = z.infer<typeof snapshotManifestSchema>;

type ProjectDataArtifact = z.infer<typeof projectDataArtifactSchema>;
type ProjectDataIndex = z.infer<typeof projectDataIndexSchema>;
type IndexedProjectSource = { declaration: ProjectDataArtifact; entry: TreeEntry };

const indexedJiraSchema = z.object({
  issues: z.array(z.object({
    key: technicalId,
    type: z.enum(['Epic', 'Story', 'Task', 'Sub-task', 'Bug']),
    summary: limitedString,
    status: z.string().min(1).max(80).nullish(),
    phase: z.string().min(1).max(80).nullish(),
    phaseId: technicalId.nullish(),
    workstream: z.string().min(1).max(160).nullish(),
    startDate: sourceDateSchema.nullish(),
    dueDate: sourceDateSchema.nullish(),
    effort: z.string().min(1).max(80).nullish(),
    plannedBillableHours: z.number().finite().nonnegative().nullish(),
    actualHours: z.number().finite().nonnegative().nullish(),
    billable: z.boolean().nullish(),
    billingWeek: sourceBillingWeekSchema.nullish(),
    billingStatus: sourceBillingStatusSchema.nullish(),
    parent: technicalId.nullish(),
    dependencies: z.array(technicalId).nullish(),
    confluenceRefs: z.array(technicalId).nullish(),
    evidenceRefs: z.array(technicalId).nullish(),
    transcriptRefs: z.array(technicalId).nullish(),
    deliverableIds: z.array(technicalId).nullish(),
    acceptanceCriteria: z.array(z.string().min(1).max(4_000)).nullish(),
    historySynthetic: z.boolean().nullish(),
    history: z.array(sourceHistoryEventSchema).nullish(),
  }).passthrough()).max(10_000),
}).passthrough();

const indexedVerificationSchema = z.object({
  verifications: z.array(z.object({
    id: technicalId,
    changeRef: technicalId,
    status: z.string().min(1).max(80).nullish(),
    type: technicalId,
    evidence: z.string().max(100_000).nullish(),
    subjectRefs: z.array(technicalId).nullish(),
  }).passthrough()).max(10_000),
}).passthrough();

function schema<T>(value: unknown, validator: z.ZodType<T>): T {
  const parsed = validator.safeParse(value);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.map(String).join('.') || 'Wurzel';
    sourceError(`Ein Quellblob verletzt den festgelegten Datenvertrag im Feld ${field}.`);
  }
  return parsed.data;
}

function waveToPhase(wave: string) {
  if (wave === 'W0') return 'Strategize' as const;
  if (wave === 'W1') return 'Initiate' as const;
  if (wave === 'W2' || wave === 'W3') return 'Implement' as const;
  if (wave === 'W4') return 'Prepare' as const;
  if (wave === 'W5') return 'Operate' as const;
  return 'Nicht belegt' as const;
}

function jiraWorkstream(components: unknown) {
  const names = strings(components);
  return names.find((name) => name !== 'Projektmanagement') ?? names[0] ?? 'Projektmanagement';
}

const primaryTitles: Record<string, string> = {
  'Universaarl enterprise architecture blueprint': 'Universaarl-Unternehmensarchitektur',
  'Four operational legal entities remain plus non-operational UAC-CONS; UAM is a substantive holding and shared-service company and UAP owns its project contracts resources and risks': 'Vier operative Rechtstraeger und eine nicht operative Beratungsgesellschaft',
  'Organizational objects exist only for a distinct process or control purpose': 'Organisationsobjekte nur fuer eigene Prozess- oder Kontrollzwecke',
  'Warehouse complexity differs by location': 'Lagerkomplexitaet je Standort',
  'COSTCENTER and BUSINESSUNIT are global dimensions': 'COSTCENTER und BUSINESSUNIT als globale Dimensionen',
  'Standard-first; extensions require a proven gap and separate change': 'Standard zuerst; Erweiterungen nur bei belegter Luecke',
  'OpenSpec is normative; Jira and Confluence are collaboration views': 'OpenSpec ist massgeblich; Jira und Confluence sind Arbeitsansichten',
  'Dataverse and Dynamics 365 Sales are outside the core project; later adoption needs a positive business case and separate OpenSpec change while native BC-adjacent sales functions may be assessed': 'Dataverse und Dynamics 365 Sales ausserhalb des Kernprojekts',
  'UAM-DE is the sole standard master-data synchronization source company for party identity shared dictionaries and commercial item core; production and all legal-entity transactional fields remain local': 'UAM-DE als zentrale Quelle fuer Stammdatensynchronisation',
};

const maxRedactionInputLength = 32_768;
const maxPercentDecodePasses = 8;
const encodedPathEscape = /%(?:25)*(?:2f|5c|3a)/i;
const absoluteHostPath = /(?<![A-Za-z0-9])(?:[\\/]{1,2})[A-Za-z0-9._~-]+(?:[\\/]+[A-Za-z0-9._~+@%=-]+)*/;
const sensitivePublicPath = /(?:^|[^a-z0-9])(?:auth(?:entication|orization)?|bearer|credential|key|oauth2?|password|secret|session|tenant|token)(?:[^a-z0-9]|$)/i;
const allowedPublicHosts = new Set(['learn.microsoft.com', 'github.com', 'openspec.dev']);
const narrativeSensitiveIdentifier = /(^|[^A-Za-z0-9])(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?=$|[^A-Za-z0-9])/gi;
const narrativeValue = `(?:"(?:\\\\.|[^"\\\\\\r\\n])*"|'(?:\\\\.|[^'\\\\\\r\\n])*'|(?:Bearer|Basic)\\s+[^\\s,;)\\]}]+|[^\\s,;)\\]}]+)`;
const narrativeAssignment = new RegExp(`(^|[^A-Za-z0-9])((?:[A-Za-z][A-Za-z0-9._-]{0,63})(?:[ \\t]+[A-Za-z][A-Za-z0-9._-]{0,63}){0,3})(\\s*(?:=|:)\\s*)${narrativeValue}`, 'gi');
const narrativeCredentialScheme = new RegExp(`(^|[^A-Za-z0-9])(Bearer|Basic)([ \\t]+)("(?:\\\\.|[^"\\\\\\r\\n])*"|'(?:\\\\.|[^'\\\\\\r\\n])*'|[^\\s,;)\\]}]+)`, 'gi');

function decodePathEscapes(value: string) {
  if (value.length > maxRedactionInputLength) return null;
  let current = value;
  for (let pass = 0; pass < maxPercentDecodePasses; pass += 1) {
    const next = current.replace(/%25/gi, '%').replace(/%2f/gi, '/').replace(/%5c/gi, '\\').replace(/%3a/gi, ':');
    if (next === current) return current;
    current = next;
  }
  return encodedPathEscape.test(current) ? null : current;
}

function decodePublicUrlPath(value: string) {
  if (value.length > 2_048) return null;
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    let next: string;
    try { next = decodeURIComponent(current); } catch { return null; }
    if (next === current) return current;
    current = next;
  }
  try { return decodeURIComponent(current) === current ? current : null; } catch { return null; }
}

function rawHttpsPath(value: string) {
  const authorityStart = value.indexOf('//') + 2; const pathStart = value.indexOf('/', authorityStart);
  return pathStart < 0 ? '/' : value.slice(pathStart);
}

function hasSensitivePublicSegment(value: string) {
  return value.split(/[\\/]/).filter(Boolean).some((segment) => isSensitiveSegment(segment) || canonicalNameTokens(segment).join('').includes('private'));
}

function isUnsafePublicPath(value: string) {
  const decoded = decodePublicUrlPath(value);
  if (decoded === null) return true;
  return [value, decoded].some((candidate) => /[?#]/.test(candidate) || sensitiveIdentifier.test(candidate) || sensitivePublicPath.test(candidate) || hasSensitivePublicSegment(candidate));
}

function isSafePublicHttps(value: string) {
  try {
    const authorityMatch = value.match(/^https:\/\/([^/?#]*)(?:[/?#]|$)/i);
    const rawAuthority = authorityMatch?.[1] ?? '';
    const rawHost = rawAuthority.toLowerCase();
    if (!allowedPublicHosts.has(rawHost)) return false;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.hostname.toLowerCase() !== rawHost || url.host.toLowerCase() !== rawHost) return false;
    const rawPath = rawHttpsPath(value); const decodedPath = decodePublicUrlPath(url.pathname);
    if (decodedPath === null || isUnsafePublicPath(rawPath) || isUnsafePublicPath(url.pathname)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'learn.microsoft.com') return /^\/(?:[a-z]{2}-[a-z]{2}\/)?(?:dynamics365\/business-central|power-platform|training)(?:\/|$)/i.test(decodedPath);
    if (host === 'github.com') return /^\/Fission-AI\/OpenSpec(?:\/|$)/i.test(decodedPath);
    return host === 'openspec.dev' && (decodedPath === '/' || /^\/docs(?:\/|$)/i.test(decodedPath));
  } catch { return false; }
}

function redactHostReferences(value: string) {
  if (value.length > maxRedactionInputLength) return '[Verweis redigiert]';
  const preservedHttps: string[] = [];
  const protectedValue = value.replace(/\bhttps:\/\/[^\s<>"']+/gi, (url) => {
    if (!isSafePublicHttps(url)) return '[Verweis redigiert]';
    const marker = `\uE000${preservedHttps.length}\uE001`; preservedHttps.push(url); return marker;
  });
  let result = decodePathEscapes(protectedValue);
  if (result === null) return '[Verweis redigiert]';
  result = result
    .replace(narrativeAssignment, (match, prefix: string, key: string, separator: string) => {
      const keyTokens = canonicalNameTokens(key);
      const sensitiveKey = isSensitiveSegment(key) || keyTokens.some((token) => token === 'key' || token === 'keys');
      return sensitiveKey ? `${prefix}${key}${separator}[Wert redigiert]` : match;
    })
    .replace(narrativeCredentialScheme, (match, prefix: string, scheme: string, spacing: string, rawValue: string) => {
      const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
      const plainValue = /^(["']).*\1$/.test(rawValue) ? rawValue.slice(1, -1) : rawValue;
      const basicCredential = quoted || plainValue.length >= 24 || /[^A-Za-z]/.test(plainValue) || /.[A-Z]/.test(plainValue);
      return scheme.toLowerCase() === 'bearer' || basicCredential ? `${prefix}${scheme}${spacing}[Wert redigiert]` : match;
    });
  result = result
    .replace(/\b[a-z][a-z0-9+.-]{1,31}:[^\s<>"']+/gi, '[Verweis redigiert]')
    .replace(/[A-Za-z]:(?:[\\/])+[A-Za-z0-9._~+@%=-]+(?:(?:[\\/])+[A-Za-z0-9._~+@%=-]+)*/g, '[lokaler Pfad redigiert]')
    .replace(new RegExp(absoluteHostPath.source, 'g'), '[lokaler Pfad redigiert]');
  if (encodedPathEscape.test(result) || absoluteHostPath.test(result)) return '[Verweis redigiert]';
  result = result
    .replace(narrativeSensitiveIdentifier, (_match, prefix: string) => `${prefix}[Kennung redigiert]`);
  return result.replace(/\uE000([0-9]+)\uE001/g, (_marker, index: string) => preservedHttps[Number(index)] ?? '[Verweis redigiert]');
}

function sanitizeArtifact(artifact: Artifact): Artifact {
  const sanitizeNullable = (value: string | null) => value === null ? null : redactHostReferences(value);
  return {
    ...artifact,
    title: sanitizeNullable(artifact.title),
    status: sanitizeNullable(artifact.status),
    sourceType: sanitizeNullable(artifact.sourceType),
    sourcePhase: sanitizeNullable(artifact.sourcePhase),
    workstream: sanitizeNullable(artifact.workstream),
    rationale: sanitizeNullable(artifact.rationale),
    history: artifact.history.map((event) => ({ ...event, from: redactHostReferences(event.from), to: redactHostReferences(event.to) })),
    deliverables: artifact.deliverables.map((deliverable) => ({ ...deliverable, status: redactHostReferences(deliverable.status) })),
  };
}

function presentArtifact(artifact: Artifact): Artifact {
  const translated = artifact.title ? primaryTitles[artifact.title] : undefined;
  return translated ? { ...artifact, title: translated } : artifact;
}

function readArchitecture(reader: CommitBlobReader): ReadResult {
  const result = empty();
  const relative = 'architecture/enterprise-blueprint.yaml';
  if (!reader.has(relative)) { result.warnings.push('Architekturquelle fehlt: architecture/enterprise-blueprint.yaml'); return result; }
  const data = schema(reader.yaml(relative), architectureSchema);
  result.knownIds.add(data.artifactId); data.decisions.forEach((decision) => result.knownIds.add(decision.id));
  const approval = data.approval;
  result.artifacts.push({
    id: data.artifactId, kind: 'architecture', title: data.title, status: data.lifecycleStatus ?? 'unbekannt', phase: 'Strategize', wave: 'W0',
    workstream: 'Projektmanagement', rationale: [approval.scope, approval.exclusions ? `Ausnahmen: ${approval.exclusions}` : ''].filter(Boolean).join('\n'),
    parentId: null, dependencies: [], documents: [], evidence: strings(approval.evidenceId ? [approval.evidenceId] : data.actualSandboxBaseline?.evidenceIds), sourcePath: relative,
  });
  for (const decision of data.decisions) result.artifacts.push({
    id: decision.id, kind: 'architecture', title: decision.statement, status: decision.status ?? 'unbekannt', phase: 'Strategize', wave: 'W0',
    workstream: 'Projektmanagement', rationale: `Entscheidung dokumentiert ${decision.decidedAt ?? ''}`.trim(), parentId: data.artifactId,
    dependencies: [], documents: [], evidence: [], sourcePath: relative,
  });
  result.actualUnknowns = data.actualSandboxBaseline?.unknowns ?? [];
  return result;
}

function readCapabilities(reader: CommitBlobReader): ReadResult {
  const result = empty();
  const relative = 'capabilities/catalog.yaml';
  if (!reader.has(relative)) { result.warnings.push('Faehigkeitsquelle fehlt: capabilities/catalog.yaml'); return result; }
  const data = schema(reader.yaml(relative), capabilitiesSchema);
  if (data.artifactId) result.knownIds.add(data.artifactId);
  for (const domain of data.domains) for (const capability of domain.capabilities) {
    result.knownIds.add(domain.id); result.knownIds.add(capability.id);
    const wave = capability.wave ?? '';
    result.artifacts.push({
      id: capability.id, kind: 'capability', title: capability.name ?? capability.id, status: capability.status ?? 'unbekannt', phase: waveToPhase(wave), wave,
      workstream: domain.name ?? domain.id, rationale: capability.purpose ?? capability.rationale ?? 'Kanonischer Eintrag im Faehigkeitskatalog.', parentId: domain.id,
      dependencies: capability.dependencies ?? [], documents: capability.confluenceRefs ?? [], evidence: capability.evidenceRefs ?? [], sourcePath: relative,
    });
  }
  return result;
}

function readJira(reader: CommitBlobReader): ReadResult {
  const result = empty();
  const files = reader.paths((relative) => /^atlassian\/jira\/issues\/[^/]+\.ya?ml$/i.test(relative));
  if (!files.length) result.warnings.push('Keine Jira-Vorgangsexporte gefunden.');
  for (const relative of files) {
    const data = schema(reader.yaml(relative), jiraSchema);
    for (const issue of data.issues) {
      result.knownIds.add(issue.key);
      const wave = issue.wave ?? '';
      const kind: Artifact['kind'] = issue.type === 'Epic' ? 'epic' : issue.type === 'Story' ? 'story' : issue.type === 'Bug' ? 'bug' : 'task';
      result.artifacts.push({
        id: issue.key, kind, title: issue.summary, status: issue.status ?? 'unbekannt', phase: waveToPhase(wave), wave,
        sourceType: issue.type, sourcePhase: issue.phase ?? null, phaseId: issue.phaseId ?? null, workstream: issue.workstream ?? jiraWorkstream(issue.components),
        rationale: (issue.acceptanceCriteria ?? []).join(' · '), parentId: issue.parent ?? null,
        dependencies: issue.dependencies ?? [], documents: issue.confluenceRefs ?? [], evidence: issue.evidenceRefs ?? [],
        effort: issue.effort && sourceEffortSchema.safeParse(issue.effort).success ? issue.effort : null, estimateHours: issue.estimateHours ?? issue.plannedBillableHours ?? null, actualHours: issue.actualHours ?? null,
        billable: issue.billable ?? null, billingWeek: issue.billingWeek ?? null, billingStatus: issue.billingStatus ?? null,
        startDate: issue.startDate ?? null, dueDate: issue.dueDate ?? null, historySynthetic: issue.historySynthetic ?? null, history: issue.history ?? [],
        meetings: issue.meetingRefs ?? [], deliverables: issue.deliverables ?? [], sourcePath: relative,
      });
    }
  }
  return result;
}

function safeMarkdownValue(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f<>]/.test(normalized) || /https?:\/\/|\]\(|\\|(?:^|\s)[A-Za-z]:[\/\\]|(?:^|\s)\/(?:[^/\s]|$)/i.test(normalized)) return null;
  return redactHostReferences(normalized) === normalized ? normalized : null;
}

function proposalDirectoryIdentity(relative: string) {
  const match = relative.match(/^openspec\/changes\/(archive\/)?([^/]+)\/proposal\.md$/);
  if (!match) return null;
  const leaf = technicalId.safeParse(match[2]);
  if (!leaf.success) return null;
  const dated = match[1] ? leaf.data.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)?.[1] : undefined;
  const id = technicalId.safeParse(dated ?? leaf.data);
  return id.success ? { id: id.data, archived: Boolean(match[1]) } : null;
}

function mainSpecDirectoryIdentity(relative: string) {
  const match = relative.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
  if (!match) return null;
  const id = technicalId.safeParse(match[1]);
  return id.success ? id.data : null;
}

function readOpenSpecKnownIds(reader: CommitBlobReader, result: ReadResult) {
  const artifactIndex = 'openspec/specs/project-governance/artifact-index.yaml';
  if (reader.has(artifactIndex)) {
    const data = schema(reader.yaml(artifactIndex), openSpecArtifactIndexSchema);
    const indexIds = new Set<string>();
    for (const artifact of data.artifacts) {
      if (indexIds.has(artifact.artifactId)) sourceError('Der OpenSpec-Artefaktindex verletzt den festgelegten Datenvertrag.');
      indexIds.add(artifact.artifactId);
      result.knownIds.add(artifact.artifactId);
    }
  }

  const mainSpecIds = new Set<string>();
  const files = reader.paths((relative) => mainSpecDirectoryIdentity(relative) !== null);
  for (const relative of files) {
    const text = reader.text(relative);
    if (Buffer.byteLength(text, 'utf8') > 512 * 1024) sourceError('Ein OpenSpec-Main-Spec-Blob verletzt den festgelegten Datenvertrag.');
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 10_000 || lines.some((line) => line.length > 4_000)) sourceError('Ein OpenSpec-Main-Spec-Blob verletzt den festgelegten Datenvertrag.');
    for (const line of lines) {
      if (!/^(?:### Requirement|#### Scenario):/.test(line)) continue;
      const match = line.match(/^(?:### Requirement|#### Scenario):[ \t]+([^ \t]+)(?:[ \t]+.*)?$/);
      const parsed = match ? technicalId.safeParse(match[1]) : null;
      if (!parsed?.success || mainSpecIds.has(parsed.data)) sourceError('Ein OpenSpec-Main-Spec-Blob verletzt den festgelegten Datenvertrag.');
      mainSpecIds.add(parsed.data);
      result.knownIds.add(parsed.data);
    }
  }
}

function parseMarkdownOpenSpecProposal(text: string, directoryId: string, archived: boolean) {
  if (Buffer.byteLength(text, 'utf8') > 256 * 1024) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 2_000 || lines.some((line) => line.length > 1_000)) return null;
  const firstContent = lines.findIndex((line) => line.trim());
  const heading = firstContent >= 0 ? lines[firstContent].match(/^#\s+(.+)\s*$/) : null;
  if (!heading) return null;
  const rawHeading = safeMarkdownValue(heading[1], 240);
  if (!rawHeading) return null;
  const genericHeading = /^(?:Change-Vorschlag|Änderungsvorschlag|Vorschlag)\s*:?\s*$/i.test(rawHeading);
  const explicitHeading = rawHeading.replace(/^(?:Change-Vorschlag|Änderungsvorschlag|Vorschlag)\s*:\s*/i, '');
  const title = genericHeading ? `OpenSpec-Aenderung ${directoryId}` : safeMarkdownValue(explicitHeading || rawHeading, 240);
  if (!title) return null;

  const metadata = new Map<string, string>();
  const metadataPattern = /^\s*(?:[-*]\s+)?(Change(?:-ID)?|Änderung(?:s-ID)?|Status|Welle|Wave)\s*:\s*(.*?)\s*$/i;
  const metadataCandidate = /^\s*(?:[-*]\s+)?(?:Change(?:-ID)?|Änderung(?:s-ID)?|Status|Welle|Wave)\b/i;
  const firstH2 = lines.findIndex((line, index) => index > firstContent && /^##(?:\s|$)/.test(line));
  const metadataZones: string[][] = [lines.slice(firstContent + 1, firstH2 < 0 ? lines.length : firstH2)];
  const metadataHeadings = lines.map((line, index) => /^##\s+Metadaten\s*$/i.test(line) ? index : -1).filter((index) => index >= 0);
  if (metadataHeadings.length > 1) return null;
  if (metadataHeadings.length === 1) {
    const start = metadataHeadings[0] + 1;
    let end = lines.findIndex((line, index) => index >= start && /^#{1,6}(?:\s|$)/.test(line));
    if (end < 0) end = lines.length;
    metadataZones.push(lines.slice(start, end));
  }
  for (const line of metadataZones.flat()) {
    const cleaned = line.replace(/\*\*/g, '');
    const match = cleaned.match(metadataPattern);
    if (!match) { if (metadataCandidate.test(cleaned)) return null; continue; }
    const label = match[1].toLowerCase();
    const key = /^(?:change|änderung)/i.test(label) ? 'id' : /^(?:welle|wave)$/i.test(label) ? 'wave' : 'status';
    const rawValue = match[2].trim(); const unquoted = rawValue.match(/^`([^`]+)`$/)?.[1] ?? rawValue;
    const value = safeMarkdownValue(unquoted, 240);
    if (!value || metadata.has(key)) return null;
    metadata.set(key, value);
  }
  const declaredId = metadata.get('id');
  if (declaredId && (declaredId !== directoryId || !technicalId.safeParse(declaredId).success)) return null;

  const statusValue = metadata.get('status'); const statusLabels: Readonly<Record<string, string>> = { archiviert: 'archived', archived: 'archived', aktiv: 'active', active: 'active', vorgeschlagen: 'proposed', proposed: 'proposed', geplant: 'planned', planned: 'planned', abgeschlossen: 'completed', completed: 'completed', erledigt: 'done', done: 'done', 'in arbeit': 'in progress', 'in progress': 'in progress' };
  const statusParts = statusValue?.split(',') ?? [];
  const statusBase = statusParts[0]?.trim(); const statusQualifier = statusParts[1]?.trim();
  if (statusValue && (statusParts.length > 2 || !statusBase || (statusParts.length === 2 && !statusQualifier) || (statusQualifier && !safeMarkdownValue(statusQualifier, 180)))) return null;
  const normalizedStatus = statusBase ? statusLabels[statusBase.toLowerCase()] : undefined;
  if (statusValue && !normalizedStatus) return null;
  const status = archived ? 'archived' : normalizedStatus;
  const rawWave = metadata.get('wave');
  const waveMatch = rawWave?.match(/^(W[0-5])(?:[ \t]+(.+))?$/);
  if (rawWave && (!waveMatch || (waveMatch[2] && !safeMarkdownValue(waveMatch[2], 180)))) return null;
  const waveValue = waveMatch?.[1];

  const sectionIndex = lines.findIndex((line) => /^##\s+(?:Problem|Problem und Zweck|Problemstellung|Zweck|Warum|Ziel)\s*$/i.test(line.trim()));
  let problem: string | undefined;
  if (sectionIndex >= 0) {
    const sectionLines: string[] = [];
    for (const line of lines.slice(sectionIndex + 1)) { if (/^#{1,6}\s+/.test(line)) break; if (line.trim()) sectionLines.push(line.trim()); }
    if (sectionLines.length > 40) return null;
    const section = safeMarkdownValue(sectionLines.join(' ').replace(/\s+/g, ' '), 4_000);
    if (sectionLines.length && !section) return null;
    problem = section ?? undefined;
  }
  const parsed = openSpecProposalSchema.safeParse({ id: directoryId, title, status, wave: waveValue, problem, references: [] });
  return parsed.success ? parsed.data : null;
}

function readOpenSpec(reader: CommitBlobReader): ReadResult {
  const result = empty();
  readOpenSpecKnownIds(reader, result);
  const files = reader.paths((relative) => proposalDirectoryIdentity(relative) !== null);
  if (!files.length) result.warnings.push('Keine OpenSpec-Aenderungsvorschlaege gefunden.');
  for (const relative of files) {
    const identity = proposalDirectoryIdentity(relative);
    if (!identity) continue;
    const document = reader.frontmatter(relative);
    const parsed = document ? openSpecProposalSchema.safeParse(document.data) : null;
    const proposal = document ? (parsed?.success && parsed.data.id === identity.id ? parsed.data : null) : parseMarkdownOpenSpecProposal(reader.text(relative), identity.id, identity.archived);
    if (!proposal) { result.warnings.push('Ein OpenSpec-Vorschlag verletzt den begrenzten strukturierten oder Markdown-Vertrag und wurde nicht normalisiert.'); continue; }
    result.knownIds.add(proposal.id);
    const wave = proposal.wave ?? '';
    result.artifacts.push({
      id: proposal.id, kind: 'change', title: proposal.title ?? 'Nicht belegt', status: identity.archived ? 'archived' : proposal.status ?? 'Nicht belegt', phase: waveToPhase(wave), wave, workstream: 'Nicht belegt',
      rationale: proposal.problem ?? 'Nicht belegt',
      parentId: null, dependencies: [], documents: proposal.references, evidence: [], sourcePath: relative,
    });
  }
  return result;
}

function readConfluence(reader: CommitBlobReader): ReadResult {
  const result = empty();
  const files = reader.paths((relative) => /^atlassian\/confluence\/pages\/[^/]+\.md$/i.test(relative));
  if (!files.length) result.warnings.push('Keine Confluence-Seitenexporte gefunden.');
  for (const relative of files) {
    const document = reader.frontmatter(relative);
    if (!document) sourceError('Ein Confluence-Quellblob besitzt keinen gueltigen Frontmatter-Vertrag.');
    const data = schema(document.data, confluenceSchema); result.knownIds.add(data.id);
    const wave = data.wave ?? '';
    result.artifacts.push({
      id: data.id, kind: 'document', title: data.title ?? data.id, status: data.status ?? 'documented', phase: waveToPhase(wave), wave,
      workstream: 'Projektmanagement', rationale: document.content.replace(/[#\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 420),
      parentId: data.parent ?? null, dependencies: data.jiraRefs ?? [], documents: data.referenceIds ?? [],
      evidence: (data.referenceIds ?? []).filter((id) => id.startsWith('UABC-VER-')), documentType: data.documentType ?? null, meetingDate: data.meetingDate ?? null, sourcePath: relative,
    });
  }
  return result;
}

function evidenceIdFor(projectId: string, reader: CommitBlobReader, entry: TreeEntry) {
  return `ev_${hash(`${projectId}\0${reader.commit}\0${entry.oid}\0${entry.path}`).slice(0, 24)}`;
}

function resourceIdFor(projectId: string, commit: string, pathValue: string, digest: string) {
  return `rs_${hash(`${projectId}\0${commit}\0${pathValue}\0${digest}`).slice(0, 24)}`;
}

type ArtifactCatalogBlob = { id: string; path: string; format: ProjectDataArtifact['format']; mode: string; size: number; bytes: Buffer };
const mediaContract: Readonly<Record<ProjectResource['mediaType'], { formats: ProjectDataArtifact['format'][]; preview: ProjectResource['previewMode'][] }>> = {
  'text/markdown': { formats: ['markdown'], preview: ['markdown'] }, 'text/plain': { formats: ['text'], preview: ['text'] },
  'image/png': { formats: ['png'], preview: ['image'] }, 'image/jpeg': { formats: ['jpeg'], preview: ['image'] }, 'image/webp': { formats: ['webp'], preview: ['image'] },
  'application/pdf': { formats: ['pdf'], preview: ['pdf', 'download'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { formats: ['docx'], preview: ['download'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { formats: ['xlsx'], preview: ['download'] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { formats: ['pptx'], preview: ['download'] },
};
function validateResourceSignature(mediaType: ProjectResource['mediaType'], bytes: Buffer, limits: ReaderLimits) {
  if (mediaType === 'image/png') return validatePngStructure(bytes, limits);
  if (mediaType === 'image/jpeg' && !(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9)) sourceError('Eine Ressource besitzt keine gueltige JPEG-Signatur.');
  if (mediaType === 'image/webp' && !(bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')) sourceError('Eine Ressource besitzt keine gueltige WebP-Signatur.');
  if (mediaType === 'application/pdf' && !(bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF')))) sourceError('Eine Ressource besitzt keine gueltige PDF-Signatur.');
  if (mediaType.includes('openxmlformats') && !(bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]))) sourceError('Eine Office-Ressource besitzt keine gueltige Paket-Signatur.');
  if (mediaType.startsWith('text/')) { const text = bytes.toString('utf8'); if (text.includes('\uFFFD') || Buffer.byteLength(text, 'utf8') !== bytes.length || /<\s*(?:script|iframe|object|embed|html)\b/i.test(text)) sourceError('Eine Textressource enthaelt unzulaessigen oder ungueltigen Inhalt.'); }
}

export function validateArtifactCatalogContract(input: { catalog: unknown; schemaDocument: unknown; index: { artifactCatalog?: unknown; artifacts: unknown[] }; blobs: ArtifactCatalogBlob[]; knownRefs: string[]; projectId: string; commit: string }, limits: ReaderLimits = defaultLimits): ProjectResource[] {
  const indexContract = artifactCatalogIndexSchema.safeParse(input.index.artifactCatalog); if (!indexContract.success) sourceError('Der Artefaktkatalog fehlt oder verletzt den Indexvertrag.');
  if (!input.schemaDocument || typeof input.schemaDocument !== 'object' || (input.schemaDocument as Record<string, unknown>).$id !== 'urn:universaarl:schema:project-artifact-catalog:v1') sourceError('Das Ressourcenkatalogschema besitzt nicht die erwartete kanonische Identitaet.');
  try { const validate = new Ajv2020({ allErrors: true, strict: true }).compile(input.schemaDocument); if (!validate(input.catalog)) sourceError('Der Artefaktkatalog ist gegen sein versioniertes JSON-Schema ungueltig.'); } catch (error) { if (error instanceof AdapterSourceError) throw error; sourceError('Das Ressourcenkatalogschema kann nicht sicher kompiliert werden.'); }
  const catalog = artifactCatalogSchema.safeParse(input.catalog); if (!catalog.success) sourceError('Der Artefaktkatalog verletzt den festgelegten Datenvertrag.');
  const declarations = schema(input.index.artifacts, z.array(projectDataArtifactSchema));
  if (catalog.data.projectId !== 'UABC-BC-BASIC-001' || input.projectId !== 'bc-basic' || !fullSha.test(input.commit) || indexContract.data.resourceCount !== catalog.data.resources.length) sourceError('Der Artefaktkatalog stimmt nicht mit der gepinnten Projektbindung ueberein.');
  const catalogDeclaration = declarations.find((item) => item.path === indexContract.data.path); const schemaDeclaration = declarations.find((item) => item.path === indexContract.data.schemaPath);
  if (!catalogDeclaration || catalogDeclaration.format !== 'json' || !schemaDeclaration || schemaDeclaration.format !== 'json-schema') sourceError('Katalog und Schema sind nicht positivgelistet.');
  const byPath = new Map(input.blobs.map((blob) => [blob.path, blob])); const ids = catalog.data.resources.map((item) => item.artifactId); const paths = catalog.data.resources.map((item) => item.path);
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) sourceError('Der Artefaktkatalog enthaelt doppelte IDs oder Pfade.');
  const known = new Set(input.knownRefs); const resources = catalog.data.resources.map((item) => {
    const declaration = declarations.find((value) => value.id === item.artifactId && value.path === item.path); const blob = byPath.get(item.path); const contract = mediaContract[item.mediaType];
    if (item.sizeBytes > (item.previewMode === 'image' ? limits.maxPngBytes : item.previewMode === 'markdown' || item.previewMode === 'text' ? limits.maxTextBytes : 25_000_000)) sourceError('Eine Ressource ueberschreitet die zulaessige Groesse.');
    if (!declaration || !blob || blob.id !== declaration.id || blob.mode !== '100644' || item.gitMode !== blob.mode || item.sizeBytes !== blob.size || item.sizeBytes !== blob.bytes.length || item.sha256 !== hash(blob.bytes) || !contract.formats.includes(declaration.format) || !contract.formats.includes(blob.format) || !contract.preview.includes(item.previewMode)) sourceError('Eine Ressource stimmt nicht mit ihrem positivgelisteten Git-Blob ueberein.');
    if ([...item.jiraRefs, ...item.confluenceRefs, ...item.deliverableRefs].some((reference) => !known.has(reference))) sourceError('Eine Ressource enthaelt eine unbekannte Referenz.');
    validateResourceSignature(item.mediaType, blob.bytes, limits);
    return projectResourceSchema.parse({ id: resourceIdFor(input.projectId, input.commit, item.path, item.sha256), artifactId: item.artifactId, title: item.title, artifactType: item.artifactType, mediaType: item.mediaType, sizeBytes: item.sizeBytes, sha256: item.sha256, status: item.status, createdAt: item.createdAt, actorRef: item.actorRef, jiraRefs: item.jiraRefs, confluenceRefs: item.confluenceRefs, deliverableRefs: item.deliverableRefs, caption: item.caption, processStep: item.processStep, precondition: item.precondition, postcondition: item.postcondition, previewMode: item.previewMode, downloadable: item.downloadable });
  });
  return resources;
}

function indexedResources(projectId: string, commit: string, index: ProjectDataIndex, reader: CommitBlobReader, sources: readonly IndexedProjectSource[], artifacts: readonly Artifact[], documents: readonly ProjectDocument[], limits: ReaderLimits) {
  if (!index.artifactCatalog) return [];
  const catalogSource = sources.find((source) => source.declaration.path === index.artifactCatalog?.path); const schemaSource = sources.find((source) => source.declaration.path === index.artifactCatalog?.schemaPath);
  if (!catalogSource || !schemaSource) sourceError('Katalog und Schema der Ressourcen fehlen in der Positivliste.');
  const schemaDocument = reader.json(schemaSource.declaration.path);
  if (!schemaDocument || typeof schemaDocument !== 'object' || (schemaDocument as Record<string, unknown>).$id !== 'urn:universaarl:schema:project-artifact-catalog:v1') sourceError('Das Ressourcenkatalogschema besitzt nicht die erwartete kanonische Identitaet.');
  const knownRefs = [...artifacts.map((item) => item.id), ...documents.map((item) => item.id), ...artifacts.flatMap((item) => item.deliverables.map((deliverable) => deliverable.id))];
  return validateArtifactCatalogContract({ catalog: reader.json(catalogSource.declaration.path), schemaDocument, index: { artifactCatalog: index.artifactCatalog, artifacts: index.artifacts }, blobs: sources.map((source) => ({ id: source.declaration.id, path: source.declaration.path, format: source.declaration.format, mode: source.entry.mode, size: source.entry.size, bytes: reader.blob(source.entry.path) })), knownRefs, projectId, commit }, limits);
}

function isEvidencePng(entry: TreeEntry) {
  return entry.path.startsWith('evidence/') && entry.path.toLowerCase().endsWith('.png');
}

function readEvidence(projectId: string, reader: CommitBlobReader): EvidenceResult {
  const result: EvidenceResult = { ...empty(), items: [] };
  const relative = 'evidence/verification-register.yaml';
  if (!reader.has(relative)) result.warnings.push('Verification-Register fuer Nachweise fehlt.');
  else {
    const data = schema(reader.yaml(relative), evidenceSchema);
    for (const verification of data.verifications) {
      result.knownIds.add(verification.id);
      const wave = verification.wave ?? '';
      result.artifacts.push({
        id: verification.id, kind: 'evidence', title: displayVerificationType(verification.type), status: verification.status ?? 'unbekannt', phase: waveToPhase(wave), wave,
        workstream: 'Projektmanagement', rationale: verification.evidence ?? '', parentId: null, dependencies: verification.subjectRefs ?? [], documents: [], evidence: [], sourcePath: relative,
      });
    }
  }
  const pngs = reader.entries.filter(isEvidencePng).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  result.items = pngs.map((entry, index) => ({ id: evidenceIdFor(projectId, reader, entry), title: `Bildnachweis ${String(index + 1).padStart(2, '0')}` }));
  return result;
}

function assertSafeLocalGitConfig(repo: string) {
  const names = gitBuffer(repo, ['config', '--local', '--no-includes', '--name-only', '--null', '--list']).toString('utf8').split('\0').filter(Boolean).map((name) => name.toLowerCase()).sort();
  if (names.some((name) => /^(?:include|includeif)\./.test(name)
    || name === 'extensions.worktreeconfig' || name === 'core.worktree'
    || /^filter\..*\.(?:clean|smudge|process|required)$/.test(name)
    || /^core\.(?:attributesfile|excludesfile|sshcommand|gitproxy)$/.test(name)
    || /^credential\./.test(name) || /^url\..*\.insteadof$/.test(name)
    || /^http\..*(?:extraheader|proxy|sslcert|sslkey)$/.test(name) || /^remote\..*\.proxy$/.test(name))) {
    sourceError('Die lokale Git-Konfiguration enthaelt nicht zulaessige ausfuehrbare oder externe Einbindungen.');
  }
  return hash(names.join('\0'));
}

function sameFilesystemPath(left: string, right: string) {
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  return normalize(path.normalize(left)) === normalize(path.normalize(right));
}

function isWithin(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function captureRepositoryIdentity(repo: string) {
  const configFingerprint = assertSafeLocalGitConfig(repo);
  if (gitText(repo, ['rev-parse', '--is-inside-work-tree']) !== 'true') sourceError('Die konfigurierte Projektquelle ist kein Git-Arbeitsbaum.');
  let root: string; let topLevel: string; let gitDirectory: string; let commonDirectory: string; let headPath: string;
  try {
    root = fs.realpathSync(repo);
    topLevel = fs.realpathSync(gitText(repo, ['rev-parse', '--show-toplevel']));
    gitDirectory = fs.realpathSync(gitText(repo, ['rev-parse', '--absolute-git-dir']));
    const commonName = gitText(repo, ['rev-parse', '--git-common-dir']);
    commonDirectory = fs.realpathSync(path.isAbsolute(commonName) ? commonName : path.resolve(repo, commonName));
    const headName = gitText(repo, ['rev-parse', '--git-path', 'HEAD']);
    headPath = fs.realpathSync(path.isAbsolute(headName) ? headName : path.resolve(repo, headName));
  } catch { return sourceError('Die Git-Quellidentitaet konnte nicht eindeutig bestimmt werden.'); }
  if (!sameFilesystemPath(root, topLevel) || !isWithin(commonDirectory, gitDirectory) || !isWithin(gitDirectory, headPath)) sourceError('Die konfigurierte Projektquelle stimmt nicht exakt mit der Git-Arbeitsbaumwurzel ueberein.');
  return hash([root, topLevel, gitDirectory, commonDirectory, headPath, configFingerprint].join('\0'));
}

function prepareRepo(repo: string) {
  if (!repo || !path.isAbsolute(repo)) sourceError('Die Projektquelle muss als absoluter Pfad konfiguriert sein.');
  try {
    const rootStat = fs.lstatSync(repo);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error();
    captureRepositoryIdentity(repo);
  } catch (error) {
    if (error instanceof AdapterSourceError) throw error;
    return sourceError('Die konfigurierte Projektquelle ist nicht verfuegbar.');
  }
}

function assertProjectDataFormat(declaration: ProjectDataArtifact, branchMode = false) {
  const extension = path.posix.extname(declaration.path).toLowerCase();
  const csvContractValid = declaration.format !== 'csv'
    || (['customer-data-template', 'synthetic-data-example'].includes(declaration.kindId) && declaration.selector === undefined);
  const valid = declaration.format === 'yaml' ? ['.yaml', '.yml'].includes(extension)
    : declaration.format === 'markdown' ? extension === '.md'
      : ['json', 'json-schema'].includes(declaration.format) ? extension === '.json'
        : declaration.format === 'javascript' ? extension === '.js' || extension === '.mjs'
        : declaration.format === 'text' ? extension === '.txt'
        : declaration.format === 'csv' ? extension === '.csv'
        : declaration.format === 'png' ? extension === '.png'
        : declaration.format === 'jpeg' ? ['.jpg', '.jpeg'].includes(extension)
        : declaration.format === 'webp' ? extension === '.webp'
        : declaration.format === 'pdf' ? extension === '.pdf'
        : declaration.format === 'docx' ? extension === '.docx'
        : declaration.format === 'xlsx' ? extension === '.xlsx'
        : declaration.format === 'pptx' ? extension === '.pptx'
        : false;
  if (!valid || (!branchMode && !csvContractValid) || declaration.path === 'exports/project-data/v1/index.yaml' || declaration.path === 'governance/consumer-bindings.yaml') sourceError('Der Projektindex enthält eine ungültige Format- oder Pfadbindung.');
}

function snapshotParent(repo: string, snapshotCommit: string) {
  const parents = gitText(repo, ['rev-list', '--parents', '-n', '1', snapshotCommit]).split(/\s+/).filter(Boolean);
  if (parents.length !== 2 || parents[0] !== snapshotCommit || !fullSha.test(parents[1])) sourceError('Der Snapshot-Commit besitzt keinen eindeutigen direkten Produzenten-Commit.');
  return parents[1];
}

function assertSnapshotDelta(repo: string, producerCommit: string, snapshotCommit: string, manifestPath: string) {
  const changed = gitText(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', producerCommit, snapshotCommit]).split('\n').filter(Boolean);
  if (!changed.length || changed.some((relative) => relative !== manifestPath)) sourceError('Zwischen Produzenten- und Snapshot-Commit wurden nicht zulässige Dateien geändert.');
}

function payloadDigest(reader: CommitBlobReader, sources: readonly IndexedProjectSource[]) {
  const digest = createHash('sha256');
  const entries = [reader.entry('exports/project-data/v1/index.yaml'), ...sources.map((source) => source.entry)];
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) sourceError('Der Snapshot-Digest enthält einen Pfad mehrfach.');
  for (const entry of [...entries].sort((left, right) => Buffer.from(left.path, 'utf8').compare(Buffer.from(right.path, 'utf8')))) {
    const blobDigest = hash(reader.blob(entry.path));
    digest.update(Buffer.from(entry.path, 'utf8')).update('\0').update(entry.mode).update('\0').update(String(entry.size)).update('\0').update(blobDigest).update('\n');
  }
  return `sha256:${digest.digest('hex')}`;
}

function readProjectDataSources(repo: string, commit: string, projectId: string, contract: ProjectSourceContract, limits: ReaderLimits, sourceBinding?: ProjectSourceBinding) {
  const branchCommitContract = process.env.UABC_BRANCH_COMMIT_CONTRACT === '1';
  if (branchCommitContract) return readBranchProjectDataSources(repo, commit, projectId, contract, limits, sourceBinding?.expectedBranch);
  if (contract.manifestPath !== 'exports/project-data/v1/snapshot-manifest.json' || contract.schemaPath !== 'governance/schemas/project-snapshot-manifest.schema.json' || contract.indexPath !== 'exports/project-data/v1/index.yaml' || contract.expectedProducerId !== 'blueprint') sourceError('Der konfigurierte Projektvertrag ist nicht vollständig.', 'QUELLKONFIGURATION_UNGUELTIG');
  const manifestEntries = parseExactTree(repo, commit, [contract.manifestPath], limits);
  if (manifestEntries.length !== 1) sourceError('Das erforderliche Snapshotmanifest fehlt.');
  const manifestReader = new CommitBlobReader(repo, commit, limits, manifestEntries, validateContractPath);
  const parsedManifest = snapshotManifestSchema.safeParse(manifestReader.json(contract.manifestPath));
  if (!parsedManifest.success) sourceError('Das Snapshotmanifest verletzt den festgelegten Vertrag.');
  const manifest = parsedManifest.data;
  const producerCommit = branchCommitContract ? null : snapshotParent(repo, commit);
  if (manifest.producerId !== contract.expectedProducerId || manifest.projectId !== contract.expectedProjectId || (!branchCommitContract && manifest.producerCommitSha !== producerCommit) || manifest.schemaPath !== contract.schemaPath || manifest.indexPath !== contract.indexPath || manifest.index.path !== contract.indexPath) sourceError('Das Snapshotmanifest stimmt nicht mit der commitgebundenen Produzentenbindung überein.');
  if (!branchCommitContract) assertSnapshotDelta(repo, producerCommit!, commit, contract.manifestPath);
  const schemaEntries = parseExactTree(repo, commit, [contract.schemaPath], limits);
  const producerSchemaEntries = branchCommitContract ? [] : parseExactTree(repo, producerCommit!, [contract.schemaPath], limits);
  if (schemaEntries.length !== 1 || (!branchCommitContract && (producerSchemaEntries.length !== 1 || schemaEntries[0].oid !== producerSchemaEntries[0].oid))) sourceError('Das Snapshot-Schema wurde zwischen Produzenten- und Snapshot-Commit verändert.');
  const schemaReader = new CommitBlobReader(repo, commit, limits, schemaEntries, validateContractPath);
  const schemaDocument = schemaReader.json(contract.schemaPath);
  if (!schemaDocument || typeof schemaDocument !== 'object' || Array.isArray(schemaDocument)) sourceError('Das Snapshot-Schema ist kein gültiges JSON-Objekt.');
  const canonicalSchema = schemaDocument as RecordValue;
  const requiredSchemaFields = ['schemaVersion', 'producerId', 'projectId', 'contractId', 'producerCommitSha', 'schemaPath', 'indexPath', 'consumer', 'spectraReleaseBinding', 'consumerBindingDigest', 'payloadDigestFormat', 'index', 'payloads', 'payloadBundleDigest', 'validationStatus'];
  const required = canonicalSchema.required;
  if (canonicalSchema.$id !== snapshotSchemaId || canonicalSchema.$schema !== 'https://json-schema.org/draft/2020-12/schema' || canonicalSchema.type !== 'object' || canonicalSchema.additionalProperties !== false || !Array.isArray(required) || !required.every((field): field is string => typeof field === 'string') || requiredSchemaFields.some((field) => !required.includes(field)) || !canonicalSchema.properties || typeof canonicalSchema.properties !== 'object' || requiredSchemaFields.some((field) => !Object.prototype.hasOwnProperty.call(canonicalSchema.properties, field))) sourceError('Das Snapshot-Schema besitzt nicht die kanonische strikte Feldform.');
  let validateManifest: ((value: unknown) => boolean) | undefined;
  try { validateManifest = new Ajv2020({ strict: true, allErrors: false }).compile(canonicalSchema); } catch { sourceError('Das Snapshot-Schema konnte nicht sicher kompiliert werden.'); }
  if (!validateManifest(manifest)) sourceError('Das Snapshotmanifest erfüllt das versionierte JSON-Schema nicht.');
  const indexEntries = parseExactTree(repo, commit, [contract.indexPath], limits);
  if (indexEntries.length !== 1) sourceError('Der erforderliche Projektindex fehlt.');
  const indexReader = new CommitBlobReader(repo, commit, limits, indexEntries, validateContractPath);
  const index = validateProjectDataIndexContract(indexReader.yaml(contract.indexPath));
  if (index.projectId !== contract.expectedProjectId || index.routeKey !== projectId) sourceError('Der Projektindex ist nicht der konfigurierten Projektkennung zugeordnet.');
  const ids = index.artifacts.map((item) => item.id); const paths = index.artifacts.map((item) => item.path);
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) sourceError('Der Projektindex enthält doppelte Artefakt-IDs oder Pfade.');
  index.artifacts.forEach((artifact) => assertProjectDataFormat(artifact));
  const sourceEntries = parseExactTree(repo, commit, paths, limits);
  const byPath = new Map(sourceEntries.map((entry) => [entry.path, entry]));
  const sources: IndexedProjectSource[] = [];
  for (const declaration of index.artifacts) {
    const entry = byPath.get(declaration.path);
    if (!entry) {
      sourceError('Ein indexierter Quellblob fehlt.');
    }
    sources.push({ declaration, entry });
  }
  const reader = new CommitBlobReader(repo, commit, limits, [indexEntries[0], ...sources.map((source) => source.entry)], validateContractPath);
  reader.preflight();
  if (manifest.index.gitMode !== indexEntries[0].mode || manifest.index.sizeBytes !== indexEntries[0].size || manifest.index.sha256 !== hash(reader.blob(contract.indexPath))) sourceError('Die Indexmetadaten stimmen nicht mit dem Git-Blob überein.');
  const declaredPayloads = new Map(manifest.payloads.map((payload) => [payload.path, payload]));
  if (!branchCommitContract && (declaredPayloads.size !== manifest.payloads.length || declaredPayloads.size !== sources.length)) sourceError('Das Snapshotmanifest enthält keine eindeutige vollständige Payloadliste.');
  for (const source of sources) {
    const payload = declaredPayloads.get(source.declaration.path);
    if (!branchCommitContract && (!payload || payload.id !== source.declaration.id || payload.selector !== (source.declaration.selector ?? null) || payload.gitMode !== source.entry.mode || payload.sizeBytes !== source.entry.size || payload.sha256 !== hash(reader.blob(source.declaration.path)))) sourceError('Die Snapshot-Payloadmetadaten stimmen nicht mit dem Index oder Git-Blob überein.');
  }
  if (!branchCommitContract) {
    const producerIndexEntries = parseExactTree(repo, producerCommit!, [contract.indexPath], limits);
    if (producerIndexEntries.length !== 1 || producerIndexEntries[0].oid !== indexEntries[0].oid) sourceError('Der Projektindex wurde zwischen Produzenten- und Snapshot-Commit verändert.');
    const producerEntries = parseExactTree(repo, producerCommit!, sources.map((source) => source.declaration.path), limits);
    const producerByPath = new Map(producerEntries.map((entry) => [entry.path, entry]));
    if (producerEntries.length !== sources.length || sources.some((source) => producerByPath.get(source.declaration.path)?.oid !== source.entry.oid)) sourceError('Die positivgelisteten Snapshot-Payloadblobs wurden verändert.');
  }
  if (!branchCommitContract) {
    if (manifest.spectraReleaseBinding.releaseTag !== `spectra-v${manifest.spectraReleaseBinding.releaseVersion}`) sourceError('Der Spectra-Release-Tag stimmt nicht mit der Releaseversion überein.');
    if (payloadDigest(reader, sources) !== manifest.payloadBundleDigest) sourceError('Der Snapshot-Payload-Digest stimmt nicht mit dem Manifest überein.');
  }
  return { index, reader, sources, manifest };
}

function readBranchProjectDataSources(repo: string, commit: string, projectId: string, contract: ProjectSourceContract, limits: ReaderLimits, expectedBranch?: string) {
  const indexEntries = parseExactTree(repo, commit, [contract.indexPath], limits);
  if (indexEntries.length !== 1) sourceError('Der erforderliche Projektindex fehlt.');
  const indexReader = new CommitBlobReader(repo, commit, limits, indexEntries, validateContractPath);
  const index = validateProjectDataIndexContract(indexReader.yaml(contract.indexPath));
  if (!index.documentCatalog || !index.referenceDefinitions) sourceError('Der kanonische Dokument- und Referenzvertrag fehlt im Branch-Commit-Vertrag.');
  if (!expectedBranch || index.allowedBranch !== expectedBranch || index.validationStatus !== 'validated') sourceError('Der Projektindex ist nicht für den konfigurierten Freigabebranch validiert.');
  if (index.projectId !== contract.expectedProjectId || index.routeKey !== projectId) sourceError('Der Projektindex ist nicht der konfigurierten Projektkennung zugeordnet.');
  const ids = index.artifacts.map((item) => item.id); const paths = index.artifacts.map((item) => item.path);
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) sourceError('Der Projektindex enthält doppelte Artefakt-IDs oder Pfade.');
  index.artifacts.forEach((artifact) => assertProjectDataFormat(artifact, true));
  const entries = parseExactTree(repo, commit, paths, limits);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const sources = index.artifacts.map((declaration) => { const entry = byPath.get(declaration.path); if (!entry) sourceError('Ein indexierter Quellblob fehlt.'); return { declaration, entry }; });
  const reader = new CommitBlobReader(repo, commit, limits, [indexEntries[0], ...sources.map((source) => source.entry)], validateContractPath); reader.preflight();
  const digest = payloadDigest(reader, sources);
  const manifest = { schemaVersion: 1, producerId: 'blueprint', projectId: 'UABC-BC-BASIC-001', producerCommitSha: commit, indexPath: contract.indexPath, payloadBundleDigest: digest, validationStatus: 'validated', spectraReleaseBinding: { productId: 'spectra', technicalRepositoryName: 'BCProjectOS', repositoryUrl: 'https://github.com/sivla/BCProjectOS.git', releaseVersion: '0.0.0', releaseTag: 'spectra-v0.0.0', tagCommit: commit, manifestPath: contract.manifestPath, manifestSourceCommit: commit, consumerMode: 'INSTALLABLE_BLUEPRINT', installableBlueprint: true } } as const;
  return { index, reader, sources, manifest };
}

function selectedYaml(reader: CommitBlobReader, source: IndexedProjectSource) {
  let value: RecordValue;
  try { value = reader.yaml(source.declaration.path); } catch { sourceError('Ein YAML-Quellblob ist ungueltig.'); }
  const selector = source.declaration.selector;
  if (!selector) return value;
  const equals = selector.match(/^([A-Za-z][A-Za-z0-9]*)\[([A-Za-z][A-Za-z0-9]*)=([A-Za-z0-9._-]+)\]$/);
  const membership = selector.match(/^([A-Za-z][A-Za-z0-9]*)\[([A-Za-z][A-Za-z0-9]*) in ([A-Za-z0-9._,-]+)\]$/);
  const match = equals ?? membership;
  if (!match) sourceError('Ein Projektindex-Selektor ist nicht unterstützt.');
  const collection = value[match[1]];
  if (!Array.isArray(collection)) sourceError('Ein Projektindex-Selektor verweist nicht auf eine Quellliste.');
  const expected = new Set((membership ? match[3].split(',') : [match[3]]));
  if (!expected.size || [...expected].some((item) => !technicalId.safeParse(item).success)) sourceError('Ein Projektindex-Selektor enthält einen ungültigen Vergleichswert.');
  const selected = collection.filter((item) => item && typeof item === 'object' && expected.has(String((item as RecordValue)[match[2]] ?? '')));
  return { ...value, [match[1]]: selected };
}

function indexedMarkdown(reader: CommitBlobReader, source: IndexedProjectSource) {
  const text = reader.text(source.declaration.path);
  const document = parseBoundedFrontmatter(text, reader.limits);
  const content = document?.content ?? text;
  const heading = content.replace(/\r\n?/g, '\n').split('\n').map((line) => line.match(/^#\s+(.+)\s*$/)?.[1]?.trim()).find(Boolean) ?? null;
  return { data: document?.data ?? {}, heading, content };
}

export function validateDocumentationMarkdown(input: string, sourcePath: string, allowedPaths: ReadonlySet<string>) {
  const content = input.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!content) sourceError('Ein Dokument besitzt keinen lesbaren Inhalt.');
  if (/<\s*\/?\s*(?:script|iframe|object|embed|form|style|link|meta|img|svg|math|video|audio|source|base)\b/i.test(content) || /\bon[a-z]+\s*=|(?:javascript|vbscript|data)\s*:/i.test(content)) sourceError('Ein Dokument enthaelt nicht zulaessigen aktiven Inhalt.');
  const targets: string[] = [];
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (!target || target.startsWith('#')) continue;
    if (/^https:\/\//i.test(target) || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target) || target.includes('%')) sourceError('Ein Dokument enthaelt einen nicht freigegebenen Link.');
    const relative = target.split('#', 1)[0];
    const directoryReference = relative.endsWith('/');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), relative)).replace(/\/$/, '');
    if (!validateContractPath(resolved)) sourceError('Ein Dokument enthaelt einen nicht freigegebenen Link.');
    if (allowedPaths.has(resolved) || (directoryReference && [...allowedPaths].some((allowedPath) => allowedPath.startsWith(`${resolved}/`)))) targets.push(resolved);
  }
  return { content, targets };
}

export function redactDocumentationHostPaths(value: string) {
  return value.replace(/(?:[A-Za-z]:\\|\/(?:home|Users)\/)[^\s`"'<>]+/g, '[lokaler Pfad redigiert]');
}

const documentCatalogSchemaId = 'urn:universaarl:schema:project-document-catalog:v1';
const catalogSharedFields = ['artifactId', 'documentId', 'title', 'documentType', 'parentId', 'phase', 'process', 'status', 'ownerRefs', 'jiraRefs', 'referenceIds', 'lastReviewed', 'visibility', 'readiness', 'externalUrl', 'pageId', 'spaceKey', 'spaceId', 'spaceType', 'order', 'storyPageId'] as const;
const catalogFileEvidenceSchema = z.object({ artifactId: technicalId, path: z.string().refine(validateContractPath), format: projectDataArtifactSchema.shape.format, mode: z.literal('100644'), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export function validateProjectDocumentCatalogContract(input: { catalog: unknown; schemaDocument: unknown; indexCatalog: unknown; indexArtifacts: unknown; files: unknown }) {
  const catalog = schema(input.catalog, projectDocumentCatalogSchema);
  const indexCatalog = schema(input.indexCatalog, documentCatalogIndexSchema);
  const artifacts = schema(input.indexArtifacts, z.array(projectDataArtifactSchema).min(1).max(1_000));
  const files = schema(input.files, z.array(catalogFileEvidenceSchema).min(1).max(1_000));
  if (!input.schemaDocument || typeof input.schemaDocument !== 'object' || Array.isArray(input.schemaDocument)) sourceError('Das Dokumentkatalogschema ist kein gueltiges JSON-Objekt.');
  const schemaDocument = input.schemaDocument as RecordValue;
  const requiredFields = ['schemaVersion', 'catalogId', 'contractId', 'projectId', 'sourceIndexPath', 'allowedBranch', 'commitBinding', 'readOnly', 'validationStatus', 'allowedExternalOrigins', 'spaces', 'navigationModules', 'navigationNodes', 'redirects', 'documentCount', 'confluenceDocumentCount', 'documents'];
  const required = schemaDocument.required;
  if (schemaDocument.$schema !== 'https://json-schema.org/draft/2020-12/schema' || schemaDocument.$id !== documentCatalogSchemaId || schemaDocument.type !== 'object' || schemaDocument.additionalProperties !== false || !Array.isArray(required) || requiredFields.some((field) => !required.includes(field)) || !schemaDocument.properties || typeof schemaDocument.properties !== 'object' || requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(schemaDocument.properties, field))) sourceError('Das Dokumentkatalogschema besitzt nicht die kanonische strikte Feldform.');
  let validateCatalog: ((value: unknown) => boolean) | undefined;
  try { validateCatalog = new Ajv2020({ strict: true, allErrors: false }).compile(schemaDocument); } catch { sourceError('Das Dokumentkatalogschema konnte nicht sicher kompiliert werden.'); }
  if (!validateCatalog(catalog)) sourceError('Der Dokumentkatalog erfuellt das versionierte JSON-Schema nicht.');
  if (indexCatalog.catalogId !== catalog.catalogId || indexCatalog.path !== catalog.sourceIndexPath.replace('index.yaml', 'document-catalog.json') || indexCatalog.documentCount !== catalog.documentCount || indexCatalog.commitResolution !== catalog.commitBinding || JSON.stringify(indexCatalog.allowedExternalOrigins) !== JSON.stringify(catalog.allowedExternalOrigins)
    || JSON.stringify(indexCatalog.spaces) !== JSON.stringify(catalog.spaces) || JSON.stringify(indexCatalog.navigationModules) !== JSON.stringify(catalog.navigationModules) || JSON.stringify(indexCatalog.navigationNodes) !== JSON.stringify(catalog.navigationNodes) || JSON.stringify(indexCatalog.redirects) !== JSON.stringify(catalog.redirects)) sourceError('Index und Dokumentkatalog besitzen keine identische Katalog- und Navigationsbindung.');
  if (catalog.documentCount !== catalog.documents.length || indexCatalog.definitions.length !== catalog.documents.length || catalog.confluenceDocumentCount !== catalog.documents.filter((document) => document.documentType === 'confluence-page').length) sourceError('Der Dokumentkatalog besitzt widerspruechliche Dokumentzaehler.');
  for (const values of [catalog.allowedExternalOrigins, indexCatalog.referenceDefinitions.ownerRefs, indexCatalog.referenceDefinitions.jiraRefs, indexCatalog.referenceDefinitions.projectRefs]) if (new Set(values).size !== values.length) sourceError('Der Dokumentkatalog besitzt doppelte Origin- oder Referenzdefinitionen.');
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact])); const fileById = new Map(files.map((file) => [file.artifactId, file]));
  const catalogArtifact = artifactById.get('UABC-SRC-BCB-DOC-CATALOG-001'); const schemaArtifact = artifactById.get('UABC-SRC-BCB-DOC-SCHEMA-001');
  if (!catalogArtifact || catalogArtifact.kindId !== 'project-document-catalog' || catalogArtifact.path !== indexCatalog.path || catalogArtifact.format !== 'json' || !schemaArtifact || schemaArtifact.kindId !== 'project-document-catalog-schema' || schemaArtifact.path !== indexCatalog.schemaPath || schemaArtifact.format !== 'json-schema') sourceError('Katalog und Katalogschema sind nicht eindeutig positivgelistet.');
  const markdownArtifacts = artifacts.filter((artifact) => artifact.format === 'markdown');
  if (markdownArtifacts.length !== catalog.documents.length || files.length !== artifacts.length) sourceError('Der Index und der Dokumentkatalog besitzen keine vollstaendige identische Blobabdeckung.');
  const documentIds = catalog.documents.map((document) => document.documentId); const artifactIds = catalog.documents.map((document) => document.artifactId); const paths = catalog.documents.map((document) => document.sourcePath);
  if (new Set(documentIds).size !== documentIds.length || new Set(artifactIds).size !== artifactIds.length || new Set(paths).size !== paths.length) sourceError('Der Dokumentkatalog besitzt doppelte Dokumentkennungen oder Pfade.');
  const knownDocumentIds = new Set(documentIds); const definitions = new Map(indexCatalog.definitions.map((definition) => [definition.artifactId, definition]));
  const spaceIds = catalog.spaces.map((space) => space.spaceId); const moduleIds = catalog.navigationModules.map((module) => module.moduleId); const nodeIds = catalog.navigationNodes.map((node) => node.nodeId);
  if (new Set(spaceIds).size !== spaceIds.length || new Set(catalog.spaces.map((space) => space.order)).size !== catalog.spaces.length || new Set(moduleIds).size !== moduleIds.length || new Set(catalog.navigationModules.map((module) => module.order)).size !== catalog.navigationModules.length || new Set(nodeIds).size !== nodeIds.length) sourceError('Der Dokumentkatalog besitzt doppelte Space-, Modul- oder Navigationskennungen.');
  if (catalog.spaces.some((space) => !knownDocumentIds.has(space.homeDocumentId)) || catalog.navigationModules.some((module) => !spaceIds.includes(module.spaceId))) sourceError('Ein Wissensraum oder Navigationsmodul besitzt keine gültige Dokument- oder Spacebindung.');
  const nodesById = new Map(catalog.navigationNodes.map((node) => [node.nodeId, node]));
  for (const node of catalog.navigationNodes) {
    if (!moduleIds.includes(node.moduleId) || (node.parentNodeId && (!nodesById.has(node.parentNodeId) || nodesById.get(node.parentNodeId)?.moduleId !== node.moduleId)) || ((node.nodeType === 'page') !== Boolean(node.documentId)) || (node.documentId && !knownDocumentIds.has(node.documentId))) sourceError('Ein Navigationsknoten besitzt eine ungültige Modul-, Eltern- oder Dokumentbindung.');
    const seen = new Set<string>([node.nodeId]); let parent = node.parentNodeId;
    while (parent) { if (seen.has(parent)) sourceError('Die Dokumentnavigation enthält einen Zyklus.'); seen.add(parent); parent = nodesById.get(parent)?.parentNodeId ?? null; }
  }
  for (const module of catalog.navigationModules) {
    const siblings = new Map<string, number[]>();
    for (const node of catalog.navigationNodes.filter((item) => item.moduleId === module.moduleId)) { const parent = node.parentNodeId ?? '__root__'; siblings.set(parent, [...(siblings.get(parent) ?? []), node.order]); }
    if ([...siblings.values()].some((orders) => new Set(orders).size !== orders.length)) sourceError('Die Dokumentnavigation besitzt eine doppelte Geschwisterreihenfolge.');
  }
  if (new Set(catalog.redirects.map((redirect) => redirect.documentId)).size !== catalog.redirects.length || catalog.redirects.some((redirect) => !knownDocumentIds.has(redirect.documentId) || (redirect.targetParentId && !knownDocumentIds.has(redirect.targetParentId)))) sourceError('Das Dokument-Migrationsmapping besitzt eine ungültige oder doppelte Zielbindung.');
  const ownerRefs = new Set(indexCatalog.referenceDefinitions.ownerRefs); const jiraRefs = new Set(indexCatalog.referenceDefinitions.jiraRefs); const projectRefs = new Set(indexCatalog.referenceDefinitions.projectRefs);
  for (const document of catalog.documents) {
    const artifact = artifactById.get(document.artifactId); const file = fileById.get(document.artifactId); const definition = definitions.get(document.artifactId);
    if (!artifact || artifact.format !== 'markdown' || artifact.path !== document.sourcePath || !file || file.path !== document.sourcePath || file.format !== 'markdown' || file.mode !== '100644' || file.sha256 !== document.contentSha256 || !definition) sourceError('Ein Katalogdokument stimmt nicht mit seinem positivgelisteten Git-Blob ueberein.');
    if (catalogSharedFields.some((field) => JSON.stringify(definition[field]) !== JSON.stringify(document[field]))) sourceError('Indexdefinition und kanonischer Dokumentkatalog widersprechen sich.');
    if (document.parentId && !knownDocumentIds.has(document.parentId)) sourceError('Eine Dokumenthierarchie verweist auf ein fehlendes Elternziel.');
    if (document.ownerRefs.some((reference) => !ownerRefs.has(reference)) || document.jiraRefs.some((reference) => !jiraRefs.has(reference)) || document.referenceIds.some((reference) => !projectRefs.has(reference) && !knownDocumentIds.has(reference))) sourceError('Ein Katalogdokument besitzt eine nicht definierte Referenz.');
    if (document.externalUrl) {
      let parsed: URL; try { parsed = new URL(document.externalUrl); } catch { sourceError('Eine externe Dokument-URL ist ungueltig.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !catalog.allowedExternalOrigins.includes(parsed.origin) || !document.pageId || !document.spaceKey) sourceError('Eine externe Dokument-URL besitzt keine sichere kanonische Originbindung.');
    } else if (document.pageId || document.spaceKey) sourceError('Eine externe Seitenidentitaet besitzt keine kanonische URL.');
  }
  return catalog;
}

function indexedDocuments(reader: CommitBlobReader, index: ProjectDataIndex, sources: readonly IndexedProjectSource[]) {
  if (!index.documentCatalog) sourceError('Der kanonische Dokumentkatalog fehlt im Branch-Commit-Vertrag.');
  const catalogSource = sources.find((source) => source.declaration.id === 'UABC-SRC-BCB-DOC-CATALOG-001');
  const schemaSource = sources.find((source) => source.declaration.id === 'UABC-SRC-BCB-DOC-SCHEMA-001');
  if (!catalogSource || !schemaSource) sourceError('Katalog und Katalogschema fehlen in der positiven Indexliste.');
  const catalog = validateProjectDocumentCatalogContract({ catalog: reader.json(catalogSource.declaration.path), schemaDocument: reader.json(schemaSource.declaration.path), indexCatalog: index.documentCatalog, indexArtifacts: index.artifacts,
    files: sources.map((source) => ({ artifactId: source.declaration.id, path: source.declaration.path, format: source.declaration.format, mode: source.entry.mode, sha256: hash(reader.blob(source.declaration.path)) })) });
  const byArtifactId = new Map(sources.map((source) => [source.declaration.id, source])); const allowedPaths = new Set(index.artifacts.map((artifact) => artifact.path));
  const documents: ProjectDocument[] = catalog.documents.map((document) => {
    const source = byArtifactId.get(document.artifactId); if (!source) return sourceError('Ein Katalogdokument besitzt keinen positivgelisteten Quellblob.');
    const parsed = indexedMarkdown(reader, source); const body = validateDocumentationMarkdown(parsed.content, document.sourcePath, allowedPaths);
    return projectDocumentSchema.parse({ id: document.documentId, title: document.title, documentType: document.documentType, status: document.status, parentId: document.parentId,
      owners: document.ownerRefs, references: [...document.jiraRefs, ...document.referenceIds], phase: document.phase, process: document.process, updatedAt: document.lastReviewed, sourcePath: document.sourcePath,
      content: redactDocumentationHostPaths(body.content), externalUrl: document.externalUrl, externalLinkReason: document.externalUrl ? 'Kanonische HTTPS-Quelle aus dem validierten Dokumentkatalog.' : 'Keine kanonische Confluence-URL im validierten Dokumentkatalog belegt.' });
  });
  return { catalog, documents };
}

function producerPresentationProjection(index: ProjectDataIndex, reader: CommitBlobReader, sources: readonly IndexedProjectSource[], catalog: z.infer<typeof projectDocumentCatalogSchema>, story: NonNullable<ProjectState['story']>) {
  if (!index.ticketCatalog || !index.referenceDefinitions) sourceError('Der kanonische Ticket- und Referenzvertrag fehlt im Branch-Commit-Vertrag.');
  const ticketSource = sources.find((source) => source.declaration.kindId === 'project-story-ticket-catalog');
  if (!ticketSource || ticketSource.declaration.path !== index.ticketCatalog.path || ticketSource.declaration.format !== 'yaml') sourceError('Der kanonische Ticketkatalog ist nicht eindeutig positivgelistet.');
  const ticketCatalog = schema(selectedYaml(reader, ticketSource), producerTicketCatalogSchema);
  const requiredTypes = ['phase', 'epic', 'story', 'task'] as const;
  const rawTypes = ticketCatalog.canonicalTypes;
  if (new Set(rawTypes).size !== rawTypes.length || requiredTypes.some((type) => !rawTypes.includes(type)) || JSON.stringify(index.ticketCatalog.canonicalTypes) !== JSON.stringify(rawTypes)) sourceError('Der Ticketkatalog besitzt keine eindeutige kanonische Typmenge.');
  if (ticketCatalog.recordCount !== ticketCatalog.ticketRecords.length + ticketCatalog.traceabilityRecords.length || ticketCatalog.customerStoryCount !== ticketCatalog.ticketRecords.length || ticketCatalog.internalTraceabilityCount !== ticketCatalog.traceabilityRecords.length || ticketCatalog.customerStoryCount + ticketCatalog.internalTraceabilityCount !== ticketCatalog.recordCount
    || index.ticketCatalog.recordCount !== ticketCatalog.recordCount || index.ticketCatalog.customerStoryCount !== ticketCatalog.customerStoryCount || index.ticketCatalog.internalTraceabilityCount !== ticketCatalog.internalTraceabilityCount) sourceError('Index und Ticketkatalog besitzen widersprüchliche Ticketzähler.');
  const allIds = [...ticketCatalog.ticketRecords, ...ticketCatalog.traceabilityRecords].map((ticket) => ticket.id);
  if (new Set(allIds).size !== allIds.length) sourceError('Der Ticketkatalog besitzt doppelte Ticketkennungen.');
  for (const ticket of [...ticketCatalog.ticketRecords, ...ticketCatalog.traceabilityRecords]) {
    const typePresentation = ticketCatalog.typePresentations[ticket.type];
    if (!typePresentation || ticket.canonicalType !== ticket.type || ticket.typeLabel !== typePresentation.typeLabel || ticket.displayIconKey !== typePresentation.displayIconKey || ticket.displayColorToken !== typePresentation.displayColorToken) sourceError('Ein Ticket widerspricht seiner producerdefinierten Typdarstellung.');
  }
  const canonicalRecords = ticketCatalog.ticketRecords.filter((ticket) => ticket.visibilityRole === 'customer-project-story' && ticket.countingScope === 'active-project');
  const internalRecords = ticketCatalog.traceabilityRecords;
  if (canonicalRecords.length !== ticketCatalog.customerStoryCount || internalRecords.length !== ticketCatalog.internalTraceabilityCount || canonicalRecords.length + internalRecords.length !== ticketCatalog.recordCount) sourceError('Der Ticketkatalog trennt Projektstory und interne Traceability nicht eindeutig.');
  if (new Set(index.referenceDefinitions.jiraRefs).size !== canonicalRecords.length || JSON.stringify(index.referenceDefinitions.jiraRefs) !== JSON.stringify(canonicalRecords.map((record) => record.id))) sourceError('Der Projektindex besitzt keine eindeutige vollständige Jira-Referenzmenge.');
  const storyById = new Map(story.tickets.map((ticket) => [ticket.id, ticket]));
  if (storyById.size !== canonicalRecords.length || canonicalRecords.some((record) => !storyById.has(record.id)) || story.tickets.some((ticket) => !canonicalRecords.some((record) => record.id === ticket.id))) sourceError('Ticketkatalog und kanonische Projektstory besitzen keine identische sichtbare Ticketmenge.');
  if (index.ticketCatalog.sourceContract !== ticketCatalog.sourceContract || JSON.stringify(index.ticketCatalog.viewIds) !== JSON.stringify(ticketCatalog.views.map((view) => view.id)) || JSON.stringify(index.ticketCatalog.viewTypes) !== JSON.stringify(ticketCatalog.views.map((view) => view.type))) sourceError('Index und Ticketkatalog besitzen keine identische Viewbindung.');

  const spaces = catalog.spaces.map((space) => {
    const modules = catalog.navigationModules.filter((module) => module.spaceId === space.spaceId);
    if (modules.length !== 1) sourceError('Ein Wissensraum besitzt kein eindeutiges Navigationsmodul.');
    const nodes = catalog.navigationNodes.filter((node) => node.moduleId === modules[0].moduleId);
    const roots = nodes.filter((node) => node.parentNodeId === null);
    if (roots.length !== 1) sourceError('Ein Wissensraum besitzt keinen eindeutigen Navigationswurzelknoten.');
    return {
      id: space.spaceId, title: space.title, purpose: space.purpose, audience: space.audience.join(', '), order: space.order, initialState: roots[0].initialState,
      nodes: nodes.map((node) => ({ id: node.nodeId, kind: node.nodeType, parentId: node.parentNodeId, order: node.order, initialState: node.initialState, title: node.title, purpose: node.description ?? null, audience: null, documentId: node.documentId })),
    };
  });
  const ticketTypes = rawTypes.map((type) => ({ type, ...producerTicketTypePresentation[type] }));
  const tickets = canonicalRecords.map((record) => {
    const storyTicket = storyById.get(record.id)!;
    if (storyTicket.type !== record.type || storyTicket.parent !== record.parent || storyTicket.status !== record.status || storyTicket.phaseId !== record.phaseId || JSON.stringify(storyTicket.phaseRefs) !== JSON.stringify(record.phaseRefs ?? [])
      || storyTicket.billingSource !== record.billingSource || storyTicket.estimateHours !== record.estimateHours || storyTicket.remainingHours !== record.remainingHours || storyTicket.netAmount !== record.netAmount || storyTicket.billable !== record.billable) sourceError('Ticketkatalog und Projektstory widersprechen sich bei Typ, Hierarchie, Phase oder Abrechnung.');
    storyTicket.dependencies = [...record.dependencyRefs];
    return { ticketId: record.id, type: record.type, ...producerTicketTypePresentation[record.type], parentId: record.parent, projectStoryRole: 'customer-readable' as const,
      phaseId: record.phaseId, phaseRefs: record.phaseRefs ?? [], billingSource: record.billingSource, estimateHours: record.estimateHours, actualHours: record.actualHours, remainingHours: record.remainingHours, amountEur: record.netAmount, billable: record.billable,
      role: storyTicket.assignee, initialState: ['phase', 'epic', 'story'].includes(record.type) ? 'expanded' as const : 'collapsed' as const };
  });
  const statusValues = [...new Set(canonicalRecords.map((ticket) => ticket.status))];
  const views = ticketCatalog.views.map((view) => {
    const filters = view.allowedFilters.map((field) => ({ id: `FILTER-${field.toUpperCase()}`, label: field === 'type' ? 'Typ' : 'Status', field,
      options: field === 'type' ? ticketTypes.map((type) => ({ value: type.type, label: type.typeLabel })) : statusValues.map((status) => ({ value: status, label: displayStatus(status) })) }));
    const base = { id: view.id, label: view.title, order: view.order, initialState: view.initialState, visibleFields: view.visibleFields.map((field) => field === 'id' ? 'key' as const : field), filters,
      groups: view.groups.map((group) => ({ id: group.id, phaseTicketId: group.phaseId, label: group.title, order: group.order, initialState: group.initialState, epicIds: group.epicIds, ticketIds: group.ticketIds })) };
    return view.type === 'board'
      ? { ...base, kind: 'board' as const, columns: view.columns.map((column) => ({ id: column.id, label: column.title, order: column.order, initialState: 'expanded' as const, statuses: column.statuses })) }
      : { ...base, kind: 'list' as const, columns: [] };
  });
  return validatePresentationContract({ schemaVersion: 1, contractId: 'UABC-TWIN-PRESENTATION-V1', projectId: 'bc-basic', spaces, jira: { canonicalTicketCount: canonicalRecords.length, ticketTypes, tickets, views } }, {
    ticketTypes: new Map(story.tickets.map((ticket) => [ticket.id, ticket.type])), ticketStatuses: new Map(story.tickets.map((ticket) => [ticket.id, ticket.status])),
    ticketWorklogs: new Map(story.tickets.map((ticket) => [ticket.id, { hours: ticket.worklogs.reduce((sum, worklog) => sum + worklog.hours, 0), amountEur: ticket.worklogs.reduce((sum, worklog) => sum + (worklog.cost ?? 0), 0) }])),
    billingTotal: story.controls ? { hours: story.controls.worklogHours, amountEur: story.controls.worklogCost } : undefined, documentIds: new Set(catalog.documents.map((document) => document.documentId)),
  });
}

function storyDate(value: unknown) {
  const date = typeof value === 'string' ? value.slice(0, 10) : '';
  return sourceDateSchema.safeParse(date).success ? date : null;
}

function storyStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 100) : [];
}

function storyText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function storyAcceptance(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item && typeof item === 'object' && typeof (item as RecordValue).text === 'string') return [(item as RecordValue).text as string];
    return typeof item === 'string' ? [item] : [];
  }).filter((item) => item.trim()).slice(0, 100);
}

function storyHistory(value: unknown, by: unknown) {
  if (!Array.isArray(value)) return [];
  const events: Array<{ at: string; from: string; to: string; by: string }> = [];
  let previous: string | null = null;
  for (const item of value) {
    const status = item && typeof item === 'object' ? storyText((item as RecordValue).status) : storyText(item);
    const date = item && typeof item === 'object' ? storyDate((item as RecordValue).time) : null;
    if (!status || !date) continue;
    if (previous) events.push({ at: `${date}T00:00:00Z`, from: previous, to: status, by: storyText(by) ?? 'Quelle' });
    previous = status;
  }
  return events;
}

function storyEvidence(value: unknown) {
  if (typeof value === 'string' && value.trim()) return [value];
  return storyStrings(value);
}

function storyActor(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const actor = value as RecordValue;
  const type = actor.type;
  if (typeof actor.displayName !== 'string' || typeof actor.role !== 'string' || !['human', 'spectra-codex', 'playwright', 'system-automation', 'unconfirmed-customer'].includes(String(type))) return null;
  return { displayName: actor.displayName, role: actor.role, type: type as 'human' | 'spectra-codex' | 'playwright' | 'system-automation' | 'unconfirmed-customer' };
}

function projectStoryProjection(reader: CommitBlobReader, source: IndexedProjectSource, sources: readonly IndexedProjectSource[]) {
  const raw = schema(reader.json(source.declaration.path), projectStorySchema);
  const allowedPaths = new Set(sources.map((item) => item.declaration.path));
  const offerRaw = raw.offer;
  const offer = offerRaw && typeof offerRaw.id === 'string' && Array.isArray(offerRaw.versions)
    ? { id: offerRaw.id, currentVersion: Number(offerRaw.currentVersion ?? 0), versions: offerRaw.versions.map((item) => item && typeof item === 'object' ? { version: Number((item as RecordValue).version ?? 0), date: storyDate((item as RecordValue).date), status: storyText((item as RecordValue).status) ?? 'unbekannt', delta: storyText((item as RecordValue).delta) ?? 'Nicht belegt', hours: typeof (item as RecordValue).hours === 'number' ? (item as RecordValue).hours as number : null, cost: typeof (item as RecordValue).cost === 'number' ? (item as RecordValue).cost as number : null } : null).filter(Boolean), plannedHours: typeof offerRaw.planned_hours === 'number' ? offerRaw.planned_hours : null, plannedCost: typeof offerRaw.planned_cost === 'number' ? offerRaw.planned_cost : null, actualHours: typeof offerRaw.actual_hours === 'number' ? offerRaw.actual_hours : null, actualCost: typeof offerRaw.actual_cost === 'number' ? offerRaw.actual_cost : null }
    : null;
  const pages = raw.pages.map((page) => {
    const sourcePath = typeof page.sourcePath === 'string' ? page.sourcePath : null;
    if (!sourcePath || !allowedPaths.has(sourcePath)) sourceError('Eine Storyseite verweist auf einen nicht positivgelisteten Quellpfad.');
    const content = reader.text(sourcePath);
    return { id: String(page.id), title: storyText(page.title) ?? String(page.id), parent: typeof page.parent === 'string' ? page.parent : null, version: typeof page.version === 'number' ? page.version : null, status: storyText(page.status), authorRole: storyText(page.author_role), time: typeof page.time === 'string' && sourceDateTimeSchema.safeParse(page.time).success ? page.time : null, sourcePath, content, references: storyStrings(page.references) };
  });
  const tickets = raw.tickets.map((ticket) => {
    const acceptance = storyAcceptance(ticket.acceptanceCriteria).map((text) => ({ text, fulfilled: true }));
    const comments = Array.isArray(ticket.comments) ? ticket.comments.map((comment, index) => comment && typeof comment === 'object' ? { id: storyText((comment as RecordValue).id) ?? `COMMENT-${index + 1}`, type: storyText((comment as RecordValue).type) ?? 'work', time: storyDate((comment as RecordValue).time), role: storyText((comment as RecordValue).role), actor: storyActor((comment as RecordValue).actor), text: storyText((comment as RecordValue).text) ?? 'Nicht belegt', evidenceRef: storyText((comment as RecordValue).evidenceRef) } : null).filter(Boolean) : [];
    const worklogs = Array.isArray(ticket.worklogs) ? ticket.worklogs.map((worklog) => worklog && typeof worklog === 'object' ? { date: storyDate((worklog as RecordValue).date), role: storyText((worklog as RecordValue).role), actor: storyActor((worklog as RecordValue).actor), hours: typeof (worklog as RecordValue).hours === 'number' ? (worklog as RecordValue).hours as number : 0, cost: typeof (worklog as RecordValue).netAmount === 'number' ? (worklog as RecordValue).netAmount as number : typeof (worklog as RecordValue).cost === 'number' ? (worklog as RecordValue).cost as number : null, activity: storyText((worklog as RecordValue).activity), phase: storyText((worklog as RecordValue).phase) } : null).filter(Boolean) : [];
    const statusHistory = Array.isArray(ticket.statusHistory) ? ticket.statusHistory.map((event) => event && typeof event === 'object' && typeof (event as RecordValue).status === 'string' && typeof (event as RecordValue).time === 'string' ? { status: (event as RecordValue).status as string, time: (event as RecordValue).time as string, actor: storyActor((event as RecordValue).actor) } : null).filter(Boolean) : [];
    return { id: String(ticket.id), type: String(ticket.type ?? 'task'), status: String(ticket.status ?? 'unbekannt'), summary: storyText(ticket.summary) ?? acceptance[0]?.text ?? String(ticket.id), assignee: storyText(ticket.assignee), priority: storyText(ticket.priority), parent: typeof ticket.parent === 'string' ? ticket.parent : null, dependencies: storyStrings(ticket.dependencies), acceptanceCriteria: acceptance, statusHistory, comments, worklogs, evidenceRefs: storyStrings(ticket.evidenceRefs),
      phaseId: storyText(ticket.phaseId), phaseRefs: storyStrings(ticket.phaseRefs), billingSource: ticket.billingSource === 'task-rollup-only' || ticket.billingSource === 'task-worklogs' ? ticket.billingSource : null,
      estimateHours: typeof ticket.estimateHours === 'number' ? ticket.estimateHours : null, remainingHours: typeof ticket.remainingHours === 'number' ? ticket.remainingHours : null, netAmount: typeof ticket.netAmount === 'number' ? ticket.netAmount : null, billable: typeof ticket.billable === 'boolean' ? ticket.billable : null };
  });
  const timeline = raw.timeline.map((event) => ({ id: String(event.id), time: String(event.time), phase: String(event.phase), role: String(event.role), tickets: storyStrings(event.tickets), pages: storyStrings(event.pages), sessions: storyStrings(event.sessions), action: String(event.action), result: String(event.result), evidence: storyEvidence(event.evidence), decision: String(event.decision), nextStep: String(event.nextStep) }));
  const hypercare = raw.hypercare.map((day) => ({ day: Number(day.day), dailyPage: String(day.dailyPage), ticket: String(day.ticket), comment: String(day.comment), priority: String(day.priority), diagnosis: String(day.diagnosis), fix: String(day.fix), retest: String(day.retest), status: String(day.status), decision: String(day.decision), evidence: storyEvidence(day.evidence) }));
  const relations = Array.isArray((raw as RecordValue).relations) ? ((raw as RecordValue).relations as unknown[]).map((relation) => relation && typeof relation === 'object' && typeof (relation as RecordValue).from === 'string' && typeof (relation as RecordValue).to === 'string' ? { from: (relation as RecordValue).from as string, to: (relation as RecordValue).to as string, kind: String((relation as RecordValue).type ?? 'Referenz'), label: storyText((relation as RecordValue).label) } : null).filter(Boolean) : [];
  const controlsRaw = raw.controls;
  const controls = controlsRaw ? { openP1: Number(controlsRaw.openP1 ?? 0), openP2: Number(controlsRaw.openP2 ?? 0), worklogHours: Number(controlsRaw.worklogHours ?? 0), worklogCost: Number(controlsRaw.worklogCost ?? 0), realBcExecution: controlsRaw.realBcExecution === true } : null;
  return storyProjectionSchema.parse({ storyId: raw.storyId, status: raw.status, offer, pages, tickets, timeline, hypercare, relations, controls });
}

function nullableTechnicalStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => technicalId.safeParse(item).success) : [];
}

const spectraReleaseEvidenceSchema = z.object({
  tag: z.object({ name: z.string().min(1), peeledCommit: z.string().regex(fullSha) }).passthrough(),
  payload: z.object({ bundleDigest: z.string().regex(/^[a-f0-9]{64}$/), fileCount: z.number().int().nonnegative(), verifiedGitBlobs: z.number().int().nonnegative(), mismatches: z.number().int().nonnegative() }).passthrough(),
  release: z.object({ version: z.string().min(1) }).passthrough(),
  verification: z.object({ status: z.string().min(1) }).passthrough(),
}).passthrough();

const spectraConformanceEvidenceSchema = z.object({
  status: z.string().min(1),
  spectraRelease: z.string().min(1),
  graphCoverage: z.object({ nativeRelations: z.number().int().nonnegative(), portableEdges: z.number().int().nonnegative(), productDecision: z.string().min(1).optional(), standardizedCoverageMetric: z.boolean().optional(), semantics: z.string().min(1).optional(), coverageRatio: z.number().min(0).max(1).optional() }).passthrough(),
}).passthrough();

const financialStateSchema = z.object({ version: z.number().int().positive(), hours: z.number().nonnegative(), rate: z.number().nonnegative(), amount: z.number().nonnegative(), currency: z.literal('EUR') }).strict();
const spectraProjectReconciliationSchema = z.object({
  schema_version: z.literal(1), contract_version: z.enum(['0.9', '0.10']), record_type: z.literal('project-reconciliation'), reconciliation_id: technicalId,
  product_id: z.literal('spectra'), profile: z.literal('implementation'), classification: z.literal('synthetic-fixture'), synthetic: z.literal(true),
  baseline: financialStateSchema, offer: financialStateSchema, actual: financialStateSchema,
  variance: z.object({ hours: z.number(), rate: z.number(), amount: z.number(), reason_code: z.string().min(1), reason: z.string().min(1).max(4_000) }).strict(),
  truth_boundary: z.object({ owner: z.literal('synthetic-fixture'), source_of_truth: z.literal('synthetic-fixture'), invoice_claim: z.literal(false), productive_activity_claim: z.literal(false), billing_status: z.literal('not-applicable') }).strict(),
}).strict();
const spectraAdapterProvenanceSchema = z.object({
  schema_version: z.literal(1), contract_version: z.enum(['0.9', '0.10']), record_type: z.literal('adapter-provenance'), provenance_id: technicalId,
  product_id: z.literal('spectra'), profile: z.literal('implementation'), classification: z.literal('customer-workspace'), synthetic: z.literal(false),
  source: z.object({ blob_path: z.string().refine(validateContractPath), source_hash: z.string().regex(/^[a-f0-9]{64}$/), source_hash_after: z.string().regex(/^[a-f0-9]{64}$/), media_type: z.literal('application/yaml') }).strict(),
  mapping: z.object({ mapping_id: technicalId, mapping_version: z.string().regex(/^\d+\.\d+\.\d+$/), deterministic: z.literal(true) }).strict(),
  projection: z.object({ projection_path: z.string().refine(validateContractPath), digest_algorithm: z.literal('SHA-256'), projection_digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  source_of_truth: z.object({ owner: z.literal('customer-workspace'), unchanged: z.literal(true) }).strict(),
  write_protection: z.object({ source_mode: z.literal('read-only'), writes_performed: z.literal(false), projection_only: z.literal(true), overwrite_allowed: z.literal(false) }).strict(),
}).strict();
const twinExportArtifactSchema = z.object({ id: technicalId, kindId: technicalId, path: z.string().refine(validateContractPath), selector: z.string().nullable(), format: z.enum(['yaml', 'json', 'json-schema', 'markdown', 'csv', 'png', 'javascript', 'openspec']), required: z.boolean() }).strict();
const twinExportMapSchema = z.object({
  schemaVersion: z.literal(1), contractVersion: z.enum(['0.9', '0.10']), recordType: z.literal('twin-export-map'), mappingId: technicalId,
  mappingVersion: z.string().regex(/^\d+\.\d+\.\d+$/), projectId: z.literal('UABC-BC-BASIC-001'), allowedBranch: z.literal('codex/universaarl-projekt'),
  classification: z.literal('synthetische-projektevidence'), sourceOfTruth: z.literal('exports/project-data/v1/index.yaml'), readOnly: z.literal(true),
  artifacts: z.array(twinExportArtifactSchema).min(1).max(1_000),
}).strict();
const spectra09ConformanceSchema = z.object({
  status: z.literal('passed'), spectraRelease: z.string().regex(/^spectra-v0\.(?:9|10)\.0-alpha\.1$/),
  reconciliation: z.object({ path: z.string().refine(validateContractPath), baselineHours: z.number(), baselineAmount: z.number(), offerHours: z.number(), offerAmount: z.number(), actualHours: z.number(), actualAmount: z.number(), invoiceClaim: z.boolean(), productiveActivityClaim: z.boolean(), officialSpectraValidator: z.literal('passed').optional() }).passthrough(),
  adapterProvenance: z.object({ path: z.string().refine(validateContractPath), sourcePath: z.string().refine(validateContractPath), mappingVersion: z.string(), projectionPath: z.string().refine(validateContractPath), sourceUnchanged: z.boolean(), writesPerformed: z.boolean(), officialSpectraValidator: z.literal('passed').optional() }).passthrough(),
  counts: z.object({ offerVersions: z.number().int(), pages: z.number().int(), tickets: z.number().int(), comments: z.number().int(), worklogs: z.number().int(), hours: z.number(), cost: z.number(), timelineEvents: z.number().int(), hypercareDays: z.number().int(), nativeRelations: z.number().int() }).passthrough(),
}).passthrough();

const v1DemoReadinessSchema = z.object({
  schemaVersion: z.literal(1), classification: z.literal('synthetic-only'), status: z.literal('synthetisch-abgeschlossen'), productResult: z.literal('V1_STANDARDPRODUCT_READY'), result: z.literal('GO_SIMULATION'),
  checks: z.object({ spectraRelease: z.literal('spectra-v0.10.0-alpha.1'), branchContract: z.literal('exports/project-data/v1/index.yaml'), twinArtifactCount: z.literal(108), realBcExecution: z.literal(false), realAcceptance: z.literal('ausserhalb-des-simulationsziels'), externalTransmission: z.literal(false) }).passthrough(),
  v1Acceptance: z.object({
    commercial: z.object({ hours: z.literal(80), rateEur: z.literal(120), amountEur: z.literal(9600), result: z.literal('bestanden') }).passthrough(),
    decisions: z.object({ requiredAreas: z.literal(7), result: z.literal('bestanden') }).passthrough(),
    data: z.object({ templatePairs: z.literal(8), migrationWaves: z.literal(3), result: z.literal('bestanden') }).passthrough(),
    processControls: z.object({ glDifference: z.literal(0), bankDifference: z.literal(0), openP1: z.literal(0), openP2: z.literal(0), result: z.literal('bestanden') }).passthrough(),
    uat: z.object({ cases: z.literal(7), result: z.literal('bestanden-synthetisch') }).passthrough(),
    operators: z.object({ paths: z.literal(4), smokeTest: z.literal('UABC-SMOKE-BCB-OPERATOR-001'), result: z.literal('bestanden-synthetisch') }).passthrough(),
    transition: z.object({ cutover: z.literal('bestanden'), restart: z.literal('bestanden'), hypercareDays: z.literal(3), result: z.literal('bestanden-synthetisch') }).passthrough(),
    deliverables: z.object({ completed: z.literal(9), total: z.literal(9), result: z.literal('bestanden-synthetisch') }).passthrough(),
    contracts: z.object({ spectra: z.literal('BOUND-0.10.0-alpha.1'), snapshot: z.literal('validiert'), twin: z.literal('branch-index-read-only'), result: z.literal('bestanden') }).passthrough(),
  }).strict(),
  realCustomerEntryGate: z.literal('project/bc-basic/phase-2-readiness-gate.yaml'),
}).passthrough();

type SpectraSummary = { title: string; status: string; rationale: string; activity?: string[] };

export function validateV1DemoReadiness(input: unknown): SpectraSummary {
  const value = schema(input, v1DemoReadinessSchema);
  return {
    title: 'BC Basic V1 · Standardprodukt bereit', status: value.status,
    rationale: 'Die vollständige Referenzsimulation ist belegt; eine reale Kundeninstanz beginnt separat am Entry-Gate.',
    activity: ['V1_STANDARDPRODUCT_READY', '9/9 Lieferobjekte · 7 UAT-Fälle · 4 Operatorpfade', 'Cutover und Restart bestanden · 3 Hypercaretage', 'Offene P1/P2: 0/0', 'Realer Kundeneinstieg beginnt separat am belegten Setup-/UAT-Entry-Gate.'],
  };
}

function requiredSource(sources: readonly IndexedProjectSource[], kindId: string) {
  const matches = sources.filter((source) => source.declaration.kindId === kindId);
  if (matches.length !== 1) sourceError('Der Spectra-Projektvertrag ist nicht vollständig und eindeutig positivgelistet.');
  return matches[0];
}

export function validateSetupWaveProjectionContract(input: { projection: unknown; schemaDocument: unknown }): SetupWaveProjection {
  const projection = schema(input.projection, setupWaveProjectionSchema);
  if (!input.schemaDocument || typeof input.schemaDocument !== 'object' || Array.isArray(input.schemaDocument)) sourceError('Das Setup-Wave-1-Schema ist kein gültiges JSON-Schemaobjekt.');
  try {
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(input.schemaDocument as Record<string, unknown>);
    if (!validate(projection)) sourceError('Die Setup-Wave-1-Projektion verletzt ihr versioniertes JSON-Schema.');
  } catch (error) {
    if (error instanceof AdapterSourceError) throw error;
    sourceError('Das Setup-Wave-1-Schema kann nicht sicher kompiliert werden.');
  }
  if (new Set(projection.packages.map((item) => item.packageId)).size !== projection.packages.length || new Set(projection.provenance.map((item) => item.path)).size !== projection.provenance.length) sourceError('Die Setup-Wave-1-Projektion enthält doppelte Pakete oder Provenienzpfade.');
  if (projection.writeGate.writesAuthorized !== projection.writesAuthorized) sourceError('Die Schreibsperre der Setup-Wave-1-Projektion ist widersprüchlich.');
  return projection;
}

function setupWaveProjection(reader: CommitBlobReader, sources: readonly IndexedProjectSource[]) {
  const projectionSources = sources.filter((source) => source.declaration.kindId === 'setup-wave-1-projection');
  const schemaSources = sources.filter((source) => source.declaration.kindId === 'setup-wave-1-projection-schema');
  if (!projectionSources.length && !schemaSources.length) return null;
  if (projectionSources.length !== 1 || schemaSources.length !== 1) sourceError('Setup-Wave-1-Projektion und Schema müssen eindeutig positivgelistet sein.');
  return validateSetupWaveProjectionContract({ projection: reader.json(projectionSources[0].declaration.path), schemaDocument: reader.json(schemaSources[0].declaration.path) });
}

export function validateSpectra09ContractData(input: { release: unknown; conformance: unknown; reconciliation: unknown; provenance: unknown; exportMap: unknown; indexArtifacts: unknown; indexHash: string; projectionHash: string; catalogExtendedIndex?: boolean }) {
  const release = schema(input.release, spectraReleaseEvidenceSchema);
  const conformance = schema(input.conformance, spectra09ConformanceSchema);
  const reconciliation = schema(input.reconciliation, spectraProjectReconciliationSchema);
  const provenance = schema(input.provenance, spectraAdapterProvenanceSchema);
  const exportMap = schema(input.exportMap, twinExportMapSchema);
  const indexArtifacts = schema(input.indexArtifacts, z.array(projectDataArtifactSchema).min(1).max(1_000));
  const summaries = new Map<string, SpectraSummary>();
  const indexHash = input.indexHash; const projectionHash = input.projectionHash;
  if (!/^[a-f0-9]{64}$/.test(indexHash) || !/^[a-f0-9]{64}$/.test(projectionHash)) sourceError('Die berechneten Spectra-Blobdigests sind ungültig.');
  const supportedRelease = release.release.version === '0.9.0-alpha.1' ? { tag: 'spectra-v0.9.0-alpha.1', payloads: 102 } : release.release.version === '0.10.0-alpha.1' ? { tag: 'spectra-v0.10.0-alpha.1', payloads: 110 } : null;
  if (!supportedRelease || release.tag.name !== supportedRelease.tag || conformance.spectraRelease !== release.tag.name) sourceError('Die Spectra-Releasebindung ist widersprüchlich.');
  if (release.payload.fileCount !== supportedRelease.payloads || release.payload.verifiedGitBlobs !== supportedRelease.payloads || release.payload.mismatches !== 0) sourceError('Die Spectra-Releasepayloads sind nicht vollständig bestätigt.');
  if (provenance.source.blob_path !== 'exports/project-data/v1/index.yaml' || provenance.source.source_hash !== provenance.source.source_hash_after || (!input.catalogExtendedIndex && provenance.source.source_hash !== indexHash)) sourceError('Der Quellhash vor oder nach der Spectra-Projektion stimmt nicht mit dem gebundenen Vertragsstand überein.');
  if (provenance.projection.projection_path !== 'exports/project-data/v1/twin-export-map.json' || provenance.projection.projection_digest !== projectionHash) sourceError('Der Projektionsdigest stimmt nicht mit dem commitgebundenen Twin-Export überein.');
  if (exportMap.mappingId !== provenance.mapping.mapping_id || exportMap.mappingVersion !== provenance.mapping.mapping_version) sourceError('Die Mappingversion oder Mappingkennung ist widersprüchlich.');
  const exportedIds = exportMap.artifacts.map((artifact) => artifact.id); const exportedPaths = exportMap.artifacts.map((artifact) => artifact.path);
  if (new Set(exportedIds).size !== exportedIds.length || new Set(exportedPaths).size !== exportedPaths.length) sourceError('Der Twin-Export enthält doppelte Artefaktkennungen oder Pfade.');
  const exportedById = new Map(exportMap.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const expected of indexArtifacts) {
    const actual = exportedById.get(expected.id);
    if (!actual || actual.kindId !== expected.kindId || actual.path !== expected.path || actual.selector !== (expected.selector ?? null) || actual.format !== expected.format || actual.required !== expected.required) sourceError('Der Twin-Export deckt die commitgebundene Index-Allowlist nicht vollständig ab.');
  }
  if (conformance.reconciliation.path !== 'evidence/simulation/project-reconciliation.json' || conformance.reconciliation.baselineHours !== reconciliation.baseline.hours || conformance.reconciliation.baselineAmount !== reconciliation.baseline.amount || conformance.reconciliation.offerHours !== reconciliation.offer.hours || conformance.reconciliation.offerAmount !== reconciliation.offer.amount || conformance.reconciliation.actualHours !== reconciliation.actual.hours || conformance.reconciliation.actualAmount !== reconciliation.actual.amount || conformance.reconciliation.invoiceClaim !== false || conformance.reconciliation.productiveActivityClaim !== false) sourceError('Der Spectra-Projektabgleich ist nicht konsistent bestätigt.');
  if (conformance.adapterProvenance.path !== 'evidence/simulation/adapter-provenance.json' || conformance.adapterProvenance.sourcePath !== provenance.source.blob_path || conformance.adapterProvenance.mappingVersion !== provenance.mapping.mapping_version || conformance.adapterProvenance.projectionPath !== provenance.projection.projection_path || conformance.adapterProvenance.sourceUnchanged !== true || conformance.adapterProvenance.writesPerformed !== false) sourceError('Die Spectra-Adapterprovenienz ist nicht konsistent bestätigt.');
  const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  summaries.set('spectra-project-reconciliation', { title: 'Historische Baseline und synthetischer Projektabgleich', status: 'passed', rationale: reconciliation.variance.reason, activity: [`Historische Baseline: ${number.format(reconciliation.baseline.hours)} Std. · ${number.format(reconciliation.baseline.amount)} EUR`, `Synthetisches Angebot: ${number.format(reconciliation.offer.hours)} Std. · ${number.format(reconciliation.offer.amount)} EUR`, `Synthetisches Ist: ${number.format(reconciliation.actual.hours)} Std. · ${number.format(reconciliation.actual.amount)} EUR`, 'Keine echte Rechnung, Buchung, Zahlung oder produktive Leistung.'] });
  summaries.set('spectra-adapter-provenance', { title: `Twin-Projektion · Mapping ${provenance.mapping.mapping_version}`, status: 'passed', rationale: 'Die Kundeninstanz bleibt die fachlich führende Quelle; der Twin liest ausschließlich und überschreibt keine Quelle.', activity: [`Spectra-Quellhash vor/nach: ${provenance.source.source_hash}`, `Aktueller Indexhash: ${indexHash}`, `Projektionsdigest: ${projectionHash}`, 'Nur-Lesen · keine Schreibvorgänge · kein Überschreiben'] });
  summaries.set('twin-export-map', { title: `${indexArtifacts.length} positivgelistete Snapshotartefakte`, status: 'passed', rationale: `${exportMap.artifacts.length} Exportmetadaten · Mapping ${exportMap.mappingVersion}`, activity: ['Sichere repository-relative Pfade', 'Kundeninstanz bleibt die fachlich führende Quelle', 'Twin liest ausschließlich'] });
  summaries.set('spectra-portable-conformance-evidence', { title: `Spectra ${release.release.version} · Projektabgleich und Twin-Export bestanden`, status: conformance.status, rationale: `${conformance.counts.nativeRelations} native Relationen · Storymengen unverändert`, activity: [`${conformance.counts.offerVersions} Angebote · ${conformance.counts.pages} Seiten · ${conformance.counts.tickets} Tickets`, `${conformance.counts.comments} Kommentare · ${conformance.counts.worklogs} Worklogs`, `${conformance.counts.hours} Std. · ${conformance.counts.cost} EUR`] });
  return summaries;
}

function validateSpectra09Integration(index: ProjectDataIndex, reader: CommitBlobReader, sources: readonly IndexedProjectSource[]) {
  const hasSpectra09 = sources.some((source) => ['spectra-project-reconciliation', 'spectra-adapter-provenance', 'twin-export-map'].includes(source.declaration.kindId));
  if (!hasSpectra09) return new Map<string, SpectraSummary>();
  const releaseSource = requiredSource(sources, 'spectra-release-evidence');
  const conformanceSource = requiredSource(sources, 'spectra-portable-conformance-evidence');
  const reconciliationSource = requiredSource(sources, 'spectra-project-reconciliation');
  const provenanceSource = requiredSource(sources, 'spectra-adapter-provenance');
  const exportMapSource = requiredSource(sources, 'twin-export-map');
  return validateSpectra09ContractData({
    release: selectedYaml(reader, releaseSource), conformance: selectedYaml(reader, conformanceSource), reconciliation: reader.json(reconciliationSource.declaration.path),
    provenance: reader.json(provenanceSource.declaration.path), exportMap: reader.json(exportMapSource.declaration.path), indexArtifacts: index.artifacts,
    indexHash: hash(reader.blob('exports/project-data/v1/index.yaml')), projectionHash: hash(reader.blob(exportMapSource.declaration.path)), catalogExtendedIndex: Boolean(index.documentCatalog),
  });
}

export function spectraEvidenceSummary(kindId: string, value: unknown) {
  if (kindId === 'spectra-release-evidence') {
    const data = schema(value, spectraReleaseEvidenceSchema);
    if (data.payload.fileCount !== data.payload.verifiedGitBlobs || data.payload.mismatches !== 0) sourceError('Die Spectra-Release-Evidence ist nicht vollstaendig bestaetigt.');
    return {
      title: `Spectra ${data.release.version} · ${data.payload.verifiedGitBlobs}/${data.payload.fileCount} Payloads`,
      status: data.verification.status,
      rationale: `Tag ${data.tag.name} · Commit ${data.tag.peeledCommit} · Digest ${data.payload.bundleDigest}`,
    };
  }
  if (kindId === 'spectra-portable-conformance-evidence') {
    const data = schema(value, spectraConformanceEvidenceSchema);
    const decision = data.graphCoverage.productDecision === 'accepted-graph-separation' ? 'Graphtrennung akzeptiert' : data.graphCoverage.semantics === 'explained-native-relations' ? 'Referenzabdeckung erklärt' : 'Referenzabdeckung bestätigt';
    return {
      title: `${data.spectraRelease} · ${decision}`,
      status: data.status,
      rationale: `${data.graphCoverage.nativeRelations} native Relationen · ${data.graphCoverage.portableEdges} portable Kanten · ${data.graphCoverage.coverageRatio !== undefined ? `Abdeckung ${Math.round(data.graphCoverage.coverageRatio * 100)} %` : data.graphCoverage.standardizedCoverageMetric !== undefined ? `Coverage-Metrik ${data.graphCoverage.standardizedCoverageMetric ? 'veröffentlicht' : 'nicht veröffentlicht'}` : 'Abdeckung bestätigt'}`,
    };
  }
  return null;
}

function indexedArtifacts(index: ProjectDataIndex, reader: CommitBlobReader, sources: readonly IndexedProjectSource[]) {
  const artifacts: Artifact[] = [];
  const add = (value: z.input<typeof artifactSchema>) => artifacts.push(sanitizeArtifact(artifactSchema.parse(value)));
  const spectra09Summaries = validateSpectra09Integration(index, reader, sources);
  const storySource = sources.find((source) => source.declaration.kindId === 'project-story-core');
  const canonicalStory = storySource ? schema(reader.json(storySource.declaration.path), projectStorySchema) : null;
  const canonicalPhaseTickets = new Map((canonicalStory?.tickets ?? []).filter((ticket) => ticket.type === 'phase' && typeof ticket.id === 'string').map((ticket) => [ticket.id as string, ticket]));
  for (const source of sources) {
    const { declaration } = source;
    if (declaration.kindId === 'project-story-core') {
      const data = canonicalStory!;
      const offer = data.offer;
      if (offer) {
        const versions = Array.isArray(offer.versions) ? offer.versions : [];
        const versionText = versions.map((item) => item && typeof item === 'object' ? `Version ${String((item as RecordValue).version ?? '?')}: ${String((item as RecordValue).status ?? 'unbekannt')}` : null).filter(Boolean).join(' · ');
        add({ id: typeof offer.id === 'string' ? offer.id : 'UABC-STORY-OFFER', kind: 'document', title: 'Angebot und Ist-Abgleich', status: storyText(offer.status) ?? 'synthetisch abgeschlossen', phase: null, wave: null, workstream: 'Angebot', rationale: versionText || 'Versionierte Angebotsdaten sind im Storyvertrag belegt.', sourceType: 'project-story-offer', documentType: 'project-story-offer', estimateHours: typeof offer.planned_hours === 'number' ? offer.planned_hours : null, actualHours: typeof offer.actual_hours === 'number' ? offer.actual_hours : null, sourcePath: declaration.path });
      }
      for (const page of data.pages) {
        const id = page.id; if (typeof id !== 'string' || !technicalId.safeParse(id).success) continue;
        add({ id, kind: 'document', title: storyText(page.title), status: storyText(page.status), phase: null, wave: null, workstream: 'Seitenbaum', rationale: storyStrings(page.references).join(' · ') || null, parentId: typeof page.parent === 'string' ? page.parent : null, documents: storyStrings(page.references), sourceType: 'project-story-page', documentType: 'project-story-page', owner: storyText(page.author_role), startDate: storyDate(page.time), sourcePath: declaration.path });
      }
      for (const ticket of data.tickets) {
        const id = ticket.id; if (typeof id !== 'string' || !technicalId.safeParse(id).success) continue;
        const kind = ticket.type === 'phase' ? 'phase' : ticket.type === 'epic' ? 'epic' : ticket.type === 'story' ? 'story' : 'task';
        const comments = Array.isArray(ticket.comments) ? ticket.comments.flatMap((item) => item && typeof item === 'object' && typeof (item as RecordValue).text === 'string' ? [(item as RecordValue).text as string] : typeof item === 'string' ? [item] : []) : [];
        const worklogs = Array.isArray(ticket.worklogs) ? ticket.worklogs : [];
        const hours = worklogs.reduce((sum, item) => sum + (item && typeof item === 'object' && typeof (item as RecordValue).hours === 'number' ? (item as RecordValue).hours as number : 0), 0);
        const acceptance = storyAcceptance(ticket.acceptanceCriteria);
        add({ id, kind, title: storyText(ticket.summary) ?? storyText(ticket.title) ?? acceptance[0] ?? id, status: storyText(ticket.status), phase: null, wave: null, workstream: storyStrings(ticket.labels).join(' · ') || null, rationale: acceptance.join(' · ') || null, parentId: typeof ticket.parent === 'string' ? ticket.parent : null, dependencies: storyStrings(ticket.dependencies), evidence: storyStrings(ticket.evidenceRefs), documents: storyStrings(ticket.components), sourceType: `project-story-${ticket.type ?? 'ticket'}`, sourcePhase: storyText(ticket.phase), phaseId: storyText(ticket.phaseId), estimateHours: typeof ticket.estimateHours === 'number' ? ticket.estimateHours : null, actualHours: typeof ticket.actualHours === 'number' ? ticket.actualHours : hours || null, billable: typeof ticket.billable === 'boolean' ? ticket.billable : null, owner: storyText(ticket.assignee), priority: storyText(ticket.priority), activity: comments, startDate: storyDate(ticket.createdAt), dueDate: storyDate(ticket.closedAt), historySynthetic: data.classification === 'synthetic-only', history: storyHistory(ticket.statusHistory, ticket.assignee), sourcePath: declaration.path });
      }
      for (const event of data.timeline) {
        const id = event.id; if (typeof id !== 'string' || !technicalId.safeParse(id).success) continue;
        add({ id, kind: 'document', title: storyText(event.action) ?? 'Projektstory-Ereignis', status: storyText(event.result), phase: null, wave: null, workstream: storyText(event.phase), rationale: [event.decision, event.nextStep].filter((item): item is string => typeof item === 'string').join(' · ') || null, documents: [...storyStrings(event.tickets), ...storyStrings(event.pages)], evidence: storyStrings(event.evidence), sourceType: 'project-story-timeline', documentType: 'project-story-timeline', owner: storyText(event.role), startDate: storyDate(event.time), sourcePath: declaration.path });
      }
      for (const day of data.hypercare) {
        const id = `HYPERCARE-${String(day.day ?? 'unbekannt')}`; const ticket = typeof day.ticket === 'string' ? [day.ticket] : [];
        add({ id, kind: 'document', title: `Hypercare-Tag ${String(day.day ?? '?')}`, status: storyText(day.status), phase: null, wave: null, workstream: 'Hypercare', rationale: [day.diagnosis, day.fix, day.retest, day.decision].filter((item): item is string => typeof item === 'string').join(' · ') || null, documents: ticket, evidence: storyStrings(day.evidence), sourceType: 'project-story-hypercare', documentType: 'project-story-hypercare', priority: storyText(day.priority), sourcePath: declaration.path });
      }
      continue;
    }
    if (declaration.format === 'csv') {
      reader.text(declaration.path);
      add({ id: declaration.id, kind: 'document', title: path.posix.basename(declaration.path), status: null, phase: null, wave: null, workstream: null, rationale: null,
        sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    if (declaration.kindId === 'jira-issues') {
      const data = schema(selectedYaml(reader, source), indexedJiraSchema);
      for (const issue of data.issues) {
        const kind: Artifact['kind'] = issue.type === 'Epic' ? 'epic' : issue.type === 'Story' ? 'story' : issue.type === 'Bug' ? 'bug' : 'task';
        const effort = issue.effort && sourceEffortSchema.safeParse(issue.effort).success ? issue.effort : null;
        add({ id: issue.key, kind, title: issue.summary, status: issue.status ?? null, phase: null, wave: null, workstream: issue.workstream ?? null,
          rationale: issue.acceptanceCriteria?.join(' · ') ?? null, parentId: issue.parent ?? null, dependencies: issue.dependencies ?? [], documents: [...(issue.confluenceRefs ?? []), ...(issue.deliverableIds ?? [])],
          evidence: issue.evidenceRefs ?? [], sourceType: issue.type, sourcePhase: issue.phase ?? null, phaseId: issue.phaseId ?? null, effort,
          estimateHours: issue.plannedBillableHours ?? null, actualHours: issue.actualHours ?? null, billable: issue.billable ?? null, billingWeek: issue.billingWeek ?? null,
          billingStatus: issue.billingStatus ?? null, startDate: issue.startDate ?? null, dueDate: issue.dueDate ?? null, historySynthetic: issue.historySynthetic ?? null,
          history: issue.history ?? [], meetings: issue.transcriptRefs ?? [], deliverables: [], sourcePath: declaration.path });
      }
      continue;
    }
    if (declaration.kindId === 'verification-register') {
      const data = schema(selectedYaml(reader, source), indexedVerificationSchema);
      for (const verification of data.verifications) add({ id: verification.id, kind: 'evidence', title: displayVerificationType(verification.type), status: verification.status ?? null,
        phase: null, wave: null, workstream: null, rationale: verification.evidence ?? null, dependencies: verification.subjectRefs ?? [], sourceType: verification.type, sourcePath: declaration.path });
      continue;
    }
    if (declaration.kindId === 'confluence-page' || declaration.kindId === 'meeting-transcript') {
      const document = indexedMarkdown(reader, source); const data = document.data;
      const id = technicalId.safeParse(data.id).success ? data.id as string : declaration.id;
      const title = typeof data.title === 'string' && data.title.trim() ? data.title : document.heading;
      const status = typeof data.status === 'string' && data.status.trim() ? data.status : null;
      const meetingDate = declaration.kindId === 'meeting-transcript' && sourceDateSchema.safeParse(data.date).success ? data.date as string : null;
      add({ id, kind: 'document', title: title ?? null, status, phase: null, wave: null, workstream: null, rationale: null,
        parentId: technicalId.safeParse(data.parent).success ? data.parent as string : null, dependencies: nullableTechnicalStrings(data.jiraRefs), documents: nullableTechnicalStrings(data.referenceIds),
        evidence: [], sourceType: declaration.kindId, documentType: declaration.kindId, meetingDate, sourcePath: declaration.path });
      continue;
    }
    if (declaration.format === 'markdown') {
      const document = indexedMarkdown(reader, source);
      const operatorHandover = declaration.kindId === 'project-story-readable-handover';
      const activity = operatorHandover ? [
        document.content.includes('UABC-SMOKE-BCB-OPERATOR-001') ? 'Operator-Smoke-Test für ersten Arbeitstag und Hypercare belegt.' : null,
        document.content.includes('Support übernimmt einen Fall nur mit Rolle') ? 'Support-Diagnosepaket mit Rolle, Umgebung, Fehlerbild, Kontrollwerten, Evidence und Rücksetzpunkt belegt.' : null,
      ].filter((item): item is string => item !== null) : [];
      add({ id: declaration.id, kind: 'document', title: document.heading, status: null, phase: null, wave: null, workstream: null, rationale: null,
        activity, sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    if (declaration.format === 'png') continue;
    if (declaration.format === 'json-schema' || declaration.format === 'javascript') {
      reader.text(declaration.path);
      add({ id: declaration.id, kind: 'document', title: path.posix.basename(declaration.path), status: null, phase: null, wave: null, workstream: 'Quellvertrag', rationale: null,
        sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    if (declaration.kindId === 'project-plan') {
      const data = selectedYaml(reader, source); const phases = Array.isArray(data.phases) ? data.phases : [];
      for (const raw of phases) if (raw && typeof raw === 'object') { const item = raw as RecordValue; if (technicalId.safeParse(item.id).success) {
        const id = item.id as string; const canonicalPhase = canonicalPhaseTickets.get(id);
        if (canonicalStory) {
          if (!canonicalPhase) sourceError('Eine Planphase besitzt kein kanonisches Phase-Ticket.');
          validateCanonicalPlanPhase({ id: canonicalPhase.id as string, phaseId: canonicalPhase.phaseId, estimateHours: canonicalPhase.estimateHours }, { id, jiraRef: item.jiraRef, plannedHours: item.plannedBillableHours });
          continue;
        }
        add({ id, kind: 'document', title: typeof item.name === 'string' ? item.name : null, status: null, phase: null, wave: null, workstream: null, rationale: null, phaseId: id,
          sourcePhase: typeof item.name === 'string' ? item.name : null, estimateHours: typeof item.plannedBillableHours === 'number' ? item.plannedBillableHours : null,
          startDate: sourceDateSchema.safeParse(item.startDate).success ? item.startDate as string : null, dueDate: sourceDateSchema.safeParse(item.endDate).success ? item.endDate as string : null,
          sourceType: declaration.kindId, documentType: declaration.kindId, dependencies: nullableTechnicalStrings(item.dependencies),
          ticketRefs: technicalId.safeParse(item.jiraRef).success ? [item.jiraRef as string] : [], sourcePath: declaration.path });
      } }
      continue;
    }
    if (declaration.format !== 'yaml' && declaration.format !== 'json') continue;
    const data = selectedYaml(reader, source);
    if (declaration.kindId === 'synthetic-demo-evidence') {
      const summary = validateV1DemoReadiness(data);
      add({ id: declaration.id, kind: 'document', ...summary, phase: null, wave: null, workstream: 'V1-Abnahme', activity: summary.activity ?? [], sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    const spectraSummary: SpectraSummary | null = spectra09Summaries.get(declaration.kindId) ?? spectraEvidenceSummary(declaration.kindId, data);
    if (spectraSummary) {
      add({ id: declaration.id, kind: 'document', ...spectraSummary, phase: null, wave: null, workstream: 'Spectra',
        activity: spectraSummary.activity ?? [], sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    if (declaration.kindId === 'training-plan' && Array.isArray(data.sessions)) {
      const routines = Array.isArray(data.operatorRoutines) ? data.operatorRoutines.filter((item) => item && typeof item === 'object') as RecordValue[] : [];
      const escalations = Array.isArray(data.escalationOutcomes) ? data.escalationOutcomes.filter((item) => item && typeof item === 'object') as RecordValue[] : [];
      const routineRoles = routines.flatMap((routine) => typeof routine.roleRef === 'string' ? [routine.roleRef] : []);
      for (const raw of data.sessions) if (raw && typeof raw === 'object') {
        const session = raw as RecordValue; const id = session.id; if (!technicalId.safeParse(id).success) continue;
        const activity = [session.positiveCase, session.errorCase, session.retest, session.competencyPass].filter((item): item is string => typeof item === 'string');
        if (activity.length !== 4) sourceError('Ein Operator-Lernpfad ist nicht vollständig belegt.');
        if (id === (data.sessions[0] as RecordValue).id) activity.push(`Operatorroutinen: ${routines.length} · Rollen: ${routineRoles.join(', ')}`, `Eskalationsausgänge: ${escalations.length}`);
        add({ id: id as string, kind: 'document', title: storyText(session.title), status: storyText(session.status), phase: null, wave: null, workstream: 'Kundenbefähigung', rationale: storyText(session.competencyPass), activity,
          sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      }
      continue;
    }
    const families: Array<[string, string, string, string?]> = [
      ['deliverables', 'id', 'title', 'status'], ['decisions', 'id', 'statement', 'status'], ['templates', 'id', 'purpose', 'approvalStatus'],
      ['sessions', 'id', 'title', 'status'], ['scenarios', 'id', 'title'], ['sources', 'id', 'title'], ['worklogs', 'worklogId', 'summary', 'approvalStatus'], ['invoices', 'invoiceId', 'summary', 'status'],
    ];
    if (declaration.kindId === 'data-readiness-check' && Array.isArray(data.templatePairs)) {
      const activity = data.templatePairs.flatMap((raw) => raw && typeof raw === 'object' && typeof (raw as RecordValue).source === 'string' ? [(raw as RecordValue).source as string] : []);
      add({ id: declaration.id, kind: 'document', title: declaration.kindId, status: storyText(data.status), phase: null, wave: null, workstream: 'Datenvorbereitung', rationale: `${activity.length} positivgelistete Datenlieferungen sind beschrieben.`, activity,
        sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    if (declaration.kindId === 'country-company-information-execution-evidence') {
      const evidence = schema(data, z.object({
        evidenceId: technicalId, classification: z.string().min(1).max(160), countryRegion: z.object({ code: z.string().min(1).max(20), readBackPassed: z.literal(true) }).passthrough(),
        companyInformation: z.object({ saved: z.literal(true), readBackPassed: z.literal(true) }).passthrough(), defectRetest: z.object({ defectId: technicalId, status: z.literal('passed'), closed: z.literal(true) }).passthrough(),
      }).passthrough());
      add({ id: declaration.id, kind: 'evidence', title: 'Country/Region DE und Firmendaten bestätigt', status: evidence.defectRetest.status, phase: null, wave: null, workstream: 'BC-Pilot',
        rationale: `Country/Region ${evidence.countryRegion.code} und Company Information wurden gespeichert und commitgebunden erneut gelesen.`, activity: [`Defect ${evidence.defectRetest.defectId} geschlossen und Retest bestanden.`],
        sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    const family = families.find(([key]) => Array.isArray(data[key]));
    if (!family) {
      add({ id: declaration.id, kind: 'document', title: storyText(data.title) ?? storyText(data.displayName) ?? declaration.kindId,
        status: storyText(data.status) ?? storyText(data.validationStatus) ?? storyText(data.bindingStatus), phase: null, wave: null, workstream: 'Quellvertrag', rationale: null,
        sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
      continue;
    }
    for (const raw of data[family[0]] as unknown[]) if (raw && typeof raw === 'object') {
      const item = raw as RecordValue; const id = item[family[1]]; if (!technicalId.safeParse(id).success) continue;
      add({ id: id as string, kind: 'document', title: typeof item[family[2]] === 'string' ? item[family[2]] as string : null,
        status: family[3] && typeof item[family[3]] === 'string' ? item[family[3]] as string : null, phase: null, wave: null, workstream: null, rationale: null,
        sourceType: declaration.kindId, documentType: declaration.kindId, sourcePath: declaration.path });
    }
  }
  const duplicateIds = artifacts.map((item) => item.id).filter((id, position, all) => all.indexOf(id) !== position);
  if (duplicateIds.length) sourceError('Die indexierten Quellen erzeugen doppelte normalisierte Artefakt-IDs.');
  return artifacts;
}

export function validateCanonicalPlanPhase(canonical: { id: string; phaseId: unknown; estimateHours: unknown }, plan: { id: string; jiraRef: unknown; plannedHours: unknown }) {
  if (canonical.id !== plan.id || canonical.phaseId !== canonical.id || plan.jiraRef !== canonical.id || typeof canonical.estimateHours !== 'number' || typeof plan.plannedHours !== 'number' || canonical.estimateHours !== plan.plannedHours) sourceError('Eine Planphase widerspricht dem kanonischen Phase-Ticket.');
}

async function createProjectDataState(projectId: string, repo: string, contract: ProjectSourceContract, options: AdapterReadOptions, before: SourceFingerprint, limits: ReaderLimits): Promise<ProjectState> {
  const { index, reader, sources, manifest } = readProjectDataSources(repo, before.commit, projectId, contract, limits, options.sourceBinding);
  let artifacts = indexedArtifacts(index, reader, sources);
  const documentation = index.documentCatalog ? indexedDocuments(reader, index, sources) : null;
  const documents = documentation?.documents ?? [];
  const storySource = sources.find((source) => source.declaration.kindId === 'project-story-core');
  const story = storySource ? projectStoryProjection(reader, storySource, sources) : null;
  const presentation = documentation && story && index.ticketCatalog ? producerPresentationProjection(index, reader, sources, documentation.catalog, story) : null;
  const setupWave = setupWaveProjection(reader, sources);
  if (presentation && story) {
    const storyTicketById = new Map(story.tickets.map((ticket) => [ticket.id, ticket]));
    artifacts = artifacts.map((artifact) => {
      const ticket = storyTicketById.get(artifact.id);
      return ticket ? { ...artifact, dependencies: [...ticket.dependencies] } : artifact;
    });
  }
  const imageSources = sources.filter((source) => source.declaration.format === 'png');
  const evidenceItems = imageSources.map((source) => ({ id: evidenceIdFor(projectId, reader, source.entry), title: source.declaration.id }));
  const resources = indexedResources(projectId, before.commit, index, reader, sources, artifacts, documents, limits);
  const warnings = [...(before.dirty ? ['Die Arbeitskopie enthält nicht commitgebundene Änderungen; alle dargestellten Fachdaten stammen unverändert aus dem ausgewiesenen Commit.'] : []), ...(!index.artifactCatalog ? ['Der Producer stellt noch keinen kanonischen Ressourcenkatalog bereit. Lieferdateien, Screenshots und Schulungsunterlagen können deshalb nicht sicher geöffnet werden.'] : [])];
  options.testHookAfterRead?.();
  const after = captureSourceFingerprint(repo, options.sourceBinding);
  assertSnapshotBinding(repo, after, options.sourceBinding);
  if (!sameFingerprint(before, after)) sourceError('Die Quellreferenzen haben sich während des Lesens verändert; die Momentaufnahme ist ungültig.', 'QUELLE_WAEHREND_LESEN_GEAENDERT');
  return projectStateSchema.parse({ source: { projectId, branch: safeBranchDisplay(before.branch), commit: before.commit, dirty: before.dirty,
    headFingerprint: before.headFingerprint, indexFingerprint: before.indexFingerprint, statusFingerprint: before.statusFingerprint,
    snapshot: process.env.UABC_BRANCH_COMMIT_CONTRACT === '1' ? null : { schemaVersion: manifest.schemaVersion, producerId: manifest.producerId, producerCommitSha: manifest.producerCommitSha, indexPath: manifest.indexPath, payloadBundleDigest: manifest.payloadBundleDigest, validationStatus: manifest.validationStatus,
      spectraReleaseBinding: { productId: manifest.spectraReleaseBinding.productId, technicalRepositoryName: manifest.spectraReleaseBinding.technicalRepositoryName, repositoryUrl: manifest.spectraReleaseBinding.repositoryUrl, releaseVersion: manifest.spectraReleaseBinding.releaseVersion, releaseTag: manifest.spectraReleaseBinding.releaseTag, tagCommit: manifest.spectraReleaseBinding.tagCommit, manifestPath: manifest.spectraReleaseBinding.manifestPath, manifestSourceCommit: manifest.spectraReleaseBinding.manifestSourceCommit, consumerMode: manifest.spectraReleaseBinding.consumerMode, installableBlueprint: manifest.spectraReleaseBinding.installableBlueprint } }, readAt: new Date().toISOString() },
    artifacts, evidenceItems, resources, documents, story, presentation, setupWave, workstreams: [...new Set(artifacts.flatMap((item) => item.workstream ? [item.workstream] : []))].sort((a, b) => a.localeCompare(b, 'de')),
    gaps: [], warnings, stats: { jira: artifacts.filter((item) => ['epic', 'story', 'task', 'bug'].includes(item.kind)).length,
      changes: artifacts.filter((item) => item.kind === 'change').length, documents: artifacts.filter((item) => item.kind === 'document').length,
      capabilities: artifacts.filter((item) => item.kind === 'capability').length, evidence: artifacts.filter((item) => item.kind === 'evidence').length } });
}

export async function createTwinState(projectId: string, repo: string, options: AdapterReadOptions = {}): Promise<ProjectState> {
  assertProjectId(projectId);
  prepareRepo(repo);
  const limits = tightenLimits(options.limits);
  const before = captureSourceFingerprint(repo, options.sourceBinding);
  assertSnapshotBinding(repo, before, options.sourceBinding);
  if (options.projectDataContract) return createProjectDataState(projectId, repo, options.projectDataContract, options, before, limits);
  const reader = new CommitBlobReader(repo, before.commit, limits);
  reader.preflight();

  const architecture = readArchitecture(reader);
  const capabilities = readCapabilities(reader);
  const jira = readJira(reader);
  const openSpec = readOpenSpec(reader);
  const confluence = readConfluence(reader);
  const evidence = readEvidence(projectId, reader);
  const results = [architecture, capabilities, jira, openSpec, confluence, evidence];
  const artifacts = results.flatMap((item) => item.artifacts).map((artifact) => artifactSchema.parse(artifact)).map(presentArtifact).map(sanitizeArtifact);
  const knownSourceIds = new Set(results.flatMap((item) => [...item.knownIds]));
  const warnings = results.flatMap((item) => item.warnings);
  if (before.dirty && !options.sourceBinding) warnings.unshift('Die Arbeitskopie enthaelt nicht commitgebundene Aenderungen; alle dargestellten Fachdaten stammen unveraendert aus dem ausgewiesenen Commit.');
  const referenced = artifacts.flatMap((artifact) => [...(artifact.parentId ? [artifact.parentId] : []), ...artifact.dependencies, ...artifact.documents, ...artifact.evidence, ...artifact.meetings, ...artifact.deliverables.map((deliverable) => deliverable.id)]);
  const unresolved = [...new Set(referenced.filter((id) => !knownSourceIds.has(id)))];
  if (unresolved.length) warnings.push(`Nicht aufgeloeste Quellreferenzen: ${unresolved.join(', ')}`);
  const duplicateIds = [...new Set(artifacts.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index))];
  if (duplicateIds.length) warnings.push(`Doppelte normalisierte Artefakt-IDs: ${duplicateIds.join(', ')}`);
  const gaps = [
    ...(architecture.actualUnknowns ?? []).map((gap) => `Architektur-Baseline unbekannt: ${redactHostReferences(gap)}.`),
    'Projektkalender und Meilensteine ausserhalb expliziter Jira-Tickettermine sind nicht normalisiert.',
    ...(!artifacts.some((artifact) => artifact.meetings.length || artifact.documentType === 'meeting-transcript') ? ['Keine strukturierten Besprechungstranskripte sind in der Quelle belegt.'] : []),
    ...(!artifacts.some((artifact) => artifact.billable !== null) ? ['Keine strukturierten Abrechnungskennzeichen sind in der Quelle belegt.'] : []),
    'Verrechnungssaetze, Rechnungsbetraege und Rechnungsdokumente werden ohne eigenen Quellenvertrag nicht erzeugt.',
  ];
  const workstreams = [...new Set(artifacts.flatMap((item) => item.workstream ? [item.workstream] : []))].sort((a, b) => a.localeCompare(b, 'de'));

  options.testHookAfterRead?.();
  const after = captureSourceFingerprint(repo, options.sourceBinding);
  assertSnapshotBinding(repo, after, options.sourceBinding);
  if (!sameFingerprint(before, after)) sourceError('Die Quellreferenzen haben sich waehrend des Lesens veraendert; die Momentaufnahme ist ungueltig.', 'QUELLE_WAEHREND_LESEN_GEAENDERT');

  return projectStateSchema.parse({
    source: {
      projectId,
      branch: safeBranchDisplay(before.branch),
      commit: before.commit,
      dirty: before.dirty,
      headFingerprint: before.headFingerprint,
      indexFingerprint: before.indexFingerprint,
      statusFingerprint: before.statusFingerprint,
      readAt: new Date().toISOString(),
    },
    artifacts,
    evidenceItems: evidence.items,
    workstreams,
    gaps,
    warnings,
    stats: {
      jira: jira.artifacts.length,
      changes: openSpec.artifacts.length,
      documents: confluence.artifacts.length,
      capabilities: capabilities.artifacts.length,
      evidence: evidence.artifacts.length,
    },
  });
}

export function resolveEvidenceId(projectId: string, repo: string, evidenceId: string, options: Pick<AdapterReadOptions, 'projectDataContract' | 'sourceBinding'> = {}): EvidenceBlob | null {
  if (!/^ev_[a-f0-9]{24}$/.test(evidenceId)) return null;
  try {
    assertProjectId(projectId);
    prepareRepo(repo);
    const before = captureSourceFingerprint(repo, options.sourceBinding);
    assertSnapshotBinding(repo, before, options.sourceBinding);
    if (options.projectDataContract) {
      const { reader, sources } = readProjectDataSources(repo, before.commit, projectId, options.projectDataContract, defaultLimits, options.sourceBinding);
      const match = sources.filter((source) => source.declaration.format === 'png').find((source) => evidenceIdFor(projectId, reader, source.entry) === evidenceId);
      if (!match) return null;
      const bytes = reader.png(match.entry.path);
      const after = captureSourceFingerprint(repo, options.sourceBinding);
      assertSnapshotBinding(repo, after, options.sourceBinding);
      if (!evidenceReadStable(options.projectDataContract !== undefined, sameFingerprint(before, after))) return null;
      return { contentType: 'image/png', bytes: Buffer.from(bytes) };
    }
    const reader = new CommitBlobReader(repo, before.commit, defaultLimits);
    reader.preflight();
    const match = reader.entries.filter(isEvidencePng).find((entry) => evidenceIdFor(projectId, reader, entry) === evidenceId);
    if (!match) return null;
    const bytes = reader.png(match.path);
    const after = captureSourceFingerprint(repo, options.sourceBinding);
    assertSnapshotBinding(repo, after, options.sourceBinding);
    if (!evidenceReadStable(false, sameFingerprint(before, after))) return null;
    return { contentType: 'image/png', bytes: Buffer.from(bytes) };
  } catch (error) {
    if (options.projectDataContract && error instanceof AdapterSourceError) throw error;
    return null;
  }
}

export function resolveResourceId(projectId: string, repo: string, resourceId: string, action: 'preview' | 'download', options: Pick<AdapterReadOptions, 'projectDataContract' | 'sourceBinding'> = {}): ResourceBlob | null {
  if (!/^rs_[a-f0-9]{24}$/.test(resourceId) || !options.projectDataContract) return null;
  try {
    assertProjectId(projectId); prepareRepo(repo);
    const before = captureSourceFingerprint(repo, options.sourceBinding); assertSnapshotBinding(repo, before, options.sourceBinding);
    const limits = defaultLimits; const { index, reader, sources } = readProjectDataSources(repo, before.commit, projectId, options.projectDataContract, limits, options.sourceBinding);
    const artifacts = indexedArtifacts(index, reader, sources); const documents = index.documentCatalog ? indexedDocuments(reader, index, sources).documents : [];
    const resources = indexedResources(projectId, before.commit, index, reader, sources, artifacts, documents, limits); const resource = resources.find((item) => item.id === resourceId);
    if (!resource || (action === 'download' && !resource.downloadable)) return null;
    const catalog = artifactCatalogSchema.parse(reader.json(index.artifactCatalog!.path)); const catalogItem = catalog.resources.find((item) => item.artifactId === resource.artifactId);
    if (!catalogItem) sourceError('Eine Ressource fehlt im validierten Katalog.');
    const source = sources.find((item) => item.declaration.path === catalogItem.path); if (!source) sourceError('Eine Ressource fehlt in der Positivliste.');
    const bytes = reader.blob(source.entry.path); const after = captureSourceFingerprint(repo, options.sourceBinding); assertSnapshotBinding(repo, after, options.sourceBinding);
    evidenceReadStable(true, sameFingerprint(before, after));
    const extension = path.posix.extname(catalogItem.path); const fileName = `${resource.artifactId}${extension}`;
    return { contentType: resource.mediaType, bytes: Buffer.from(bytes), fileName, disposition: action === 'download' || resource.previewMode === 'download' ? 'attachment' : 'inline' };
  } catch (error) {
    if (error instanceof AdapterSourceError) throw error;
    return null;
  }
}

export function evidenceReadStable(contractMode: boolean, stable: boolean) {
  if (!stable && contractMode) sourceError('Die Quellreferenzen haben sich während des Lesens verändert; die Momentaufnahme ist ungültig.', 'QUELLE_WAEHREND_LESEN_GEAENDERT');
  return stable;
}

export const adapterPolicy = { safeRoots, forbidden, defaultLimits };


