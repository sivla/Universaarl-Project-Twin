import { artifactSchema, projectDocumentSchema, projectStateSchema, type PresentationContract, type ProjectState } from '../model';
import { validatePresentationContract } from '../server/adapter';

const ticket = (id: string, type: 'phase' | 'epic' | 'story' | 'bug' | 'task', status: string, summary: string, parent: string | null, priority: string, phaseId: string | null, phaseRefs: string[], estimateHours: number, actualHours: number, billable: boolean, worklogPhase: string | null = null) => ({ story: {
  id, type, status, summary, assignee: 'Projektteam', priority, parent, dependencies: [], phaseId, phaseRefs, billingSource: billable ? 'task-worklogs' : 'task-rollup-only', estimateHours, remainingHours: 0, netAmount: actualHours * 120, billable,
  acceptanceCriteria: [{ text: `${summary} ist in der Simulation nachvollziehbar.`, fulfilled: status === 'done' }],
  statusHistory: [{ status: 'backlog', time: '2026-08-01' }, ...(status === 'backlog' ? [] : [{ status, time: '2026-08-10' }])],
  comments: [{ id: `${id}-COMMENT`, type: status === 'done' ? 'Abschlusskommentar' : 'Arbeitskommentar', time: '2026-08-10', role: 'Projektteam', text: `Fixture-Kommentar für ${id}.`, evidenceRef: 'EVIDENCE-1' }],
  worklogs: billable ? [{ date: '2026-08-10', role: 'Projektteam', hours: actualHours, cost: actualHours * 120, activity: summary, phase: worklogPhase }] : [], evidenceRefs: ['EVIDENCE-1'],
}, presentation: { phaseId, phaseRefs, billingSource: billable ? 'task-worklogs' : 'task-rollup-only', estimateHours, actualHours, remainingHours: 0, amountEur: actualHours * 120, billable } });

const fixtureTicketDefinitions = [
  ticket('UABC-1', 'phase', 'done', 'Phase 1 · Grundlagen', null, 'Hoch', 'UABC-1', ['UABC-1'], 30, 30, false),
  ticket('UABC-2', 'phase', 'done', 'Phase 2 · Prozesse', null, 'Hoch', 'UABC-2', ['UABC-2'], 30, 30, false),
  ticket('UABC-3', 'phase', 'done', 'Phase 3 · Betrieb', null, 'Hoch', 'UABC-3', ['UABC-3'], 20, 20, false),
  ticket('UABC-4', 'epic', 'done', 'Finanzwesen', 'UABC-1', 'Hoch', 'UABC-1', ['UABC-1'], 20, 20, false),
  ticket('UABC-5', 'epic', 'done', 'Einkauf', 'UABC-1', 'Mittel', 'UABC-1', ['UABC-1'], 10, 10, false),
  ticket('UABC-6', 'epic', 'done', 'Steuern', 'UABC-2', 'Hoch', 'UABC-2', ['UABC-2'], 12, 12, false),
  ticket('UABC-7', 'epic', 'done', 'Verkauf', 'UABC-2', 'Mittel', 'UABC-2', ['UABC-2'], 18, 18, false),
  ticket('UABC-8', 'epic', 'done', 'Go-live, Hypercare und Abschluss', 'UABC-3', 'Hoch', 'UABC-3', ['UABC-3'], 20, 20, false),
  ticket('UABC-9', 'story', 'done', 'Finanzbasis einrichten', 'UABC-4', 'Hoch', 'UABC-1', [], 20, 20, false),
  ticket('UABC-10', 'story', 'done', 'Beschaffung durchgängig abbilden', 'UABC-5', 'Mittel', 'UABC-1', [], 10, 10, false),
  ticket('UABC-11', 'story', 'done', 'Steuerlogik prüfen', 'UABC-6', 'Hoch', 'UABC-2', [], 12, 12, false),
  ticket('UABC-12', 'story', 'done', 'Verkaufsprozess durchgängig abbilden', 'UABC-7', 'Mittel', 'UABC-2', [], 18, 18, false),
  ticket('UABC-13', 'story', 'done', 'Betriebsübergang absichern', 'UABC-8', 'Hoch', 'UABC-3', [], 20, 20, false),
  ticket('UABC-19', 'bug', 'done', 'Buchungsabweichung korrigieren', 'UABC-4', 'Hoch', 'UABC-1', [], 0, 0, false),
  ticket('UABC-14', 'task', 'done', 'Buchungsmatrix einrichten', 'UABC-9', 'Mittel', 'UABC-1', [], 20, 20, true, 'Phase 1'),
  ticket('UABC-15', 'task', 'done', 'Bestellprozess konfigurieren', 'UABC-10', 'Mittel', 'UABC-1', [], 10, 10, true, 'Phase 1'),
  ticket('UABC-16', 'task', 'done', 'Steuerlogik retesten', 'UABC-11', 'Mittel', 'UABC-2', [], 12, 12, true, 'Phase 2'),
  ticket('UABC-17', 'task', 'done', 'Verkaufsprozess konfigurieren', 'UABC-12', 'Mittel', 'UABC-2', [], 18, 18, true, 'Phase 2'),
  ticket('UABC-18', 'task', 'done', 'Handover abschließen', 'UABC-13', 'Mittel', 'UABC-3', [], 20, 20, true, 'Phase 3'),
  ticket('UABC-20', 'task', 'done', 'Buchungsabweichung retesten', 'UABC-19', 'Hoch', 'UABC-1', [], 0, 0, true, 'Phase 1'),
] as const;
export const fixtureStoryTickets = fixtureTicketDefinitions.map((item) => item.story);

