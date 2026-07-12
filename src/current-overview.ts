import type { ProjectState } from './model';

export function buildCurrentOverview(state: ProjectState) {
  const timeline = [...(state.story?.timeline ?? [])].sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  const latestMilestone = timeline.at(-1) ?? null;
  const readinessPhases = ['UAT', 'Cutover', 'Go-live', 'Hypercare', 'Handover']
    .map((phase) => [...timeline].reverse().find((event) => event.phase === phase))
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  const acceptedDeliverables = state.artifacts.filter((artifact) => artifact.sourceType === 'deliverable-register' && artifact.status === 'simulated-complete');
  const pendingHumanApprovals = state.artifacts.filter((artifact) => artifact.sourceType === 'human-approval' && artifact.status === 'pending');
  const offer = state.story?.offer ?? null;

  return {
    latestMilestone,
    readinessPhases,
    acceptedDeliverables,
    pendingHumanApprovals,
    simulationControls: state.story?.controls ? { openP1: state.story.controls.openP1, openP2: state.story.controls.openP2 } : null,
    budget: {
      plannedHours: offer?.plannedHours ?? null,
      plannedCost: offer?.plannedCost ?? null,
      actualHours: offer?.actualHours ?? null,
      actualCost: offer?.actualCost ?? null,
      committedRemaining: null,
      freeRemaining: null,
      etc: null,
      eac: null,
      forecastStatus: null,
    },
    nextActions: [] as const,
  };
}
