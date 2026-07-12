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
    expect(overview.budget).toMatchObject({ plannedHours: 80, actualHours: 80, etc: null, eac: null, forecastStatus: null });
  });

  it('erfindet bei fehlendem Storyvertrag weder Nullwerte noch nächste Handlungen', () => {
    const overview = buildCurrentOverview({ artifacts: [], story: null } as unknown as ProjectState);
    expect(overview.latestMilestone).toBeNull();
    expect(overview.simulationControls).toBeNull();
    expect(overview.budget.plannedCost).toBeNull();
    expect(overview.nextActions).toHaveLength(0);
  });

  it('hält technische Kanalangaben und Rohdetailöffnungen aus der Managementsicht', () => {
    const ui = requireText('../src/main.tsx');
    const start = ui.indexOf('function BusinessOverview');
    const end = ui.indexOf('function Current', start);
    const overviewSource = ui.slice(start, end);
    expect(overviewSource).toContain('Was ist der aktuelle Scope?');
    expect(overviewSource).not.toContain('Was ist verkauft?');
    expect(overviewSource).not.toContain('belegte Elemente');
    expect(overviewSource).not.toContain('Belegtes Detail öffnen');
    expect(overviewSource).not.toContain('Freigabebranch');
    expect(overviewSource).not.toContain('Arbeitsnachweis');
    expect(overviewSource).toContain('Verantwortung nicht typisiert');
    expect(overviewSource).not.toContain('Rolle {latest.role}');
  });
});

function requireText(relativePath: string) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
