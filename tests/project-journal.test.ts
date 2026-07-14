import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { paginateList, type ProjectState } from '../src/model';
import { buildProjectJournal, filterJournalEvents, groupJournalEventsByDay, journalAsOf, journalEventCountSentence, journalSince, journalVisibleText, sortJournalEvents, type JournalEvent } from '../src/project-journal';

const unknownActor = { displayName: null, role: null, type: 'unknown' as const };

function event(id: string, occurredAt: string, overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id,
    occurredAt,
    type: 'status',
    title: id,
    detail: null,
    actor: unknownActor,
    objectId: id,
    objectType: 'ticket',
    before: null,
    after: 'offen',
    references: [],
    referenceStatus: 'none',
    evidenceStatus: 'ohne-evidence',
    approvalStatus: 'keine-freigabeaussage',
    ...overrides,
  };
}

function stateFixture(): ProjectState {
  return {
    source: { projectId: 'bc-basic', branch: 'codex/universaarl-projekt', commit: 'd3d04ee8c4f87e0badc0e92bb95e9c5f676d1435', dirty: false, readAt: '2026-08-20T08:00:00Z' },
    artifacts: [
      { id: 'UABC-1', kind: 'story', title: 'Pilot vorbereiten', status: 'done', history: [], deliverables: [], documents: [], evidence: ['UABC-EV-1'] },
      { id: 'UABC-EV-1', kind: 'evidence', title: 'Retest', status: 'passed', sourcePath: 'evidence/readback.yaml', history: [], deliverables: [], documents: [], evidence: [] },
      { id: 'MTG-CURRENT', kind: 'document', title: 'Aktuelle Pilotbesprechung', status: 'planned', documentType: 'meeting-transcript', meetingDate: '2026-08-22', currentAuthority: true, currentRollupContribution: true, history: [], deliverables: [], documents: [], evidence: [] },
      { id: 'MTG-HISTORICAL', kind: 'document', title: 'Historische Referenzbesprechung', status: 'simulated-complete', documentType: 'meeting-transcript', meetingDate: '2026-05-04', classification: 'historical-reference-simulation', currentAuthority: false, currentRollupContribution: false, history: [], deliverables: [], documents: [], evidence: [] },
    ],
    evidenceItems: [],
    documents: [
      { id: 'DOC-1', title: 'Projektseite', updatedAt: '2026-08-21', status: 'approved', owners: ['Projektleitung'], references: ['UABC-1'] },
      { id: 'DOC-INVALID', title: 'Ungültiger Dokumentstand', updatedAt: 'kein-datum', status: 'draft', owners: [], references: [] },
    ],
    story: {
      pages: [],
      timeline: [{ id: 'TL-1', time: '2026-08-22T09:00:00Z', phase: 'Umsetzung', role: 'Projektleitung', tickets: ['UABC-1'], pages: ['DOC-1'], sessions: [], action: 'Gate geprüft', result: 'Ergebnis belegt', evidence: ['UABC-EV-1'], decision: 'Pilot fortsetzen', nextStep: 'Retest dokumentieren' }],
      tickets: [{
        id: 'UABC-1', evidenceRefs: ['UABC-EV-1'], statusReason: null,
        statusHistory: [
          { status: 'offen', time: '2026-08-20', actor: { displayName: 'Alex Beispiel', role: 'BC Consultant', type: 'human' } },
          { status: 'in Arbeit', time: '2026-08-22', actor: { displayName: 'Workflow', role: 'Prüfautomation', type: 'system-automation' } },
          { status: 'Kundenfreigabe entschieden', time: '2026-08-23', actor: { displayName: 'Workflow', role: 'Prüfautomation', type: 'system-automation' } },
        ],
        comments: [
          { id: 'C-1', time: '2026-08-21', role: 'Fachbereich', actor: null, text: '9.600 EUR geprüft', evidenceRef: 'evidence/readback.yaml' },
          { id: 'C-2', time: null, role: null, actor: null, text: 'Ohne Datum', evidenceRef: null },
          { id: 'C-3', time: '2026-08-22', role: null, actor: null, text: 'Unbekannte Referenz', evidenceRef: 'UABC-UNBEKANNT' },
          { id: 'C-4', time: '2026-08-22', role: 'Fachbereich', actor: { displayName: 'Kim Beispiel', role: 'Fachbereich', type: 'human' }, text: 'Simulationsabnahme bestätigt', evidenceRef: 'UABC-UNBEKANNT' },
        ],
        worklogs: [{ date: '2026-08-22', role: 'BC Consultant', actor: { displayName: 'Alex Beispiel', role: 'BC Consultant', type: 'human' }, hours: 2, cost: 240, activity: 'Konfiguration geprüft', phase: 'Umsetzung' }],
      }],
    },
  } as unknown as ProjectState;
}

