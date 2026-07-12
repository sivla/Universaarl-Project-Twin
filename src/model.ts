import { z } from 'zod';

export const phases = ['Strategize', 'Initiate', 'Implement', 'Prepare', 'Operate'] as const;
export const normalizedPhases = [...phases, 'Nicht belegt'] as const;
export const artifactKinds = ['epic', 'story', 'task', 'bug', 'change', 'capability', 'architecture', 'document', 'evidence'] as const;

export const sourceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
export const sourceDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/).refine((value) => !Number.isNaN(Date.parse(value)));
export const sourceEffortSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?[mhd]$/);
export const sourceTechnicalIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/).refine((value) => !/[._-]{2}/.test(value));
export const sourceRelativePathSchema = z.string().min(1).max(1_000).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine((value) => value.split('/').every((segment) => segment && segment !== '.' && segment !== '..'));
export const sourceBillingStatusSchema = z.enum(['not-billable', 'planned', 'ready', 'invoiced']);
export const sourceBillingWeekSchema = z.string().regex(/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/);

export const sourceHistoryEventSchema = z.object({
  at: sourceDateTimeSchema,
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  by: z.string().min(1).max(120),
}).strict();

export const deliverableSchema = z.object({
  id: sourceTechnicalIdSchema,
  type: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/),
  path: sourceRelativePathSchema,
  status: z.string().min(1).max(80),
}).strict();

export const artifactSchema = z.object({
  id: z.string().min(1), kind: z.enum(artifactKinds), title: z.string().min(1).nullable().default(null), status: z.string().min(1).nullable().default(null), phase: z.enum(normalizedPhases).nullable().default(null),
  wave: z.enum(['', 'W0', 'W1', 'W2', 'W3', 'W4', 'W5']).nullable().default(null), workstream: z.string().min(1).nullable().default(null), rationale: z.string().nullable().default(null), parentId: z.string().nullable().default(null),
  dependencies: z.array(z.string()).default([]), documents: z.array(z.string()).default([]), evidence: z.array(z.string()).default([]), ticketRefs: z.array(sourceTechnicalIdSchema).default([]),
  sourceType: z.string().min(1).max(80).nullable().default(null), sourcePhase: z.string().min(1).max(80).nullable().default(null), phaseId: sourceTechnicalIdSchema.nullable().default(null),
  effort: sourceEffortSchema.nullable().default(null), estimateHours: z.number().finite().nonnegative().nullable().default(null), actualHours: z.number().finite().nonnegative().nullable().default(null),
  billable: z.boolean().nullable().default(null), billingWeek: sourceBillingWeekSchema.nullable().default(null), billingStatus: sourceBillingStatusSchema.nullable().default(null),
  startDate: sourceDateSchema.nullable().default(null), dueDate: sourceDateSchema.nullable().default(null),
  historySynthetic: z.boolean().nullable().default(null), history: z.array(sourceHistoryEventSchema).default([]),
  documentType: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/).nullable().default(null), meetingDate: sourceDateSchema.nullable().default(null),
  meetings: z.array(sourceTechnicalIdSchema).default([]), deliverables: z.array(deliverableSchema).default([]),
  owner: z.string().min(1).max(120).nullable().default(null), priority: z.string().min(1).max(40).nullable().default(null),
  activity: z.array(z.string().min(1).max(4_000)).default([]),
  sourcePath: z.string().min(1),
});

export const evidenceItemSchema = z.object({ id: z.string().regex(/^ev_[a-f0-9]{24}$/), title: z.string().min(1) });

