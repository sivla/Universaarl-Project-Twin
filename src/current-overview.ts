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
  const tickets = state.story?.tickets ?? [];
  const normalizedStatus = (value: string) => value.trim().toLowerCase();
  const completedTickets = tickets.filter((ticket) => ['done', 'completed', 'closed', 'erledigt', 'abgeschlossen'].includes(normalizedStatus(ticket.status)));
  const inProgressTickets = tickets.filter((ticket) => ['in progress', 'in-progress', 'active', 'in arbeit', 'in bearbeitung', 'tested', 'getestet'].includes(normalizedStatus(ticket.status)));
  const blockedTickets = tickets.filter((ticket) => ['blocked', 'blockiert'].includes(normalizedStatus(ticket.status)));
  const workInventory = tickets.filter((ticket) => ['backlog', 'created', 'planned', 'proposed', 'angelegt', 'arbeitsvorrat', 'geplant', 'vorgeschlagen'].includes(normalizedStatus(ticket.status)));
  // Der aktuelle Vertrag liefert kein eigenes Prioritäts- oder Next-Action-Feld.
  // Deshalb wird kein Arbeitsvorrat als nächste Handlung ausgegeben.
  const nextTickets: typeof tickets = [];

  return {
    latestMilestone,
    readinessPhases,
    acceptedDeliverables,
    pendingHumanApprovals,
    completedTickets,
    inProgressTickets,
    blockedTickets,
    workInventory,
    nextTickets,
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