const ticketTypes = [
  { type: 'phase', typeLabel: 'Phase', displayIconKey: 'phase-flag', displayColorToken: 'slate' },
  { type: 'epic', typeLabel: 'Epic', displayIconKey: 'epic-layers', displayColorToken: 'violet' },
  { type: 'story', typeLabel: 'Story', displayIconKey: 'story-bookmark', displayColorToken: 'violet' },
  { type: 'bug', typeLabel: 'Fehler', displayIconKey: 'bug-mark', displayColorToken: 'red' },
  { type: 'task', typeLabel: 'Aufgabe', displayIconKey: 'task-check', displayColorToken: 'blue' },
] as const;

const fixtureDocuments = [
  { id: 'DOC-PROJECT-ROOT', title: '00 Support und Projektumgebung', documentType: 'support-page', parentId: null, content: '# Support und Projektumgebung\n\n## Schnellstart\n\n- **Ziel:** Arbeitsfähigkeit herstellen\n  - Zugang prüfen\n  - Diagnosepaket vorbereiten\n\n[Prozess öffnen](doc-project-process.md)' },
  { id: 'DOC-PROJECT-PROCESS', title: '01 Unternehmen und Prozesse', documentType: 'process-page', parentId: 'DOC-PROJECT-ROOT', content: '# Unternehmen und Prozesse\n\n## Ablauf\n\n1. Auftrag prüfen\n2. Lieferung buchen\n3. Rechnung kontrollieren\n\n| Kontrolle | Soll |\n| --- | --- |\n| Offene P1 | 0 |' },
  { id: 'DOC-PRODUCT-ROOT', title: 'BC Basic Standardprodukt', documentType: 'product-book', parentId: null, content: '# BC Basic Standardprodukt\n\n> Kundenunabhängiger Leistungsumfang\n\n- [x] Finanzbasis\n- [x] Einkauf und Verkauf\n- [ ] Produktive Parametrisierung' },
  { id: 'DOC-PRODUCT-UAT', title: 'UAT und Abnahme', documentType: 'verification-page', parentId: 'DOC-PRODUCT-ROOT', content: '# UAT und Abnahme\n\n## Ergebnis\n\n```text\nGO_SIMULATION\n```\n\nEvidence: `EVIDENCE-1`' },
  { id: 'DOC-CONSULTANT-ROOT', title: 'Consultant-Handbuch', documentType: 'consultant-handbook', parentId: null, content: '# Consultant-Handbuch\n\n## Lernziel\n\nDie Durchführung bleibt reproduzierbar.\n\n## Übung\n\n- Fixture öffnen\n- Prüfschritt ausführen' },
  { id: 'DOC-CONSULTANT-CUTOVER', title: 'Cutover und Hypercare', documentType: 'cutover-checklist', parentId: 'DOC-CONSULTANT-ROOT', content: '# Cutover und Hypercare\n\n- [x] Cutover-GO geprüft\n- [x] Restart geprüft\n- [x] Handover dokumentiert' },
].map((document, index) => projectDocumentSchema.parse({ ...document, status: 'validated', owners: [], references: [], phase: index < 2 ? 'Projektstart' : null, process: null, updatedAt: '2026-08-10', sourcePath: `fixture/${document.id.toLowerCase()}.md`, externalUrl: null, externalLinkReason: 'Im Fixture ist keine externe URL vorgesehen.' }));

