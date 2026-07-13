import type { ProjectState } from './model';

export type JournalEventType = 'status' | 'comment' | 'worklog' | 'meeting' | 'decision' | 'deliverable' | 'document' | 'timeline';
export type JournalObjectType = 'ticket' | 'meeting' | 'decision' | 'deliverable' | 'document' | 'project';

export type JournalActor = Readonly<{
  displayName: string | null;
  role: string | null;
  type: 'human' | 'spectra-codex' | 'playwright' | 'system-automation' | 'unconfirmed-customer' | 'unknown';
}>;

export type JournalEvent = Readonly<{
  id: string;
  occurredAt: string;
  type: JournalEventType;
  title: string;
  detail: string | null;
  actor: JournalActor;
  objectId: string;
  objectType: JournalObjectType;
  before: string | null;
  after: string | null;
  references: readonly string[];
  referenceStatus: 'resolved' | 'unresolved' | 'none';
  evidenceStatus: 'belegt' | 'ohne-evidence';
  approvalStatus: 'keine-freigabeaussage' | 'systemische-aussage' | 'menschlich-belegt';
}>;

export type JournalDiagnostic = Readonly<{ code: 'ZEIT_FEHLT' | 'REFERENZ_UNBEKANNT'; objectId: string; message: string }>;

const typeOrder: Record<JournalEventType, number> = { status: 0, decision: 1, meeting: 2, timeline: 3, document: 4, deliverable: 5, comment: 6, worklog: 7 };
const moneyPattern = /(?:\d[\d.,]*[\s-]*(?:EUR|€)|(?:EUR|€)[\s-]*\d[\d.,]*)/i;
const approvalPattern = /(?:approval|sign-off|freigabe|abnahme)/i;

function normalizedTimestamp(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  return value;
}

function validTime(value: string | null | undefined): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(normalizedTimestamp(value)));
}

function actor(value: { displayName: string; role: string; type: JournalActor['type'] } | null | undefined, fallbackRole?: string | null): JournalActor {
  return value ? { displayName: value.displayName, role: value.role, type: value.type } : { displayName: null, role: fallbackRole ?? null, type: 'unknown' };
}

export function journalVisibleText(value: string | null | undefined) {
  if (!value) return null;
  return moneyPattern.test(value) ? 'Budgetänderung – Details in Abrechnung' : value;
}

function approvalStatus(values: readonly (string | null | undefined)[], eventActor: JournalActor): JournalEvent['approvalStatus'] {
  if (!values.some((value) => value ? approvalPattern.test(value) : false)) return 'keine-freigabeaussage';
  if (eventActor.type === 'system-automation') return 'systemische-aussage';
  return eventActor.type === 'human' ? 'menschlich-belegt' : 'keine-freigabeaussage';
}

export function sortJournalEvents(events: readonly JournalEvent[]) {
  return [...events].sort((left, right) => Date.parse(normalizedTimestamp(left.occurredAt)) - Date.parse(normalizedTimestamp(right.occurredAt))
    || typeOrder[left.type] - typeOrder[right.type]
    || left.objectId.localeCompare(right.objectId, 'de')
    || left.id.localeCompare(right.id, 'de'));
}

