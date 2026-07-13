import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildCurrentOverview } from '../src/current-overview';
import type { ProjectState } from '../src/model';

function stateFixture() {
  return {
    artifacts: [
      { sourceType: 'deliverable-register', status: 'simulated-complete' },
      { sourceType: 'human-approval', status: 'pending' },
    ],
    story: {
      timeline: [
        { id: 'STORY-01', time: '2026-08-20T09:00:00+02:00', phase: 'Angebot', action: 'Angebot' },
        { id: 'STORY-15', time: '2026-09-03T15:00:00+02:00', phase: 'Handover', action: 'Handover' },
      ],
      offer: { plannedHours: 80, plannedCost: 9600, actualHours: 80, actualCost: 9600 },
      controls: { openP1: 0, openP2: 0 },
    },
  } as unknown as ProjectState;
}

describe('fachlicher aktueller Projektstand', () => {
  it('trennt belegten Simulationsstand von unbekannter Steuerungsabdeckung', () => {
    const overview = buildCurrentOverview(stateFixture());
    expect(overview.latestMilestone).toMatchObject({ phase: 'Handover', action: 'Handover' });
    expect(overview.simulationControls).toEqual({ openP1: 0, openP2: 0 });
    expect(overview.pendingHumanApprovals).toHaveLength(1);
    expect(overview.nextActions).toEqual([]);
    expect(overview.completedTickets).toEqual([]);
    expect(overview.inProgressTickets).toEqual([]);
    expect(overview.nextTickets).toEqual([]);
    expect(overview.blockedTickets).toEqual([]);
    expect(overview.workInventory).toEqual([]);
    expect(overview.budget).toMatchObject({ plannedHours: 80, actualHours: 80, etc: null, eac: null, forecastStatus: null });
  });

  it('erfindet bei fehlendem Storyvertrag weder Nullwerte noch nächste Handlungen', () => {
    const overview = buildCurrentOverview({ artifacts: [], story: null } as unknown as ProjectState);
    expect(overview.latestMilestone).toBeNull();
    expect(overview.simulationControls).toBeNull();
    expect(overview.budget.plannedCost).toBeNull();
    expect(overview.nextActions).toHaveLength(0);
    expect(overview.completedTickets).toEqual([]);
    expect(overview.blockedTickets).toEqual([]);
  });

  it('hält technische Kanalangaben und Rohdetailöffnungen aus der Managementsicht', () => {
    const ui = requireText('../src/main.tsx');
    const start = ui.indexOf('function BusinessOverview');
    const end = ui.indexOf('function Current', start);
    const overviewSource = ui.slice(start, end);
    expect(overviewSource).toContain('Was ist der aktuelle Scope?');
    expect(overviewSource).toContain('Was ist fertig?');
    expect(overviewSource).toContain('Was ist in Arbeit?');
    expect(overviewSource).toContain('Was ist als Nächstes?');
    expect(overviewSource).toContain('Budgetsteuerung');
    expect(overviewSource).toContain('Blockierte Tickets');
    expect(overviewSource).toContain('Arbeitsvorrat');
    expect(overviewSource).not.toContain('.slice(0, 5)');
    expect(overviewSource).not.toContain('Was ist verkauft?');
    expect(overviewSource).not.toContain('belegte Elemente');
    expect(overviewSource).not.toContain('Belegtes Detail öffnen');
    expect(overviewSource).not.toContain('Freigabebranch');
    expect(overviewSource).not.toContain('Arbeitsnachweis');
    expect(overviewSource).not.toContain('EUR`');
    expect(overviewSource).toContain('Verantwortung nicht typisiert');
    expect(overviewSource).not.toContain('Rolle {latest.role}');
    expect(ui).toContain('Firmenname aus BC');
    expect(ui).toContain("'Nicht verifiziert'");
    expect(ui).toContain('Übernommener Repositorywert');
    expect(ui).toContain('nicht als BC-Feldwert bestätigt');
    expect(ui).toContain('Entstehungsweg');
    expect(ui).toContain('Kopie oder Umbenennung');
    expect(ui).toContain('Kundenziel realisiert');
    expect(ui).toContain('Nutzerhinweis, noch nicht bestätigt');
    expect(ui).toContain('Aktueller W0-01-Nur-Lese-Versuch');
    expect(ui).toContain('BC-Readback-Autorität');
    expect(ui).not.toContain('<dt>Beobachteter Name</dt>');
  });
});

  it('projiziert den vollständigen Arbeitsvorrat und blockierte Vorgänge ohne Kürzung', () => {
    const tickets = [
      { id: 'T-DONE', status: 'done', summary: 'Abgeschlossen', parent: null, assignee: null },
      { id: 'T-ACTIVE', status: 'in progress', summary: 'In Arbeit', parent: null, assignee: null },
      { id: 'T-BLOCKED-1', status: 'blocked', statusReason: 'Warten auf Fachentscheidung', summary: 'Blockiert mit Parent', parent: 'EPIC-1', assignee: null },
      { id: 'T-BLOCKED-2', status: 'blockiert', statusReason: '', summary: 'Blockiert ohne Grund', parent: null, assignee: null },
      ...Array.from({ length: 7 }, (_, index) => ({ id: `T-BACKLOG-${index + 1}`, status: index % 2 ? 'backlog' : 'created', summary: `Arbeitsvorrat ${index + 1}`, parent: 'STORY-1', assignee: null })),
    ];
    const overview = buildCurrentOverview({ artifacts: [], story: { tickets } } as unknown as ProjectState);
    expect(overview.completedTickets.map((ticket) => ticket.id)).toEqual(['T-DONE']);
    expect(overview.inProgressTickets.map((ticket) => ticket.id)).toEqual(['T-ACTIVE']);
    expect(overview.blockedTickets.map((ticket) => ticket.id)).toEqual(['T-BLOCKED-1', 'T-BLOCKED-2']);
    expect(overview.blockedTickets.map((ticket) => ticket.parent)).toEqual(['EPIC-1', null]);
    expect(overview.blockedTickets.map((ticket) => ticket.statusReason)).toEqual(['Warten auf Fachentscheidung', '']);
    expect(overview.workInventory.map((ticket) => ticket.id)).toHaveLength(7);
    expect(overview.workInventory.map((ticket) => ticket.id)).toEqual(expect.arrayContaining(['T-BACKLOG-1', 'T-BACKLOG-7']));
    expect(overview.nextTickets).toEqual([]);
    const ui = requireText('../src/main.tsx');
    expect(ui).toContain('Blockiergrund noch nicht dokumentiert');
    expect(ui).toContain('ticket.statusReason?.trim()');
    expect(ui).toContain('Arbeitsvorrat ({overview.workInventory.length})');
    expect(ui).not.toContain('.slice(0, 5)');
  });

function requireText(relativePath: string) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