const allTicketIds = fixtureStoryTickets.map((item) => item.id);
const phaseGroups = allTicketIds.slice(0, 3).map((phaseTicketId, order) => ({ id: `GROUP-PHASE-${order + 1}`, phaseTicketId, label: fixtureStoryTickets.find((ticket) => ticket.id === phaseTicketId)!.summary, order, initialState: 'expanded' as const,
  epicIds: fixtureTicketDefinitions.filter(({ story, presentation }) => story.type === 'epic' && presentation.phaseRefs.includes(phaseTicketId)).map(({ story }) => story.id),
  ticketIds: fixtureTicketDefinitions.filter(({ story, presentation }) => story.id === phaseTicketId || (story.type === 'epic' ? presentation.phaseRefs.includes(phaseTicketId) : presentation.phaseId === phaseTicketId)).map(({ story }) => story.id) }));
const filters = [
  { id: 'FILTER-TYPE', label: 'Typ', field: 'type', options: ticketTypes.map((item) => ({ value: item.type, label: item.typeLabel })) },
  { id: 'FILTER-STATUS', label: 'Status', field: 'status', options: [{ value: 'backlog', label: 'Arbeitsvorrat' }, { value: 'in-progress', label: 'In Arbeit' }, { value: 'done', label: 'Erledigt' }] },
  { id: 'FILTER-PRIORITY', label: 'Priorität', field: 'priority', options: ['Hoch', 'Mittel', 'Niedrig'].map((value) => ({ value, label: value })) },
] as const;