export const storyOfferVersionSchema = z.object({ version: z.number().int().positive(), date: sourceDateSchema.nullable(), status: z.string().min(1), delta: z.string().min(1), hours: z.number().nonnegative().nullable(), cost: z.number().nonnegative().nullable() }).strict();
export const storyPageSchema = z.object({ id: sourceTechnicalIdSchema, title: z.string().min(1), parent: sourceTechnicalIdSchema.nullable(), version: z.number().int().positive().nullable(), status: z.string().min(1).nullable(), authorRole: z.string().min(1).nullable(), time: sourceDateTimeSchema.nullable(), sourcePath: sourceRelativePathSchema, content: z.string().max(100_000).nullable(), references: z.array(z.string()).default([]) }).strict();
export const storyAcceptanceSchema = z.object({ text: z.string().min(1), fulfilled: z.boolean().nullable() }).strict();
export const storyCommentSchema = z.object({ id: sourceTechnicalIdSchema, type: z.string().min(1), time: sourceDateSchema.nullable(), role: z.string().min(1).nullable(), text: z.string().min(1), evidenceRef: z.string().nullable() }).strict();
export const storyWorklogSchema = z.object({ date: sourceDateSchema.nullable(), role: z.string().min(1).nullable(), hours: z.number().nonnegative(), cost: z.number().nonnegative().nullable(), activity: z.string().min(1).nullable(), phase: z.string().min(1).nullable() }).strict();
export const storyTicketSchema = z.object({ id: sourceTechnicalIdSchema, type: z.string().min(1), status: z.string().min(1), summary: z.string().min(1), assignee: z.string().nullable(), priority: z.string().nullable(), parent: sourceTechnicalIdSchema.nullable(), dependencies: z.array(z.string()).default([]), acceptanceCriteria: z.array(storyAcceptanceSchema).default([]), statusHistory: z.array(z.object({ status: z.string().min(1), time: sourceDateSchema }).strict()).default([]), comments: z.array(storyCommentSchema).default([]), worklogs: z.array(storyWorklogSchema).default([]), evidenceRefs: z.array(z.string()).default([]) }).strict();
export const storyTimelineSchema = z.object({ id: sourceTechnicalIdSchema, time: sourceDateTimeSchema, phase: z.string().min(1), role: z.string().min(1), tickets: z.array(z.string()).default([]), pages: z.array(z.string()).default([]), sessions: z.array(z.string()).default([]), action: z.string().min(1), result: z.string().min(1), evidence: z.array(z.string()).default([]), decision: z.string().min(1), nextStep: z.string().min(1) }).strict();
export const storyHypercareSchema = z.object({ day: z.number().int().positive(), dailyPage: z.string().min(1), ticket: z.string().min(1), comment: z.string().min(1), priority: z.string().min(1), diagnosis: z.string().min(1), fix: z.string().min(1), retest: z.string().min(1), status: z.string().min(1), decision: z.string().min(1), evidence: z.array(z.string()).default([]) }).strict();
const storyRelationEndpointSchema = z.string().min(1).max(1_000).refine((value) => !value.includes('\\') && !value.startsWith('/') && !value.includes('..') && !/[\u0000-\u001f]/.test(value));
export const storyRelationSchema = z.object({ from: storyRelationEndpointSchema, to: storyRelationEndpointSchema, kind: z.string().min(1), label: z.string().min(1).nullable() }).strict();
export const projectDocumentSchema = z.object({
  id: sourceTechnicalIdSchema, title: z.string().min(1).max(500), documentType: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/), status: z.string().min(1).max(120).nullable(),
  parentId: sourceTechnicalIdSchema.nullable(), owners: z.array(sourceTechnicalIdSchema).max(50), references: z.array(sourceTechnicalIdSchema).max(200),
  phase: z.string().min(1).max(120).nullable(), process: z.string().min(1).max(120).nullable(), updatedAt: sourceDateSchema.nullable(), sourcePath: sourceRelativePathSchema,
  content: z.string().min(1).max(200_000), externalUrl: z.string().url().nullable(), externalLinkReason: z.string().min(1).max(240),
}).strict();
export const storyProjectionSchema = z.object({ storyId: sourceTechnicalIdSchema, status: z.string().min(1), offer: z.object({ id: sourceTechnicalIdSchema, currentVersion: z.number().int().positive(), versions: z.array(storyOfferVersionSchema), plannedHours: z.number().nonnegative().nullable(), plannedCost: z.number().nonnegative().nullable(), actualHours: z.number().nonnegative().nullable(), actualCost: z.number().nonnegative().nullable() }).nullable(), pages: z.array(storyPageSchema), tickets: z.array(storyTicketSchema), timeline: z.array(storyTimelineSchema), hypercare: z.array(storyHypercareSchema), relations: z.array(storyRelationSchema), controls: z.object({ openP1: z.number().int().nonnegative(), openP2: z.number().int().nonnegative(), worklogHours: z.number().nonnegative(), worklogCost: z.number().nonnegative(), realBcExecution: z.boolean() }).nullable() }).strict();

