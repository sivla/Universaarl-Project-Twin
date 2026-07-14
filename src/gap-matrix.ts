import type { ProjectState } from './model';

export type GapMatrixStatus = 'belegt' | 'teilweise belegt' | 'nicht belegt';
export type GapMatrixRow = Readonly<{ id: string; area: string; status: GapMatrixStatus; evidence: string; next: string }>;

const hasSource = (state: ProjectState, test: (value: string) => boolean) => state.artifacts.some((artifact) => test(artifact.sourceType ?? ''));

/** Erzeugt ausschließlich eine Lesesicht auf typisierte Snapshot-Felder. Keine Zeile erzeugt Fachdaten. */
export function buildGapMatrix(state: ProjectState): readonly GapMatrixRow[] {
  const story = state.story;
  const tickets = story?.tickets ?? [];
  const phases = tickets.filter((ticket) => ticket.type === 'phase').length;
  const hasBudget = Boolean(story?.offer && (story.offer.plannedHours !== null || story.offer.plannedCost !== null) || state.artifacts.some((item) => item.documentType === 'budget'));
  const hasWeeklyWorklogs = tickets.some((ticket) => ticket.worklogs.some((worklog) => Boolean(worklog.date)));
  const hasMeetings = tickets.some((ticket) => ticket.comments.some((comment) => /meeting|besprech/i.test(comment.type))) || hasSource(state, (source) => /meeting|transcript|besprech/i.test(source));
  const hasTraining = hasSource(state, (source) => /training|schulung|competenc/i.test(source));
  const hasEvidence = state.evidenceItems.length > 0 || state.artifacts.some((item) => item.evidence.length > 0);
  const hasSpaces = state.presentation?.spaces.length === 3;
  const hasStory = Boolean(story && phases > 0 && tickets.length > 0);
  const hasHistory = tickets.some((ticket) => ticket.statusHistory.length > 0) || state.artifacts.some((item) => item.history.length > 0);
  const hasDelivery = state.artifacts.some((item) => item.deliverables.length > 0) || state.resources.length > 0;
  const hasTimeline = Boolean(story?.timeline.length);
  const hasHypercare = Boolean(story?.hypercare.length);
  const hasSetup = Boolean(state.setupWave);
  const realExecution = Boolean(state.setupWave?.configurationState.wave0ReadbackAttempt.bcReadbackAuthority && state.setupWave.configurationState.writesApplied);
  const row = (id: string, area: string, status: GapMatrixStatus, evidence: string, next: string): GapMatrixRow => ({ id, area, status, evidence, next });
  return [
    row('angebot-auftrag-budget', 'Angebot, Auftrag, Budget und Wochenrechnungen', hasBudget && hasWeeklyWorklogs ? 'teilweise belegt' : hasBudget ? 'teilweise belegt' : 'nicht belegt', hasBudget ? 'Angebots- oder Budgetwerte sind im Snapshot typisiert.' : 'Kein typisiertes Budget im Snapshot.', 'Auftrag und Wochenrechnungen im Producer typisieren.'),
    row('phasen-meilensteine', 'Drei-Phasen-Plan und Meilensteine', phases >= 3 && hasTimeline ? 'belegt' : phases > 0 || hasTimeline ? 'teilweise belegt' : 'nicht belegt', `${phases} kanonische Phase-Tickets, ${story?.timeline.length ?? 0} Meilensteine.`, 'Fehlende Phasen oder Termine im Producer nachweisen.'),
    row('hierarchie-meetings-schulungen', 'Phase → Epic → Story → Task, Meetings und Schulungen', hasStory && hasMeetings && hasTraining ? 'belegt' : hasStory ? 'teilweise belegt' : 'nicht belegt', hasStory ? `${tickets.length} kundenlesbare Tickets; Meetings und Schulungen werden separat geprüft.` : 'Keine vollständige kundenlesbare Ticketstruktur belegt.', 'Meetings und Schulungen als typisierte Quellen bereitstellen.'),
    row('historie-akzeptanz-evidence', 'Statushistorien, Akzeptanz, Deliverables, Transkripte, Kommentare, Worklogs und Evidence', hasHistory && hasEvidence && hasDelivery ? 'belegt' : hasHistory || hasEvidence || hasDelivery ? 'teilweise belegt' : 'nicht belegt', `${state.evidenceItems.length} Evidence und ${state.artifacts.filter((item) => item.deliverables.length > 0).length} Lieferregister-Bezüge.`, 'Fehlende Nachweisfamilien commitgebunden ergänzen.'),
    row('wissensraeume', 'Confluence-Kundenspace, BC-Basic-Produktspace und Consultant-Handbuch', hasSpaces ? 'belegt' : 'nicht belegt', hasSpaces ? 'Drei producerdefinierte Wissensräume sind validiert.' : 'Drei producerdefinierte Wissensräume sind nicht belegt.', 'Katalogisierte Seiten und stabile Seitenidentitäten liefern.'),
    row('durchlauf-betrieb', 'Playthroughs, SIT, UAT, Training, Cutover, GO_SIMULATION, Hypercare, Restart, Monatsabschluss, UStVA, Abschluss und Supportübergabe', hasSetup && hasHypercare ? 'teilweise belegt' : hasSetup || hasHypercare ? 'teilweise belegt' : 'nicht belegt', hasSetup ? `${story?.hypercare.length ?? 0} Hypercare-Tage; BC-Readback und Writes: ${realExecution ? 'belegt' : 'nicht belegt'}.` : 'Kein typisierter Setup-/Betriebsvertrag belegt.', 'Finalen BC-Basic-Snapshot mit realer Evidence abwarten.'),
    row('gates-quellenklassen', 'Gates, Quellenklassifikation und synthetisch abgeschlossen versus real produktiv pending', state.source.catalog?.releaseId && state.source.snapshot?.validationStatus === 'validated' ? 'belegt' : 'nicht belegt', state.source.catalog ? `Release ${state.source.catalog.releaseId}; Read-only und manifestgebunden.` : 'Kein validiertes Release gebunden.', 'Finalen validierten Producerstand binden; Produktivstatus nicht aus Simulation ableiten.'),
  ];
}