export const presentationFixtureInput = {
  schemaVersion: 1, contractId: 'UABC-TWIN-PRESENTATION-V1', projectId: 'bc-basic',
  spaces: [
    { id: 'SPACE-PROJECT', title: 'Kundenprojekt', purpose: 'Kundenzentrierte Projektstory bis Handover', audience: 'Kunde und Projektteam', order: 0, initialState: 'expanded', nodes: [
      { id: 'PROJECT-MODULE', kind: 'module', parentId: null, order: 0, initialState: 'expanded', title: 'Projektstart und Betrieb', purpose: 'Projektwissen bündeln', audience: 'Kunde und Projektteam', documentId: null },
      { id: 'PROJECT-PAGE-SUPPORT', kind: 'page', parentId: 'PROJECT-MODULE', order: 0, initialState: 'expanded', title: '00 Support und Projektumgebung', purpose: 'Arbeitsfähigkeit sichern', audience: 'Kunde und Support', documentId: 'DOC-PROJECT-ROOT' },
      { id: 'PROJECT-PAGE-PROCESS', kind: 'page', parentId: 'PROJECT-MODULE', order: 1, initialState: 'collapsed', title: '01 Unternehmen und Prozesse', purpose: 'Abläufe und Kontrollen verstehen', audience: 'Fachbereich', documentId: 'DOC-PROJECT-PROCESS' },
    ] },
    { id: 'SPACE-PRODUCT', title: 'BC-Basic-Standardprodukt', purpose: 'Kundenunabhängiges Produktbuch', audience: 'Kunde und Solution Architecture', order: 1, initialState: 'collapsed', nodes: [
      { id: 'PRODUCT-MODULE', kind: 'module', parentId: null, order: 0, initialState: 'expanded', title: 'Leistungsumfang', purpose: 'Standardleistung erklären', audience: 'Kunde und Beratung', documentId: null },
      { id: 'PRODUCT-PAGE-ROOT', kind: 'page', parentId: 'PRODUCT-MODULE', order: 0, initialState: 'expanded', title: 'Produktübersicht', purpose: 'Leistungsorientierung geben', audience: 'Kunde', documentId: 'DOC-PRODUCT-ROOT' },
      { id: 'PRODUCT-PAGE-UAT', kind: 'page', parentId: 'PRODUCT-MODULE', order: 1, initialState: 'collapsed', title: 'UAT und Abnahme', purpose: 'Abnahmelogik erklären', audience: 'Key User', documentId: 'DOC-PRODUCT-UAT' },
    ] },
    { id: 'SPACE-CONSULTANT', title: 'Consultant-Handbuch', purpose: 'Interne Durchführungshilfe', audience: 'Consultants', order: 2, initialState: 'collapsed', nodes: [
      { id: 'CONSULTANT-MODULE', kind: 'module', parentId: null, order: 0, initialState: 'collapsed', title: 'Durchführung', purpose: 'Pilotablauf unterstützen', audience: 'Consultants', documentId: null },
      { id: 'CONSULTANT-PAGE-ROOT', kind: 'page', parentId: 'CONSULTANT-MODULE', order: 0, initialState: 'expanded', title: 'Startseite', purpose: 'Arbeitsanweisungen bündeln', audience: 'Consultants', documentId: 'DOC-CONSULTANT-ROOT' },
      { id: 'CONSULTANT-PAGE-CUTOVER', kind: 'page', parentId: 'CONSULTANT-MODULE', order: 1, initialState: 'collapsed', title: 'Cutover und Hypercare', purpose: 'Übergang kontrollieren', audience: 'Consultants', documentId: 'DOC-CONSULTANT-CUTOVER' },
    ] },
  ],
  jira: { canonicalTicketCount: allTicketIds.length, ticketTypes, tickets: fixtureTicketDefinitions.map(({ story, presentation }) => ({ ticketId: story.id, ...ticketTypes.find((entry) => entry.type === story.type)!, parentId: story.parent, projectStoryRole: 'customer-readable', ...presentation, role: story.assignee, initialState: ['phase', 'epic', 'story'].includes(story.type) ? 'expanded' : 'collapsed' })), views: [
    { id: 'VIEW-BOARD', kind: 'board', label: 'Board', order: 0, initialState: 'expanded', visibleFields: ['type', 'key', 'summary', 'priority', 'worklogHours'], filters, groups: phaseGroups, columns: [
      { id: 'COLUMN-BACKLOG', label: 'Arbeitsvorrat', order: 0, initialState: 'expanded', statuses: ['backlog'] },
      { id: 'COLUMN-IN-PROGRESS', label: 'In Arbeit', order: 1, initialState: 'expanded', statuses: ['in-progress'] },
      { id: 'COLUMN-DONE', label: 'Erledigt', order: 2, initialState: 'expanded', statuses: ['done'] },
    ] },
    { id: 'VIEW-LIST', kind: 'list', label: 'Kompakte Liste', order: 1, initialState: 'collapsed', visibleFields: ['type', 'key', 'summary', 'status', 'priority', 'phase', 'role'], filters, groups: phaseGroups, columns: [] },
  ] },
} as const;

const ticketTypesById = new Map(fixtureStoryTickets.map((item) => [item.id, item.type]));
const ticketStatusesById = new Map(fixtureStoryTickets.map((item) => [item.id, item.status]));
const ticketWorklogs = new Map(fixtureStoryTickets.map((item) => [item.id, { hours: item.worklogs.reduce((sum, worklog) => sum + worklog.hours, 0), amountEur: item.worklogs.reduce((sum, worklog) => sum + (worklog.cost ?? 0), 0) }]));
const documentIds = new Set(fixtureDocuments.map((item) => item.id));
export const presentationFixtureContext = { ticketTypes: ticketTypesById, ticketStatuses: ticketStatusesById, ticketWorklogs, billingTotal: { hours: 80, amountEur: 9600 }, documentIds };
export const presentationFixture = validatePresentationContract(presentationFixtureInput, presentationFixtureContext);

const fixtureArtifacts = fixtureStoryTickets.map((item) => artifactSchema.parse({ id: item.id, kind: item.type, title: item.summary, status: item.status, parentId: item.parent, sourceType: `project-story-${item.type}`, priority: item.priority, owner: item.assignee, estimateHours: item.estimateHours, actualHours: item.worklogs.reduce((sum, worklog) => sum + worklog.hours, 0), billable: item.billable, sourcePath: 'fixture/project-story.json' }));

