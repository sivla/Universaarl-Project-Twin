import type { Artifact } from '../model';

const day = 86_400_000;
const timestamp = (value: string) => Date.parse(`${value}T00:00:00Z`);

export type GanttProjection = Readonly<{ startDate: string; endDate: string; totalDays: number; rows: readonly Readonly<{ artifact: Artifact; startDate: string; endDate: string; offsetPercent: number; widthPercent: number }>[] }>;

export function buildGanttProjection(artifacts: readonly Artifact[]): GanttProjection | null {
  const phases = artifacts.filter((artifact) => artifact.sourceType === 'project-plan' && artifact.startDate && artifact.dueDate)
    .map((artifact) => ({ artifact, startDate: artifact.startDate!, endDate: artifact.dueDate!, start: timestamp(artifact.startDate!), end: timestamp(artifact.dueDate!) }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start)
    .sort((left, right) => left.start - right.start || left.artifact.id.localeCompare(right.artifact.id, 'de'));
  if (!phases.length) return null;
  const start = Math.min(...phases.map((item) => item.start)); const end = Math.max(...phases.map((item) => item.end));
  const totalDays = Math.max(1, Math.round((end - start) / day) + 1);
  return { startDate: new Date(start).toISOString().slice(0, 10), endDate: new Date(end).toISOString().slice(0, 10), totalDays,
    rows: phases.map((item) => ({ artifact: item.artifact, startDate: item.startDate, endDate: item.endDate, offsetPercent: ((item.start - start) / day / totalDays) * 100, widthPercent: (Math.max(1, Math.round((item.end - item.start) / day) + 1) / totalDays) * 100 })) };
}
