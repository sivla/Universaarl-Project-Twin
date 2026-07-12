import { artifactSchema, projectDocumentSchema, projectStateSchema, type PresentationContract, type ProjectState } from '../model';
import { validatePresentationContract } from '../server/adapter';

const ticket = (id: string, type: string, status: string, summary: string, parent: string | null, priority: string) => ({
  id, type, status, summary, assignee: 'Projektteam', priority, parent, dependencies: [],
  acceptanceCriteria: [{ text: `${summary} ist in der Simulation nachvollziehbar.`, fulfilled: status === 'done' }],
  statusHistory: [{ status: 'backlog', time: '2026-08-01' }, ...(status === 'backlog' ? [] : [{ status, time: '2026-08-10' }])],
  comments: [{ id: `${id}-COMMENT`, type: status === 'done' ? 'Abschlusskommentar' : 'Arbeitskommentar', time: '2026-08-10', role: 'Projektteam', text: `Fixture-Kommentar für ${id}.`, evidenceRef: 'EVIDENCE-1' }],
  worklogs: [{ date: '2026-08-10', role: 'Projektteam', hours: 2, cost: 240, activity: summary, phase: 'Umsetzung' }], evidenceRefs: ['EVIDENCE-1'],
});

export const fixtureStoryTickets = [
  ticket('TICKET-EPIC-1', 'epic', 'backlog', 'Einführung fachlich steuern', null, 'Hoch'),
  ticket('TICKET-STORY-1', 'story', 'in-progress', 'Verkaufsprozess durchgängig abbilden', 'TICKET-EPIC-1', 'Hoch'),
  ticket('TICKET-TASK-1', 'task', 'done', 'Buchungsmatrix einrichten', 'TICKET-STORY-1', 'Mittel'),
  ticket('TICKET-SUBTASK-1', 'subtask', 'done', 'Kontrollwerte dokumentieren', 'TICKET-TASK-1', 'Niedrig'),
  ticket('TICKET-BUG-1', 'bug', 'in-progress', 'Rundungsabweichung korrigieren', 'TICKET-STORY-1', 'Hoch'),
  ticket('TICKET-CHANGE-1', 'change', 'backlog', 'Abnahmeweg anpassen', 'TICKET-STORY-1', 'Mittel'),
] as const;

const ticketTypes = [
  { type: 'epic', typeLabel: 'Epic', displayIconKey: 'epic-layers', displayColorToken: 'violet' },
  { type: 'story', typeLabel: 'Story', displayIconKey: 'story-bookmark', displayColorToken: 'violet' },
  { type: 'task', typeLabel: 'Aufgabe', displayIconKey: 'task-check', displayColorToken: 'blue' },
  { type: 'subtask', typeLabel: 'Unteraufgabe', displayIconKey: 'subtask-branch', displayColorToken: 'light-blue' },
  { type: 'bug', typeLabel: 'Fehler', displayIconKey: 'bug', displayColorToken: 'red' },
  { type: 'change', typeLabel: 'Änderung', displayIconKey: 'change-arrow', displayColorToken: 'turquoise' },
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
const groups = [{ id: 'GROUP-EPIC-1', label: 'Epic: Einführung fachlich steuern', order: 0, initialState: 'expanded', ticketIds: allTicketIds }];
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
  jira: { canonicalTicketCount: allTicketIds.length, ticketTypes, tickets: fixtureStoryTickets.map((item) => ({ ticketId: item.id, ...ticketTypes.find((entry) => entry.type === item.type)!, parentId: item.parent, projectStoryRole: 'customer-readable', phase: 'Umsetzung', role: item.assignee, initialState: ['epic', 'story'].includes(item.type) ? 'expanded' : 'collapsed' })), views: [
    { id: 'VIEW-BOARD', kind: 'board', label: 'Board', order: 0, initialState: 'expanded', visibleFields: ['type', 'key', 'summary', 'priority', 'worklogHours'], filters, groups, columns: [
      { id: 'COLUMN-BACKLOG', label: 'Arbeitsvorrat', order: 0, initialState: 'expanded', statuses: ['backlog'] },
      { id: 'COLUMN-IN-PROGRESS', label: 'In Arbeit', order: 1, initialState: 'expanded', statuses: ['in-progress'] },
      { id: 'COLUMN-DONE', label: 'Erledigt', order: 2, initialState: 'expanded', statuses: ['done'] },
    ] },
    { id: 'VIEW-LIST', kind: 'list', label: 'Kompakte Liste', order: 1, initialState: 'collapsed', visibleFields: ['type', 'key', 'summary', 'status', 'priority', 'phase', 'role'], filters, groups, columns: [] },
  ] },
} as const;