export function buildProjectJournal(state: ProjectState) {
  const events: JournalEvent[] = [];
  const diagnostics: JournalDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const knownIds = new Set([
    ...state.artifacts.map((item) => item.id),
    ...state.documents.map((item) => item.id),
    ...(state.story?.tickets.map((item) => item.id) ?? []),
    ...(state.story?.pages.map((item) => item.id) ?? []),
    ...(state.story?.timeline.map((item) => item.id) ?? []),
  ]);
  const addDiagnostic = (diagnostic: JournalDiagnostic) => {
    const key = `${diagnostic.code}\0${diagnostic.objectId}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(diagnostic);
  };
  const add = (event: Omit<JournalEvent, 'referenceStatus'>) => {
    const referenceStatus = !event.references.length ? 'none' : event.references.every((reference) => knownIds.has(reference) || state.evidenceItems.some((item) => item.id === reference)) ? 'resolved' : 'unresolved';
    if (referenceStatus === 'unresolved') addDiagnostic({ code: 'REFERENZ_UNBEKANNT', objectId: event.objectId, message: 'Mindestens eine Ereignisreferenz ist im validierten Stand nicht auflösbar.' });
    events.push({ ...event, referenceStatus });
  };
  const missingTime = (objectId: string) => addDiagnostic({ code: 'ZEIT_FEHLT', objectId, message: 'Das Ereignis wurde ohne belegtes Datum aus der Zeitpunktprojektion ausgeschlossen.' });

  for (const ticket of state.story?.tickets ?? []) {
    ticket.statusHistory.forEach((entry, index) => {
      if (!validTime(entry.time)) { missingTime(ticket.id); return; }
      const previous = index > 0 ? ticket.statusHistory[index - 1]?.status ?? null : null;
      const eventActor = actor(entry.actor);
      add({ id: `ticket-status:${ticket.id}:${entry.time}:${index}`, occurredAt: entry.time, type: 'status', title: `Status von ${ticket.id}: ${entry.status}`, detail: journalVisibleText(ticket.statusReason), actor: eventActor, objectId: ticket.id, objectType: 'ticket', before: previous, after: entry.status, references: [ticket.id], evidenceStatus: ticket.evidenceRefs.length ? 'belegt' : 'ohne-evidence', approvalStatus: approvalStatus([entry.status, ticket.statusReason], eventActor) });
    });
    ticket.comments.forEach((comment, index) => {
      if (!validTime(comment.time)) { missingTime(`${ticket.id}:${comment.id}`); return; }
      const eventActor = actor(comment.actor, comment.role);
      add({ id: `ticket-comment:${ticket.id}:${comment.id}:${index}`, occurredAt: comment.time, type: 'comment', title: `Kommentar zu ${ticket.id}`, detail: journalVisibleText(comment.text), actor: eventActor, objectId: ticket.id, objectType: 'ticket', before: null, after: null, references: [ticket.id, ...(comment.evidenceRef ? [comment.evidenceRef] : [])], evidenceStatus: comment.evidenceRef ? 'belegt' : 'ohne-evidence', approvalStatus: approvalStatus([comment.text], eventActor) });
    });
    ticket.worklogs.forEach((worklog, index) => {
      if (!validTime(worklog.date)) { missingTime(`${ticket.id}:worklog:${index}`); return; }
      add({ id: `ticket-worklog:${ticket.id}:${worklog.date}:${index}`, occurredAt: worklog.date, type: 'worklog', title: `Arbeitsnachweis zu ${ticket.id}`, detail: journalVisibleText(worklog.activity), actor: actor(worklog.actor, worklog.role), objectId: ticket.id, objectType: 'ticket', before: null, after: null, references: [ticket.id], evidenceStatus: ticket.evidenceRefs.length ? 'belegt' : 'ohne-evidence', approvalStatus: 'keine-freigabeaussage' });
    });
  }

  for (const entry of state.story?.timeline ?? []) {
    if (!validTime(entry.time)) { missingTime(entry.id); continue; }
    const references = [...entry.tickets, ...entry.pages, ...entry.evidence];
    const isDecision = entry.decision.trim().length > 0 && !/^nicht belegt$/i.test(entry.decision.trim());
    add({ id: `timeline:${entry.id}`, occurredAt: entry.time, type: isDecision ? 'decision' : 'timeline', title: `${entry.phase}: ${entry.action}`, detail: journalVisibleText([entry.result, isDecision ? `Entscheidung: ${entry.decision}` : null, entry.nextStep ? `Nächster Schritt: ${entry.nextStep}` : null].filter(Boolean).join(' · ')), actor: actor(null, entry.role), objectId: entry.id, objectType: isDecision ? 'decision' : 'project', before: null, after: null, references, evidenceStatus: entry.evidence.length ? 'belegt' : 'ohne-evidence', approvalStatus: 'keine-freigabeaussage' });
  }

  const documentIds = new Set<string>();
  for (const document of state.documents) {
    if (!validTime(document.updatedAt)) { missingTime(document.id); continue; }
    documentIds.add(document.id);
    add({ id: `document:${document.id}:${document.updatedAt}`, occurredAt: document.updatedAt, type: 'document', title: `Dokumentstand: ${document.title}`, detail: null, actor: actor(null, document.owners.join(', ') || null), objectId: document.id, objectType: 'document', before: null, after: document.status, references: [document.id, ...document.references], evidenceStatus: 'ohne-evidence', approvalStatus: 'keine-freigabeaussage' });
  }
  for (const page of state.story?.pages ?? []) {
    if (documentIds.has(page.id)) continue;
    if (!validTime(page.time)) { missingTime(page.id); continue; }
    add({ id: `story-page:${page.id}:${page.time}`, occurredAt: page.time, type: 'document', title: `Seitenstand: ${page.title}`, detail: null, actor: actor(null, page.authorRole), objectId: page.id, objectType: 'document', before: null, after: page.status, references: [page.id, ...page.references], evidenceStatus: 'ohne-evidence', approvalStatus: 'keine-freigabeaussage' });
  }

  const ticketIds = new Set(state.story?.tickets.map((ticket) => ticket.id) ?? []);
  for (const artifact of state.artifacts) {
    if (ticketIds.has(artifact.id)) continue;
    if (artifact.documentType === 'meeting-transcript') {
      if (!validTime(artifact.meetingDate)) { missingTime(artifact.id); continue; }
      add({ id: `meeting:${artifact.id}:${artifact.meetingDate}`, occurredAt: artifact.meetingDate, type: 'meeting', title: journalVisibleText(artifact.title) ?? artifact.id, detail: journalVisibleText(artifact.rationale), actor: actor(null, artifact.owner), objectId: artifact.id, objectType: 'meeting', before: null, after: artifact.status, references: [artifact.id, ...artifact.documents, ...artifact.evidence], evidenceStatus: artifact.evidence.length ? 'belegt' : 'ohne-evidence', approvalStatus: 'keine-freigabeaussage' });
    }
    artifact.history.forEach((entry, index) => {
      if (!validTime(entry.at)) { missingTime(`${artifact.id}:history:${index}`); return; }
      add({ id: `artifact-status:${artifact.id}:${entry.at}:${index}`, occurredAt: entry.at, type: artifact.deliverables.length ? 'deliverable' : 'status', title: `Status von ${artifact.id}: ${entry.to}`, detail: null, actor: actor(null, entry.by), objectId: artifact.id, objectType: artifact.deliverables.length ? 'deliverable' : 'project', before: entry.from, after: entry.to, references: [artifact.id, ...artifact.documents, ...artifact.evidence], evidenceStatus: artifact.evidence.length ? 'belegt' : 'ohne-evidence', approvalStatus: 'keine-freigabeaussage' });
    });
  }

  return { events: sortJournalEvents(events), diagnostics } as const;
}

export type JournalFilters = Readonly<{ from: string; to: string; type: JournalEventType | ''; actor: string; objectType: JournalObjectType | '' }>;

export function filterJournalEvents(events: readonly JournalEvent[], filters: JournalFilters) {
  const actorFilter = filters.actor.trim().toLocaleLowerCase('de');
  const from = filters.from ? Date.parse(normalizedTimestamp(filters.from)) : Number.NEGATIVE_INFINITY;
  const to = filters.to ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? `${filters.to}T23:59:59.999Z` : filters.to) : Number.POSITIVE_INFINITY;
  return events.filter((event) => {
    const time = Date.parse(normalizedTimestamp(event.occurredAt));
    const actorText = `${event.actor.displayName ?? ''} ${event.actor.role ?? ''}`.toLocaleLowerCase('de');
    return time >= from && time <= to && (!filters.type || event.type === filters.type) && (!filters.objectType || event.objectType === filters.objectType) && (!actorFilter || actorText.includes(actorFilter));
  });
}

export function journalSince(events: readonly JournalEvent[], since: string) {
  if (!validTime(since)) return [];
  const threshold = Date.parse(normalizedTimestamp(since));
  return events.filter((event) => Date.parse(normalizedTimestamp(event.occurredAt)) >= threshold);
}

export function journalAsOf(events: readonly JournalEvent[], asOf: string) {
  if (!validTime(asOf)) return { statuses: [] as Array<{ objectId: string; status: string; occurredAt: string }>, eventCount: 0 };
  const threshold = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T23:59:59.999Z` : asOf);
  const eligible = sortJournalEvents(events.filter((event) => Date.parse(normalizedTimestamp(event.occurredAt)) <= threshold));
  const statuses = new Map<string, { objectId: string; status: string; occurredAt: string }>();
  for (const event of eligible) if (event.type === 'status' && event.after) statuses.set(event.objectId, { objectId: event.objectId, status: event.after, occurredAt: event.occurredAt });
  return { statuses: [...statuses.values()].sort((left, right) => left.objectId.localeCompare(right.objectId, 'de')), eventCount: eligible.length };
}

export function journalEventCountSentence(count: number) {
  return count === 1
    ? '1 Ereignis liegt bis zu diesem Zeitpunkt vor.'
    : `${count} Ereignisse liegen bis zu diesem Zeitpunkt vor.`;
}

export function groupJournalEventsByDay(events: readonly JournalEvent[]) {
  const groups = new Map<string, JournalEvent[]>();
  for (const event of events) {
    const day = new Date(normalizedTimestamp(event.occurredAt)).toISOString().slice(0, 10);
    const values = groups.get(day) ?? [];
    values.push(event);
    groups.set(day, values);
  }
  return [...groups.entries()].map(([day, values]) => ({ day, events: values as readonly JournalEvent[] }));
}
