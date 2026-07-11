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
  sourcePath: z.string().min(1),
});

export const evidenceItemSchema = z.object({ id: z.string().regex(/^ev_[a-f0-9]{24}$/), title: z.string().min(1) });

export const projectStateSchema = z.object({
  source: z.object({
    projectId: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/), branch: z.string().min(1).max(120), commit: z.string().regex(/^[a-f0-9]{40}$/), dirty: z.boolean(),
    headFingerprint: z.string().regex(/^[a-f0-9]{64}$/), indexFingerprint: z.string().regex(/^[a-f0-9]{64}$/), statusFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: z.object({ schemaVersion: z.literal(1), producerId: z.literal('blueprint'), producerCommitSha: z.string().regex(/^[a-f0-9]{40}$/), indexPath: sourceRelativePathSchema, payloadBundleDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), validationStatus: z.literal('validated'), spectraReleaseBinding: z.object({ productId: z.literal('spectra'), technicalRepositoryName: z.literal('BCProjectOS'), repositoryUrl: z.literal('https://github.com/sivla/BCProjectOS.git'), releaseVersion: z.string().min(1), releaseTag: z.string().regex(/^spectra-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/), tagCommit: z.string().regex(/^[a-f0-9]{40}$/), manifestPath: sourceRelativePathSchema, manifestSourceCommit: z.string().regex(/^[a-f0-9]{40}$/), consumerMode: z.literal('INSTALLABLE_BLUEPRINT'), installableBlueprint: z.literal(true) }).strict() }).nullable().default(null),
    readAt: z.string().datetime(),
  }),
  artifacts: z.array(artifactSchema), evidenceItems: z.array(evidenceItemSchema), workstreams: z.array(z.string()), gaps: z.array(z.string()), warnings: z.array(z.string()),
  stats: z.object({ jira: z.number().int().nonnegative(), changes: z.number().int().nonnegative(), documents: z.number().int().nonnegative(), capabilities: z.number().int().nonnegative(), evidence: z.number().int().nonnegative() }),
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;

export type ProjectContext = { projectId: string; projectKey: string; projectName: string };
export type SourceSnapshot = ProjectState['source'];
export type ProjectTimeContext = { readonly unsupported: true };

const germanStatusLabels: Readonly<Record<string, string>> = {
  approved: 'Freigegeben', planned: 'Geplant', deferred: 'Zurückgestellt', passed: 'Bestanden', active: 'Aktiv', proposed: 'Vorgeschlagen',
  done: 'Erledigt', completed: 'Abgeschlossen', ready: 'Bereit', archived: 'Archiviert', documented: 'Dokumentiert', unknown: 'Unbekannt', unbekannt: 'Unbekannt',
  backlog: 'Arbeitsvorrat', blocked: 'Blockiert', 'in progress': 'In Arbeit', 'in review': 'In Prüfung', 'nicht belegt': 'Nicht belegt',
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
  'meeting-transcript': 'Besprechungstranskript',
  'project-documentation': 'Projektdokumentation',
  'customer-handbook': 'Kundenhandbuch',
  'consultant-handbook': 'Beraterhandbuch',
  'training-record': 'Schulungsdokumentation',
  'decision-record': 'Entscheidungsdokumentation',
  'project-plan': 'Projektplan',
  budget: 'Budget',
  worklog: 'Arbeitsprotokoll',
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
  SNAPSHOT_VERTRAG_BLOCKIERT: 'Der validierte Spectra-Snapshot ist noch nicht verfügbar. Die Projektansicht bleibt gesperrt, bis Manifest, Quellcommit, Digest und Produktbindung vollständig bestätigt sind.',
  PROJEKT_NICHT_GEFUNDEN: 'Das ausgewählte Projekt ist nicht verfügbar.',
} as const;

export type UiErrorCode = keyof typeof uiErrorMessages;

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