describe('commitgebundenes Projekttagebuch', () => {
  it('sortiert gleiche Zeitpunkte stabil nach Ereignistyp, Objekt und ID', () => {
    const values = [
      event('B', '2026-08-20T09:00:00Z', { type: 'worklog' }),
      event('A-2', '2026-08-20T09:00:00Z', { objectId: 'A' }),
      event('A-1', '2026-08-20T09:00:00Z', { objectId: 'A' }),
      event('C', '2026-08-19T09:00:00Z'),
    ];
    expect(sortJournalEvents(values).map((item) => item.id)).toEqual(['C', 'A-1', 'A-2', 'B']);
  });

  it('projiziert belegte Akteure, explizite Statuswerte und ehrliche Diagnosen', () => {
    const journal = buildProjectJournal(stateFixture());
    const firstStatus = journal.events.find((item) => item.id.startsWith('ticket-status:UABC-1'))!;
    const comment = journal.events.find((item) => item.id.includes(':C-1:'))!;
    const unknownActorEvent = journal.events.find((item) => item.id.includes(':C-3:'))!;
    const normalAutomation = journal.events.find((item) => item.after === 'in Arbeit')!;
    const automatedApproval = journal.events.find((item) => item.after === 'Kundenfreigabe entschieden')!;
    const humanApproval = journal.events.find((item) => item.id.includes(':C-4:'))!;
    const documentEvent = journal.events.find((item) => item.objectId === 'DOC-1')!;
    expect(firstStatus).toMatchObject({ before: null, after: 'offen', actor: { displayName: 'Alex Beispiel', role: 'BC Consultant', type: 'human' } });
    expect(comment.before).toBeNull();
    expect(comment.after).toBeNull();
    expect(comment.detail).toBe('Budgetänderung – Details in Abrechnung');
    expect(comment.referenceStatus).toBe('resolved');
    expect(unknownActorEvent.actor.type).toBe('unknown');
    expect(firstStatus.approvalStatus).toBe('keine-freigabeaussage');
    expect(normalAutomation.approvalStatus).toBe('keine-freigabeaussage');
    expect(automatedApproval.approvalStatus).toBe('systemische-aussage');
    expect(humanApproval.approvalStatus).toBe('menschlich-belegt');
    expect(documentEvent.before).toBeNull();
    expect(documentEvent.after).toBe('approved');
    expect(journal.events.some((item) => item.objectId === 'MTG-CURRENT')).toBe(true);
    expect(journal.events.some((item) => item.objectId === 'MTG-HISTORICAL')).toBe(false);
    expect(journal.events.some((item) => item.objectId === 'DOC-INVALID')).toBe(false);
    expect(journal.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ZEIT_FEHLT', objectId: 'UABC-1:C-2' }),
      expect.objectContaining({ code: 'ZEIT_FEHLT', objectId: 'DOC-INVALID' }),
      expect.objectContaining({ code: 'REFERENZ_UNBEKANNT', objectId: 'UABC-1' }),
    ]));
    expect(journal.diagnostics.filter((item) => item.code === 'REFERENZ_UNBEKANNT' && item.objectId === 'UABC-1')).toHaveLength(1);
  });

  it('liefert den belegten Stand vor, zwischen und nach Statuswechseln ohne Dokumentrekonstruktion', () => {
    const values = [
      event('status-1', '2026-08-20', { objectId: 'UABC-1', after: 'offen' }),
      event('status-2', '2026-08-23', { objectId: 'UABC-1', before: 'offen', after: 'erledigt' }),
      event('document', '2026-08-24', { type: 'document', objectId: 'DOC-1', objectType: 'document', before: null, after: 'approved' }),
    ];
    expect(journalAsOf(values, '2026-08-19')).toEqual({ statuses: [], eventCount: 0 });
    expect(journalAsOf(values, '2026-08-21')).toMatchObject({ statuses: [{ objectId: 'UABC-1', status: 'offen' }], eventCount: 1 });
    expect(journalAsOf([...values].reverse(), '2026-08-25')).toMatchObject({ statuses: [{ objectId: 'UABC-1', status: 'erledigt' }], eventCount: 3 });
    expect(journalAsOf(values, '2026-08-25').statuses.some((item) => item.objectId === 'DOC-1')).toBe(false);
  });

  it('formuliert null, ein und mehrere Ereignisse grammatisch korrekt', () => {
    expect(journalEventCountSentence(0)).toBe('0 Ereignisse liegen bis zu diesem Zeitpunkt vor.');
    expect(journalEventCountSentence(1)).toBe('1 Ereignis liegt bis zu diesem Zeitpunkt vor.');
    expect(journalEventCountSentence(2)).toBe('2 Ereignisse liegen bis zu diesem Zeitpunkt vor.');
  });

  it('macht 57 Ereignisse vollständig, duplikatfrei, gefiltert und tageweise erreichbar', () => {
    const values = Array.from({ length: 57 }, (_, index) => event(`E-${String(index + 1).padStart(2, '0')}`, `2026-08-${String(1 + (index % 28)).padStart(2, '0')}`, { type: index % 2 ? 'comment' : 'status', objectType: index % 2 ? 'project' : 'ticket' }));
    const ids = Array.from({ length: 3 }, (_, pageIndex) => paginateList(values, pageIndex + 1, 20).items).flat().map((item) => item.id);
    expect(ids).toHaveLength(57);
    expect(new Set(ids).size).toBe(57);
    expect(ids).toEqual(values.map((item) => item.id));
    const filtered = filterJournalEvents(values, { from: '2026-08-10', to: '2026-08-12', type: 'comment', actor: '', objectType: 'project' });
    expect(filtered.every((item) => item.type === 'comment' && item.objectType === 'project')).toBe(true);
    expect(journalSince(values, '2026-08-27').every((item) => Number(item.occurredAt.slice(-2)) >= 27)).toBe(true);
    expect(groupJournalEventsByDay(sortJournalEvents(values)).flatMap((group) => group.events).map((item) => item.id)).toHaveLength(57);
  });

  it('setzt die Seitenzahl bei jedem Filterwechsel zurück und hält sichtbare Tickettexte geldfrei', () => {
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    const start = ui.indexOf('function ProjectJournal');
    const end = ui.indexOf('function Work', start);
    const journalUi = ui.slice(start, end);
    expect(journalUi).toContain('setPage(1)');
    expect(journalUi).toContain('Vorherige Seite');
    expect(journalUi).toContain('Nächste Seite');
    expect(journalUi).toContain('Seiteninhalte ohne versionierte Historie werden nicht rückwirkend rekonstruiert');
    expect(journalUi).toContain('journal-kpis');
    expect(journalUi).toContain('journal-perspectives');
    expect(journalUi).toContain('Ansicht filtern');
    expect(ui).toContain('Evidence und Verweise');
    expect(journalUi).toContain("group.events.length === 1 ? 'Ereignis' : 'Ereignisse'");
    expect(journalUi).not.toMatch(/(?:journal\.events|filtered|pageData\.items)\.slice\(0,/);
    expect(journalVisibleText('Ticketkosten 9.600 EUR')).toBe('Budgetänderung – Details in Abrechnung');
    expect(journalVisibleText('Ticketkosten 9.600 €')).toBe('Budgetänderung – Details in Abrechnung');
    expect(journalVisibleText('80-Stunden-/9.600-EUR-Baseline')).toBe('Budgetänderung – Details in Abrechnung');
    const journalSource = fs.readFileSync(path.resolve('src/project-journal.ts'), 'utf8');
    const modelSource = fs.readFileSync(path.resolve('src/model.ts'), 'utf8');
    expect(`${journalSource}\n${modelSource}`).not.toMatch(/Ã|Â|â‚/);
    expect(modelSource).toContain('Ungültige Seitengröße.');
  });
});
