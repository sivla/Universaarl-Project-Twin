import { describe, expect, it } from 'vitest';
import { artifactSchema, type Artifact } from '../src/model';
import { buildGanttProjection, buildPhasePlan } from '../src/planning/gantt';

function phase(id: string, startDate: string | null, dueDate: string | null, ticketRefs: string[] = []): Artifact {
  return artifactSchema.parse({ id, kind: 'document', title: `Phase ${id}`, sourceType: 'project-plan', phaseId: id, startDate, dueDate, ticketRefs, sourcePath: 'project/bc-basic/project-plan.yaml' });
}

describe('Gantt-Projektion des commitgebundenen Projektplans', () => {
  it('ordnet belegte Phasen deterministisch auf einer gemeinsamen Zeitachse an', () => {
    const projection = buildGanttProjection([phase('UABC-PHASE-02', '2026-08-24', '2026-08-28', ['UABC-20']), phase('UABC-PHASE-01', '2026-08-03', '2026-08-21', ['UABC-19']), phase('UABC-PHASE-03', '2026-08-31', '2026-09-04', ['UABC-21'])]);
    expect(projection).toMatchObject({ startDate: '2026-08-03', endDate: '2026-09-04', totalDays: 33 });
    expect(projection?.rows.map((row) => row.artifact.id)).toEqual(['UABC-PHASE-01', 'UABC-PHASE-02', 'UABC-PHASE-03']);
    expect(projection?.rows.map((row) => row.artifact.ticketRefs)).toEqual([['UABC-19'], ['UABC-20'], ['UABC-21']]);
    expect(projection?.rows[0]).toMatchObject({ offsetPercent: 0, widthPercent: 57.57575757575758 });
    expect(projection?.rows.every((row) => row.offsetPercent >= 0 && row.offsetPercent + row.widthPercent <= 100.0000001)).toBe(true);
  });

  it('ignoriert Vorgänge, unvollständige Datumswerte und umgekehrte Intervalle', () => {
    const ticket = { ...phase('UABC-1', '2026-08-03', '2026-08-04'), sourceType: 'Task' };
    expect(buildGanttProjection([ticket, phase('UABC-PHASE-01', null, '2026-08-21'), phase('UABC-PHASE-02', '2026-08-28', '2026-08-24')])).toBeNull();
  });

  it('zeigt kanonische Phase-Tickets auch ohne alten Projektplan und ohne erfundene Termine', () => {
    const first = artifactSchema.parse({ id: 'UABC-1', kind: 'phase', title: 'Phase 1', status: 'in-progress', sourceType: 'phase', phaseId: 'UABC-1', estimateHours: 22, actualHours: 2, sourcePath: 'atlassian/jira/issues/tickets.yaml' });
    const second = artifactSchema.parse({ id: 'UABC-2', kind: 'phase', title: 'Phase 2', status: 'created', sourceType: 'phase', phaseId: 'UABC-2', estimateHours: 34, actualHours: 0, sourcePath: 'atlassian/jira/issues/tickets.yaml' });
    const epic = artifactSchema.parse({ id: 'UABC-4', kind: 'epic', title: 'Finanzwesen', sourceType: 'epic', parentId: 'UABC-1', phaseId: 'UABC-1', sourcePath: 'atlassian/jira/issues/tickets.yaml' });
    const plan = buildPhasePlan([first, second, epic]);
    expect(plan.map((row) => row.artifact.id)).toEqual(['UABC-1', 'UABC-2']);
    expect(plan[0].epicIds).toEqual(['UABC-4']);
    expect(plan[1].epicIds).toEqual([]);
    expect(buildGanttProjection([first, second, epic])).toBeNull();
  });
});
