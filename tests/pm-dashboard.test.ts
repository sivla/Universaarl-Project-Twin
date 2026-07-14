import { describe, expect, it } from 'vitest';
import { projectStateSchema } from '../src/model';
import { buildBudgetDashboard } from '../src/pm-dashboard';
import { presentationFixtureState } from '../src/testing/presentation-fixture';

const ticket = (id: string, type: 'phase' | 'epic' | 'story' | 'task', parent: string | null, estimateHours: number, worklogs: Array<{ date: string; hours: number; cost: number }> = []) => ({
  id, type, status: 'in-progress', summary: id, description: '', assignee: null, reporter: null, createdAt: null, assigneeRole: null, reporterRole: null, priority: null, parent, dependencies: [], phaseId: type === 'phase' ? id : 'P-1', phaseRefs: type === 'phase' || type === 'epic' ? ['P-1'] : [], billingSource: type === 'task' ? 'task-worklogs' : 'task-rollup-only', estimateHours, actualHours: worklogs.reduce((sum, item) => sum + item.hours, 0), remainingHours: estimateHours - worklogs.reduce((sum, item) => sum + item.hours, 0), netAmount: worklogs.reduce((sum, item) => sum + item.cost, 0), billable: type === 'task', acceptanceCriteria: [], statusHistory: [], comments: [], worklogs: worklogs.map((item) => ({ ...item, role: 'PM', actor: null, activity: 'Arbeit', phase: 'P1' })), evidenceRefs: [], statusReason: null,
});

describe('PM-Budgetprojektion', () => {
  it('berechnet Gesamt-, Monats-, Phasen- und Epicverbrauch ausschließlich aus Task-Worklogs', () => {
    const state = projectStateSchema.parse({ ...presentationFixtureState, story: { storyId: 'STORY-1', status: 'in-progress', offer: { id: 'O-1', currentVersion: '1', versions: [], plannedHours: 100, plannedCost: 12000, actualHours: 30, actualCost: 3600 }, pages: [], tickets: [ticket('P-1', 'phase', null, 100), ticket('E-1', 'epic', 'P-1', 60), ticket('S-1', 'story', 'E-1', 60), ticket('T-1', 'task', 'S-1', 60, [{ date: '2026-07-01', hours: 20, cost: 2400 }, { date: '2026-08-01', hours: 10, cost: 1200 }])], timeline: [], hypercare: [], relations: [], controls: { openP1: 0, openP2: 0, worklogHours: 30, worklogCost: 3600, realBcExecution: false } } });
    const result = buildBudgetDashboard(state);
    expect(result).toMatchObject({ plannedHours: 100, actualHours: 30, remainingHours: 70, plannedCost: 12000, actualCost: 3600, usedHoursPercent: 30, usedCostPercent: 30 });
    expect(result.months).toEqual([{ month: '2026-07', hours: 20, cost: 2400, cumulativeCost: 2400, cumulativePercent: 20 }, { month: '2026-08', hours: 10, cost: 1200, cumulativeCost: 3600, cumulativePercent: 30 }]);
    expect(result.phases[0]).toMatchObject({ id: 'P-1', actualHours: 30, actualCost: 3600, usedPercent: 30 });
    expect(result.epics[0]).toMatchObject({ id: 'E-1', actualHours: 30, actualCost: 3600, usedPercent: 50 });
  });

  it('bleibt ohne belegte Planbasis ehrlich unbekannt', () => {
    const state = projectStateSchema.parse({ ...presentationFixtureState, story: null });
    expect(buildBudgetDashboard(state)).toMatchObject({ plannedHours: null, actualHours: 0, plannedCost: null, actualCost: 0, usedHoursPercent: null, usedCostPercent: null, months: [], phases: [], epics: [] });
  });
});