export const projectStateSchema = z.object({
  source: z.object({
    projectId: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/), branch: z.string().min(1).max(120), commit: z.string().regex(/^[a-f0-9]{40}$/), dirty: z.boolean(),
    headFingerprint: z.string().regex(/^[a-f0-9]{64}$/), indexFingerprint: z.string().regex(/^[a-f0-9]{64}$/), statusFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: z.object({ schemaVersion: z.literal(1), producerId: z.literal('blueprint'), producerCommitSha: z.string().regex(/^[a-f0-9]{40}$/), indexPath: sourceRelativePathSchema, payloadBundleDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), validationStatus: z.literal('validated'), spectraReleaseBinding: z.object({ productId: z.literal('spectra'), technicalRepositoryName: z.literal('BCProjectOS'), repositoryUrl: z.literal('https://github.com/sivla/BCProjectOS.git'), releaseVersion: z.string().min(1), releaseTag: z.string().regex(/^spectra-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/), tagCommit: z.string().regex(/^[a-f0-9]{40}$/), manifestPath: sourceRelativePathSchema, manifestSourceCommit: z.string().regex(/^[a-f0-9]{40}$/), consumerMode: z.literal('INSTALLABLE_BLUEPRINT'), installableBlueprint: z.literal(true) }).strict() }).nullable().default(null),
    readAt: z.string().datetime(),
  }),
  artifacts: z.array(artifactSchema), evidenceItems: z.array(evidenceItemSchema), documents: z.array(projectDocumentSchema).default([]), story: storyProjectionSchema.nullable().default(null), workstreams: z.array(z.string()), gaps: z.array(z.string()), warnings: z.array(z.string()),
  stats: z.object({ jira: z.number().int().nonnegative(), changes: z.number().int().nonnegative(), documents: z.number().int().nonnegative(), capabilities: z.number().int().nonnegative(), evidence: z.number().int().nonnegative() }),
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

export type ProjectContext = { projectId: string; projectKey: string; projectName: string };
export type SourceSnapshot = ProjectState['source'];
export type ProjectTimeContext = { readonly unsupported: true };

const germanStatusLabels: Readonly<Record<string, string>> = {
  approved: 'Freigegeben', planned: 'Geplant', deferred: 'Zurückgestellt', passed: 'Bestanden', active: 'Aktiv', proposed: 'Vorgeschlagen',
  done: 'Erledigt', completed: 'Abgeschlossen', ready: 'Bereit', archived: 'Archiviert', documented: 'Dokumentiert', unknown: 'Unbekannt', unbekannt: 'Unbekannt',
  backlog: 'Arbeitsvorrat', blocked: 'Blockiert', created: 'Angelegt', tested: 'Getestet', closed: 'Geschlossen', 'in progress': 'In Arbeit', 'in-progress': 'In Arbeit', 'in review': 'In Prüfung', 'nicht belegt': 'Nicht belegt',
  'v1 kundenbereit': 'V1 kundenbereit', 'synthetisch abgenommen': 'Synthetisch abgenommen', 'kundenbereites standardmuster': 'Kundenbereites Standardmuster',
  'synthetisch abgeschlossen': 'Synthetisch abgeschlossen', 'w0 complete': 'W0 abgeschlossen', 'w0 passed': 'W0 bestanden', 'simulated-complete': 'Synthetisch abgeschlossen', entwurf: 'Entwurf', abgeschlossen: 'Abgeschlossen',
};

export function displayStatus(value: string | null) {
  const sourceValue = value?.trim() ?? '';
  if (!sourceValue) return 'Nicht belegt';
  return germanStatusLabels[sourceValue.toLowerCase()] ?? `Nicht unterstützt (Quellstatus: ${sourceValue})`;
}

const germanBillingStatusLabels: Readonly<Record<string, string>> = {
  'not-billable': 'Nicht abrechenbar', planned: 'Zur Abrechnung geplant', ready: 'Abrechnungsbereit', invoiced: 'Abgerechnet',
};

export function displayBillingStatus(value: string | null) {
  if (!value) return 'Nicht belegt';
  return germanBillingStatusLabels[value] ?? `Nicht unterstützt (Quellabrechnungsstatus: ${value})`;
}

const germanArtifactTypes: Readonly<Record<string, string>> = {
  Epic: 'Epic', Story: 'Story', Task: 'Aufgabe', 'Sub-task': 'Unteraufgabe', Bug: 'Fehler',
  'project-story-epic': 'Story-Epic', 'project-story-story': 'Story', 'project-story-task': 'Story-Aufgabe', 'project-story-bug': 'Story-Fehler',
};

export function displayArtifactType(value: string | null) {
  const sourceValue = value?.trim() ?? '';
  if (!sourceValue) return 'Nicht belegt';
  return germanArtifactTypes[sourceValue] ?? `Nicht unterstützt (Quelltyp: ${sourceValue})`;
}