const ticketTypesById = new Map(fixtureStoryTickets.map((item) => [item.id, item.type]));
const ticketStatusesById = new Map(fixtureStoryTickets.map((item) => [item.id, item.status]));
const documentIds = new Set(fixtureDocuments.map((item) => item.id));
export const presentationFixtureContext = { ticketTypes: ticketTypesById, ticketStatuses: ticketStatusesById, documentIds };
export const presentationFixture = validatePresentationContract(presentationFixtureInput, presentationFixtureContext);

const fixtureArtifacts = fixtureStoryTickets.map((item) => artifactSchema.parse({ id: item.id, kind: item.type === 'subtask' ? 'task' : item.type, title: item.summary, status: item.status, parentId: item.parent, sourceType: `project-story-${item.type}`, priority: item.priority, owner: item.assignee, actualHours: 2, sourcePath: 'fixture/project-story.json' }));

export const presentationFixtureState: ProjectState = projectStateSchema.parse({
  source: { projectId: 'bc-basic', branch: 'fixture/presentation-contract', commit: '1'.repeat(40), dirty: false, headFingerprint: '2'.repeat(64), indexFingerprint: '3'.repeat(64), statusFingerprint: '4'.repeat(64), snapshot: null, readAt: '2026-08-10T12:00:00Z' },
  artifacts: fixtureArtifacts, evidenceItems: [], documents: fixtureDocuments,
  story: { storyId: 'FIXTURE-STORY', status: 'validated', offer: null, pages: [], tickets: fixtureStoryTickets, timeline: [{ id: 'TIMELINE-1', time: '2026-08-10T12:00:00Z', phase: 'Umsetzung', role: 'Projektteam', tickets: ['TICKET-EPIC-1', 'TICKET-STORY-1', 'TICKET-TASK-1', 'TICKET-BUG-1'], pages: [], sessions: [], action: 'Fixture geprüft', result: 'Board und Liste sind darstellbar.', evidence: [], decision: 'Consumervertrag verwenden', nextStep: 'Producer integrieren' }], hypercare: [], relations: [], controls: { openP1: 0, openP2: 0, worklogHours: 12, worklogCost: 1440, realBcExecution: false } },
  presentation: presentationFixture, workstreams: ['Umsetzung'], gaps: [], warnings: ['Lokale Consumerfixture; keine BC-Basic-Fachwahrheit.'], stats: { jira: fixtureStoryTickets.length, changes: 0, documents: fixtureDocuments.length, capabilities: 0, evidence: 0 },
});

export type PresentationFixtureVariant = 'valid' | 'cycle' | 'duplicate-id' | 'duplicate-order' | 'unknown-reference' | 'invalid-initial-state' | 'unknown-icon';
export function presentationFixtureVariant(variant: PresentationFixtureVariant): unknown {
  const value = structuredClone(presentationFixtureInput) as any;
  if (variant === 'cycle') { value.spaces[0].nodes[0].parentId = value.spaces[0].nodes[1].id; }
  if (variant === 'duplicate-id') { value.spaces[0].nodes[1].id = value.spaces[0].nodes[0].id; }
  if (variant === 'duplicate-order') { value.spaces[0].nodes[2].order = value.spaces[0].nodes[1].order; }
  if (variant === 'unknown-reference') { value.jira.views[0].groups[0].ticketIds[0] = 'TICKET-UNKNOWN'; }
  if (variant === 'invalid-initial-state') { value.jira.views[0].initialState = 'open'; }
  if (variant === 'unknown-icon') { value.jira.ticketTypes[0].displayIconKey = 'external-jira-icon'; }
  return value;
}
