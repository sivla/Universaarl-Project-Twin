import type { ProjectState } from './model';

type StoryTicket = NonNullable<ProjectState['story']>['tickets'][number];

export type BudgetBreakdown = Readonly<{
  id: string;
  title: string;
  plannedHours: number | null;
  actualHours: number;
  remainingHours: number | null;
  actualCost: number;
  usedPercent: number | null;
}>;

export type MonthlyBudget = Readonly<{
  month: string;
  hours: number;
  cost: number;
  cumulativeCost: number;
  cumulativePercent: number | null;
}>;

export type BudgetDashboard = Readonly<{
  plannedHours: number | null;
  actualHours: number;
  remainingHours: number | null;
  plannedCost: number | null;
  actualCost: number;
  usedHoursPercent: number | null;
  usedCostPercent: number | null;
  months: readonly MonthlyBudget[];
  phases: readonly BudgetBreakdown[];
  epics: readonly BudgetBreakdown[];
}>;

const percent = (actual: number, planned: number | null) => planned !== null && planned > 0 ? Math.min(100, Math.max(0, actual / planned * 100)) : null;
const ticketHours = (ticket: StoryTicket) => ticket.actualHours ?? ticket.worklogs.reduce((total, item) => total + item.hours, 0);
const ticketCost = (ticket: StoryTicket) => ticket.worklogs.reduce((total, item) => total + (item.cost ?? 0), 0);

export function buildBudgetDashboard(state: ProjectState): BudgetDashboard {
  const tickets = state.story?.tickets ?? [];
  const tasks = tickets.filter((ticket) => ticket.type === 'task');
  const plannedHours = state.story?.offer?.plannedHours ?? null;
  const plannedCost = state.story?.offer?.plannedCost ?? null;
  const actualHours = tasks.reduce((total, ticket) => total + ticketHours(ticket), 0);
  const actualCost = tasks.reduce((total, ticket) => total + ticketCost(ticket), 0);
  const monthMap = new Map<string, { hours: number; cost: number }>();
  for (const task of tasks) for (const worklog of task.worklogs) {
    if (!worklog.date) continue;
    const month = worklog.date.slice(0, 7);
    const current = monthMap.get(month) ?? { hours: 0, cost: 0 };
    current.hours += worklog.hours;
    current.cost += worklog.cost ?? 0;
    monthMap.set(month, current);
  }
  let cumulativeCost = 0;
  const months = [...monthMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, value]) => {
    cumulativeCost += value.cost;
    return { month, ...value, cumulativeCost, cumulativePercent: percent(cumulativeCost, plannedCost) };
  });
  const children = new Map<string, StoryTicket[]>();
  for (const ticket of tickets) if (ticket.parent) children.set(ticket.parent, [...(children.get(ticket.parent) ?? []), ticket]);
  const descendants = (root: string) => {
    const result: StoryTicket[] = [];
    const queue = [...(children.get(root) ?? [])];
    while (queue.length) {
      const item = queue.shift()!;
      if (item.type === 'task') result.push(item);
      else queue.push(...(children.get(item.id) ?? []));
    }
    return result;
  };
  const row = (ticket: StoryTicket): BudgetBreakdown => {
    const leaves = descendants(ticket.id);
    const rowActualHours = leaves.reduce((total, item) => total + ticketHours(item), 0);
    const rowActualCost = leaves.reduce((total, item) => total + ticketCost(item), 0);
    const rowPlannedHours = ticket.estimateHours ?? null;
    return { id: ticket.id, title: ticket.summary, plannedHours: rowPlannedHours, actualHours: rowActualHours, remainingHours: rowPlannedHours === null ? null : Math.max(0, rowPlannedHours - rowActualHours), actualCost: rowActualCost, usedPercent: percent(rowActualHours, rowPlannedHours) };
  };
  return {
    plannedHours,
    actualHours,
    remainingHours: plannedHours === null ? null : Math.max(0, plannedHours - actualHours),
    plannedCost,
    actualCost,
    usedHoursPercent: percent(actualHours, plannedHours),
    usedCostPercent: percent(actualCost, plannedCost),
    months,
    phases: tickets.filter((ticket) => ticket.type === 'phase').map(row),
    epics: tickets.filter((ticket) => ticket.type === 'epic').map(row),
  };
}