const germanPhaseLabels: Readonly<Record<typeof normalizedPhases[number], string>> = {
  Strategize: 'Strategie', Initiate: 'Initiierung', Implement: 'Umsetzung', Prepare: 'Vorbereitung', Operate: 'Betrieb', 'Nicht belegt': 'Nicht belegt',
};

export function displayPhase(value: typeof normalizedPhases[number] | null) {
  return value ? germanPhaseLabels[value] : 'Nicht belegt';
}

const germanDocumentTypes: Readonly<Record<string, string>> = {
  'confluence-page': 'Confluence-Seite',
  'openspec-change': 'Änderungsvorschlag',
  requirements: 'Anforderungen',
  'solution-design': 'Lösungsentwurf',
  'delivery-plan': 'Lieferplan',
  'delivery-tasks': 'Lieferaufgaben',
  'verification-plan': 'Prüfplan',
  'synthetic-demo-guide': 'Demo- und Abnahmeleitfaden',
  'project-story-readable-offer': 'Lesbares Angebot',
  'project-story-readable-pages': 'Lesbare Projektseiten',
  'project-story-readable-hypercare': 'Lesbarer Hypercare-Status',
  'project-story-readable-chronicle': 'Projektchronik',
  'project-story-readable-handover': 'Handover-Dokument',
  'commercial-offer': 'Angebot',
  'project-chronicle': 'Projektchronik',
  'project-handover': 'Handover-Dokument',
  'meeting-transcript': 'Besprechungstranskript',
  'project-documentation': 'Projektdokumentation',
  'customer-handbook': 'Kundenhandbuch',
  'consultant-handbook': 'Beraterhandbuch',
  'training-record': 'Schulungsdokumentation',
  'decision-record': 'Entscheidungsdokumentation',
  'project-plan': 'Projektplan',
  budget: 'Budget',
  worklog: 'Arbeitsprotokoll',
  'spectra-release-evidence': 'Spectra-Release-Nachweis',
  'spectra-portable-conformance-evidence': 'Spectra-Konformitätsnachweis',
  'spectra-portable-project-story-schema': 'Spectra-Storyschema',
  'spectra-portable-project-story-adapter': 'Spectra-Storyadapter',
  'spectra-portable-project-story-validator': 'Spectra-Storyvalidator',
  'spectra-portable-project-story-tests': 'Spectra-Storyprüfungen',
  'spectra-project-reconciliation-schema': 'Schema für den Spectra-Projektabgleich',
  'spectra-adapter-provenance-schema': 'Schema für die Spectra-Adapterprovenienz',
  'spectra-project-reconciliation': 'Spectra-Projektabgleich',
  'spectra-adapter-provenance': 'Spectra-Adapterprovenienz',
  'twin-export-map': 'Twin-Exportvertrag',
  'spectra09-integration-generator': 'Spectra-0.9-Integrationsgenerator',
  'spectra09-integration-validator': 'Spectra-0.9-Integrationsvalidator',
  'spectra09-integration-tests': 'Spectra-0.9-Integrationsprüfungen',
  'spectra10-integration-generator': 'Spectra-0.10-Integrationsgenerator',
  'spectra10-integration-validator': 'Spectra-0.10-Integrationsvalidator',
  'spectra10-integration-tests': 'Spectra-0.10-Integrationsprüfungen',
  'spectra-reference-graph-coverage-schema': 'Schema für die Spectra-Referenzabdeckung',
  'spectra-reference-graph-coverage': 'Spectra-Referenzabdeckung',
  'derived-native-reference-graph': 'Nativer Referenzgraph',
  'reference-graph-mapping-rules': 'Abbildungsregeln für Referenzen',
  'portable-reference-graph': 'Portabler Referenzgraph',
};

export function displayDocumentType(value: string | null) {
  if (!value) return 'Nicht belegt';
  return germanDocumentTypes[value] ?? `Nicht unterstützt (Quelldokumenttyp: ${value})`;
}

const germanVerificationTypes: Readonly<Record<string, string>> = {
  'human-approval': 'Menschliche Freigabe',
  'automated-test': 'Automatisierte Prüfung',
  'manual-test': 'Manuelle Prüfung',
  'browser-test': 'Browserprüfung',
  'document-review': 'Dokumentenprüfung',
  'source-validation': 'Quellenprüfung',
  walkthrough: 'Geführter Prüflauf',
  checksum: 'Prüfsumme',
};