export const presentationFixtureState: ProjectState = projectStateSchema.parse({
  source: { projectId: 'bc-basic', branch: 'fixture/presentation-contract', commit: '1'.repeat(40), dirty: false, headFingerprint: '2'.repeat(64), indexFingerprint: '3'.repeat(64), statusFingerprint: '4'.repeat(64), snapshot: null, readAt: '2026-08-10T12:00:00Z' },
  artifacts: fixtureArtifacts, evidenceItems: [], documents: fixtureDocuments,
  story: { storyId: 'FIXTURE-STORY', status: 'validated', offer: null, pages: [], tickets: fixtureStoryTickets, timeline: [{ id: 'TIMELINE-1', time: '2026-08-10T12:00:00Z', phase: 'Phase 2', role: 'Projektteam', tickets: ['UABC-6', 'UABC-11', 'UABC-16'], pages: [], sessions: [], action: 'Fixture geprüft', result: 'Board und Liste sind darstellbar.', evidence: [], decision: 'Consumervertrag verwenden', nextStep: 'Producer integrieren' }], hypercare: [], relations: [], controls: { openP1: 0, openP2: 0, worklogHours: 80, worklogCost: 9600, realBcExecution: false } },
  presentation: presentationFixture, workstreams: ['Umsetzung'], gaps: [], warnings: ['Lokale Consumerfixture; keine BC-Basic-Fachwahrheit.'], stats: { jira: fixtureStoryTickets.length, changes: 0, documents: fixtureDocuments.length, capabilities: 0, evidence: 0 },
});

export type PresentationFixtureVariant = 'valid' | 'cycle' | 'duplicate-id' | 'duplicate-order' | 'unknown-reference' | 'invalid-initial-state' | 'unknown-icon' | 'unknown-ticket-type' | 'invalid-parent' | 'bug-invalid-parent' | 'nonbillable-task' | 'rollup-mismatch' | 'phase-ref-mismatch' | 'phase-container' | 'wrong-phase-order' | 'phase-billable' | 'epic-without-phase' | 'duplicate-epic-reference' | 'duplicate-task-reference';
export function presentationFixtureVariant(variant: PresentationFixtureVariant): unknown {
  const value = structuredClone(presentationFixtureInput) as any;
  if (variant === 'cycle') { value.spaces[0].nodes[0].parentId = value.spaces[0].nodes[1].id; }
  if (variant === 'duplicate-id') { value.spaces[0].nodes[1].id = value.spaces[0].nodes[0].id; }
  if (variant === 'duplicate-order') { value.spaces[0].nodes[2].order = value.spaces[0].nodes[1].order; }
  if (variant === 'unknown-reference') { value.jira.views[0].groups[0].phaseTicketId = 'UABC-999'; }
  if (variant === 'invalid-initial-state') { value.jira.views[0].initialState = 'open'; }
  if (variant === 'unknown-icon') { value.jira.ticketTypes[0].displayIconKey = 'external-jira-icon'; }
  if (variant === 'unknown-ticket-type') { value.jira.tickets.find((ticket: any) => ticket.type === 'bug').type = 'incident'; }
  if (variant === 'invalid-parent') { value.jira.tickets.find((ticket: any) => ticket.type === 'task').parentId = 'UABC-4'; }
  if (variant === 'bug-invalid-parent') { value.jira.tickets.find((ticket: any) => ticket.type === 'bug').parentId = 'UABC-1'; }
  if (variant === 'nonbillable-task') { value.jira.tickets.find((ticket: any) => ticket.type === 'task').billable = false; }
  if (variant === 'rollup-mismatch') { value.jira.tickets[0].actualHours += 1; }
  if (variant === 'phase-ref-mismatch') { value.jira.tickets.find((ticket: any) => ticket.ticketId === 'UABC-10').phaseId = 'UABC-2'; }
  if (variant === 'phase-container') { value.jira.phases = [{ id: 'PHASE-CONTAINER', label: 'Phase' }]; }
  if (variant === 'wrong-phase-order') { [value.jira.tickets[0], value.jira.tickets[1]] = [value.jira.tickets[1], value.jira.tickets[0]]; }
  if (variant === 'phase-billable') { value.jira.tickets[0].billable = true; }
  if (variant === 'epic-without-phase') { value.jira.tickets.find((ticket: any) => ticket.type === 'epic').parentId = null; }
  if (variant === 'duplicate-epic-reference') { value.jira.views[0].groups[0].epicIds.push(value.jira.views[0].groups[0].epicIds[0]); }
  if (variant === 'duplicate-task-reference') { value.jira.views[0].groups[1].ticketIds.push('UABC-14'); }
  return value;
}