export function displayVerificationType(value: string) {
  const sourceValue = value.trim();
  if (!sourceValue) return 'Nicht belegt';
  return germanVerificationTypes[sourceValue.toLowerCase()] ?? `Nicht unterstützt (Quelltyp: ${sourceValue})`;
}

export const uiErrorMessages = {
  PROJEKTLISTE_NICHT_VERFUEGBAR: 'Die konfigurierte Projektliste ist derzeit nicht verfügbar.',
  PROJEKTSTAND_NICHT_VERFUEGBAR: 'Der commitgebundene Projektstand ist derzeit nicht verfügbar.',
  PROJEKTKONTEXT_UNGUELTIG: 'Der Projektstand konnte dem ausgewählten Projekt nicht sicher zugeordnet werden.',
  QUELLE_NICHT_VERFUEGBAR: 'Die konfigurierte Projektquelle ist derzeit nicht verfügbar.',
  SNAPSHOT_VERTRAG_BLOCKIERT: 'Der commitgebundene Quellvertrag ist nicht vollständig bestätigt. Die Projektansicht bleibt gesperrt, bis Repository, Branch, Commit, Index, Allowlist, Referenzen und Digests sicher geprüft sind.',
  PROJEKT_NICHT_GEFUNDEN: 'Das ausgewählte Projekt ist nicht verfügbar.',
} as const;

export type UiErrorCode = keyof typeof uiErrorMessages;

export function uiErrorTitle(code: UiErrorCode) {
  return code === 'SNAPSHOT_VERTRAG_BLOCKIERT' ? 'Commitgebundener Quellvertrag blockiert' : 'Quelle nicht verfügbar';
}

export function uiErrorCodeFromBody(body: unknown, fallback: UiErrorCode): UiErrorCode {
  if (!body || typeof body !== 'object' || !('code' in body) || typeof body.code !== 'string') return fallback;
  return Object.prototype.hasOwnProperty.call(uiErrorMessages, body.code) ? body.code as UiErrorCode : fallback;
}

export function uiErrorMessage(code: unknown, fallback: UiErrorCode = 'PROJEKTSTAND_NICHT_VERFUEGBAR') {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(uiErrorMessages, code) ? uiErrorMessages[code as UiErrorCode] : uiErrorMessages[fallback];
}

export type ProjectRequestToken = Readonly<{ projectId: string; sequence: number }>;

export function createProjectRequestGate() {
  let latestSequence = 0;
  return {
    begin(projectId: string): ProjectRequestToken { return Object.freeze({ projectId, sequence: ++latestSequence }); },
    invalidate() { latestSequence += 1; },
    accepts(token: ProjectRequestToken, currentProjectId: string, responseProjectId = token.projectId) {
      return token.sequence === latestSequence && token.projectId === currentProjectId && responseProjectId === currentProjectId;
    },
  };
}

export function projectViewKey(projectId: string, area: string) {
  return `${projectId}\0${area}`;
}

export const renderLimits = Object.freeze({ projects: 24, artifacts: 18, evidenceItems: 8, gaps: 12, sourcePaths: 12, warnings: 12, detailEvidence: 12, detailReferences: 12, historyEvents: 40, rowReferences: 4 });

const publicProjectSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/).refine((value) => !['constructor', 'prototype', '__proto__'].includes(value)),
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/),
  name: z.string().min(1).max(80),
}).strict();

export function projectListFromApiBody(body: unknown) {
  const parsed = z.object({ projects: z.array(publicProjectSchema).min(1).max(renderLimits.projects) }).strict().safeParse(body);
  if (!parsed.success) return null;
  const ids = parsed.data.projects.map((project) => project.id); const keys = parsed.data.projects.map((project) => project.key);
  return new Set(ids).size === ids.length && new Set(keys).size === keys.length ? parsed.data.projects : null;
}

export function boundedList<T>(values: readonly T[], limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Ungültige Darstellungsgrenze.');
  const items = values.slice(0, limit);
  return { items, total: values.length, visible: items.length, limited: items.length < values.length } as const;
}

export function mobileMoreViewportDecision(open: boolean, viewportWidth: number, desktopMediaMatches: boolean) {
  return open && (desktopMediaMatches || viewportWidth > 720) ? 'close-to-main' as const : 'keep' as const;
}

type FocusDocument = { getElementById(id: string): { focus(): void } | null };

export function focusMainAfterMobileMoreNavigation(menuWasOpen: boolean, documentRoot: FocusDocument) {
  if (!menuWasOpen) return false;
  const target = documentRoot.getElementById('main');
  if (!target) return false;
  target.focus();
  return true;
}
