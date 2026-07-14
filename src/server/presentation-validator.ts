import { presentationContractSchema, type PresentationContract } from '../model';
import { AdapterSourceError } from './source-contract-error';

export type PresentationValidationContext = {
  ticketTypes?: ReadonlyMap<string, string>;
  ticketStatuses?: ReadonlyMap<string, string>;
  documentIds?: ReadonlySet<string>;
  ticketWorklogs?: ReadonlyMap<string, { hours: number; amountEur: number }>;
  billingTotal?: { hours: number; amountEur: number };
};

const fixtureTicketTypePresentation = {
  phase: { typeLabel: 'Phase', displayIconKey: 'phase-flag', displayColorToken: 'slate' },
  epic: { typeLabel: 'Epic', displayIconKey: 'epic-layers', displayColorToken: 'violet' },
  story: { typeLabel: 'Story', displayIconKey: 'story-bookmark', displayColorToken: 'violet' },
  bug: { typeLabel: 'Fehler', displayIconKey: 'bug-mark', displayColorToken: 'red' },
  task: { typeLabel: 'Aufgabe', displayIconKey: 'task-check', displayColorToken: 'blue' },
} as const;

const producerTicketTypePresentation = {
  phase: { typeLabel: 'Phase', displayIconKey: 'jira-phase', displayColorToken: 'teal' },
  epic: { typeLabel: 'Epic', displayIconKey: 'jira-epic', displayColorToken: 'purple' },
  story: { typeLabel: 'Story', displayIconKey: 'jira-story', displayColorToken: 'green' },
  bug: { typeLabel: 'Fehler', displayIconKey: 'jira-bug', displayColorToken: 'red' },
  task: { typeLabel: 'Aufgabe', displayIconKey: 'jira-task', displayColorToken: 'blue' },
} as const;

const ticketTypePresentationProfiles = [fixtureTicketTypePresentation, producerTicketTypePresentation] as const;

function reject(message: string): never {
  throw new AdapterSourceError('QUELLVERTRAG_UNGUELTIG', message);
}
export function validatePresentationContract(input: unknown, context: PresentationValidationContext = {}): PresentationContract {
  const parsed = presentationContractSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.map(String).join('.') || 'Wurzel';
    reject(`Die producerdefinierte Präsentationsstruktur ist im Feld ${field} ungültig.`);
  }
  const contract = parsed.data;
  const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
  if (!unique(contract.spaces.map((space) => space.id)) || !unique(contract.spaces.map((space) => space.order))) reject('Die Wissensräume besitzen doppelte Kennungen oder Reihenfolgen.');
  const requiredTypes = ['phase', 'epic', 'story', 'task'] as const;
  const activeProfile = ticketTypePresentationProfiles.find((profile) => contract.jira.ticketTypes.every(({ type }) => {
    const item = contract.jira.ticketTypes.find((entry) => entry.type === type);
    return item && type in profile && JSON.stringify(profile[type as keyof typeof profile]) === JSON.stringify({ typeLabel: item.typeLabel, displayIconKey: item.displayIconKey, displayColorToken: item.displayColorToken });
  }));
  if (!activeProfile || !unique(contract.jira.ticketTypes.map((item) => item.type)) || requiredTypes.some((type) => !contract.jira.ticketTypes.some((item) => item.type === type))) reject('Die Tickettypdarstellung verletzt die geschlossene Allowlist.');
  const ticketIds = contract.jira.tickets.map((ticket) => ticket.ticketId);
  if (contract.jira.canonicalTicketCount !== ticketIds.length || !unique(ticketIds)) reject('Die kanonische Ticketmenge besitzt widersprüchliche Zähler oder Kennungen.');
  const ticketsById = new Map(contract.jira.tickets.map((ticket) => [ticket.ticketId, ticket]));
  for (const ticket of contract.jira.tickets) {
    const expected = activeProfile[ticket.type];
    if (ticket.typeLabel !== expected.typeLabel || ticket.displayIconKey !== expected.displayIconKey || ticket.displayColorToken !== expected.displayColorToken || (ticket.parentId && !ticketsById.has(ticket.parentId))) reject('Ein Ticket besitzt eine ungültige Typdarstellung oder Elternreferenz.');
    if (context.ticketTypes && context.ticketTypes.get(ticket.ticketId) !== ticket.type) reject('Die Präsentationsstruktur widerspricht dem kanonischen Story-Tickettyp.');
  }
  const assertAcyclic = (ids: readonly string[], parentOf: (id: string) => string | null | undefined, message: string) => {
    for (const id of ids) {
      const seen = new Set<string>([id]);
      let current = parentOf(id);
      while (current) {
        if (seen.has(current)) reject(message);
        seen.add(current);
        current = parentOf(current);
      }
    }
  };
  assertAcyclic(ticketIds, (id) => ticketsById.get(id)?.parentId, 'Die Tickethierarchie enthält einen Zyklus.');
  const childrenByParent = new Map<string, PresentationContract['jira']['tickets']>();
  for (const ticket of contract.jira.tickets) if (ticket.parentId) childrenByParent.set(ticket.parentId, [...(childrenByParent.get(ticket.parentId) ?? []), ticket]);
  const coreTypes = new Set(['phase', 'epic', 'story', 'bug', 'task']);
  if (contract.jira.tickets.some((ticket) => !coreTypes.has(ticket.type))) reject('Die abrechenbare Projekthierarchie enthält einen nicht freigegebenen Issue-Typ.');
  const phaseTickets = contract.jira.tickets.filter((ticket) => ticket.type === 'phase');
  const phaseTicketIds = contract.jira.tickets.slice(0, 3).map((ticket) => ticket.ticketId);
  if (phaseTickets.length !== 3 || contract.jira.tickets.slice(0, 3).some((ticket) => ticket.type !== 'phase') || contract.jira.tickets.slice(3).some((ticket) => ticket.type === 'phase')) reject('Die ersten drei kanonischen Tickets sind nicht eindeutig die producerdefinierten Phasen.');
  for (const ticket of contract.jira.tickets) {
    const parent = ticket.parentId ? ticketsById.get(ticket.parentId) : undefined;
    const children = childrenByParent.get(ticket.ticketId) ?? [];
    if (ticket.type === 'phase') {
      if (ticket.parentId || ticket.phaseId !== ticket.ticketId || ticket.phaseRefs.length !== 1 || ticket.phaseRefs[0] !== ticket.ticketId || ticket.billingSource !== 'task-rollup-only' || ticket.billable) reject('Ein Phase-Ticket verletzt die Wurzel-, Phasen- oder Abrechnungsgrenze.');
    } else if (ticket.type === 'epic') {
      if (!parent || parent.type !== 'phase' || ticket.phaseId !== parent.ticketId || ticket.phaseRefs.length !== 1 || ticket.phaseRefs[0] !== parent.ticketId || ticket.billingSource !== 'task-rollup-only' || ticket.billable || !children.length || children.some((child) => child.type !== 'story' && child.type !== 'bug')) reject('Ein fachlicher Epic besitzt keine eindeutige Phase oder keinen fachlichen Story-/Fehlerinhalt.');
    } else if (ticket.type === 'story' || ticket.type === 'bug') {
      if (!parent || parent.type !== 'epic' || !ticket.phaseId || ticket.phaseId !== parent.phaseId || ticket.phaseRefs.length || ticket.billingSource !== 'task-rollup-only' || ticket.billable || !children.length || children.some((child) => child.type !== 'task')) reject('Eine Story oder ein Fehler besitzt keinen eindeutigen fachlichen Epic oder keine Aufgaben.');
    } else if (!parent || (parent.type !== 'story' && parent.type !== 'bug') || !ticket.phaseId || ticket.phaseId !== parent.phaseId || ticket.phaseRefs.length || ticket.billingSource !== 'task-worklogs' || !ticket.billable || children.length) {
      reject('Eine Aufgabe verletzt die eindeutige Story-/Fehler- oder Abrechnungsbindung.');
    }
    const worklog = context.ticketWorklogs?.get(ticket.ticketId);
    if (ticket.type !== 'task' && worklog && (worklog.hours !== 0 || worklog.amountEur !== 0)) reject('Nur Aufgaben dürfen fakturierbare Worklogs besitzen.');
    if (ticket.type === 'task' && worklog && (ticket.actualHours !== worklog.hours || ticket.amountEur !== worklog.amountEur)) reject('Eine Aufgabe widerspricht ihren fakturierbaren Worklogs.');
  }
  const descendantTasks = (rootId: string) => {
    const result: PresentationContract['jira']['tickets'] = [];
    const queue = [...(childrenByParent.get(rootId) ?? [])];
    while (queue.length) {
      const item = queue.shift()!;
      if (item.type === 'task') result.push(item);
      else queue.push(...(childrenByParent.get(item.ticketId) ?? []));
    }
    return result;
  };
  const sum = (tickets: PresentationContract['jira']['tickets']) => tickets.reduce((totals, ticket) => ({ estimateHours: totals.estimateHours + ticket.estimateHours, actualHours: totals.actualHours + ticket.actualHours, remainingHours: totals.remainingHours + ticket.remainingHours, amountEur: totals.amountEur + ticket.amountEur }), { estimateHours: 0, actualHours: 0, remainingHours: 0, amountEur: 0 });
  const sameRollup = (left: { estimateHours: number; actualHours: number; remainingHours: number; amountEur: number }, right: { estimateHours: number; actualHours: number; remainingHours: number; amountEur: number }, includeEstimate: boolean) => (!includeEstimate || left.estimateHours === right.estimateHours) && left.actualHours === right.actualHours && left.remainingHours === right.remainingHours && left.amountEur === right.amountEur;
  for (const ticket of contract.jira.tickets.filter((item) => item.type !== 'task')) {
    const taskRollup = sum(ticket.type === 'phase' ? contract.jira.tickets.filter((item) => item.type === 'task' && item.phaseId === ticket.ticketId) : descendantTasks(ticket.ticketId));
    if (!sameRollup(ticket, taskRollup, false)) reject('Ein Elternvorgang besitzt keinen eindeutigen Task-basierten Ist-/Rest-/Betragsrollup.');
  }
  for (const epic of contract.jira.tickets.filter((ticket) => ticket.type === 'epic')) {
    const actualPhaseRefs = [...new Set((childrenByParent.get(epic.ticketId) ?? []).map((child) => child.phaseId).filter((id): id is string => Boolean(id)))];
    if (!unique(epic.phaseRefs) || epic.phaseRefs.length !== actualPhaseRefs.length || epic.phaseRefs.some((id) => !actualPhaseRefs.includes(id))) reject('Ein fachlicher Epic besitzt widersprüchliche Phasenreferenzen.');
  }
  const tasks = contract.jira.tickets.filter((ticket) => ticket.type === 'task');
  const taskTotals = sum(tasks);
  if (context.billingTotal && (taskTotals.actualHours !== context.billingTotal.hours || taskTotals.amountEur !== context.billingTotal.amountEur)) reject('Die fakturierbare Gesamtsumme stammt nicht exakt einmal aus Aufgaben-Worklogs.');
  for (const space of contract.spaces) {
    const nodeIds = space.nodes.map((node) => node.id);
    if (!unique(nodeIds)) reject('Ein Wissensraum besitzt doppelte Navigationskennungen.');
    const nodesById = new Map(space.nodes.map((node) => [node.id, node]));
    const siblingOrders = new Map<string, number[]>();
    for (const node of space.nodes) {
      if (node.parentId && !nodesById.has(node.parentId)) reject('Ein Navigationsknoten verweist auf ein fehlendes Elternziel.');
      if ((node.kind === 'page') !== Boolean(node.documentId)) reject('Ein Seitenknoten besitzt keine eindeutige Dokumentbindung.');
      if (node.documentId && context.documentIds && !context.documentIds.has(node.documentId)) reject('Ein Seitenknoten verweist auf ein unbekanntes Dokument.');
      const key = node.parentId ?? '__root__';
      const orders = siblingOrders.get(key) ?? [];
      orders.push(node.order);
      siblingOrders.set(key, orders);
    }
    if ([...siblingOrders.values()].some((orders) => !unique(orders))) reject('Geschwisterknoten besitzen eine doppelte Reihenfolge.');
    assertAcyclic(nodeIds, (id) => nodesById.get(id)?.parentId, 'Die Wissensraumhierarchie enthält einen Zyklus.');
  }
  if (!unique(contract.jira.views.map((view) => view.id)) || !unique(contract.jira.views.map((view) => view.order)) || new Set(contract.jira.views.map((view) => view.kind)).size !== 2) reject('Die Jira-Ansichten sind nicht eindeutig als Board und Liste definiert.');
  let boundGroups: string | null = null;
  for (const view of contract.jira.views) {
    if (!unique(view.visibleFields) || !unique(view.filters.map((filter) => filter.id))) reject('Eine Jira-Ansicht besitzt doppelte Felder oder Filter.');
    for (const filter of view.filters) if (!unique(filter.options.map((option) => option.value))) reject('Ein Jira-Filter besitzt doppelte Optionen.');
    if (!unique(view.groups.map((group) => group.id)) || !unique(view.groups.map((group) => group.order)) || JSON.stringify(view.groups.map((group) => group.phaseTicketId)) !== JSON.stringify(phaseTicketIds)) reject('Eine Jira-Ansicht besitzt nicht dieselben drei Phase-Tickets in producerdefinierter Reihenfolge.');
    for (const group of view.groups) {
      if (!unique(group.epicIds) || !unique(group.ticketIds) || ticketsById.get(group.phaseTicketId)?.type !== 'phase') reject('Eine Phasengruppe besitzt doppelte oder ungültige Ticketreferenzen.');
      const expectedEpics = contract.jira.tickets.filter((ticket) => ticket.type === 'epic' && ticket.phaseRefs.includes(group.phaseTicketId)).map((ticket) => ticket.ticketId);
      const expectedTickets = contract.jira.tickets.filter((ticket) => ticket.ticketId === group.phaseTicketId || (ticket.type === 'epic' ? ticket.phaseRefs.includes(group.phaseTicketId) : ticket.phaseId === group.phaseTicketId)).map((ticket) => ticket.ticketId);
      if (group.epicIds.length !== expectedEpics.length || group.epicIds.some((id) => !expectedEpics.includes(id)) || group.ticketIds.length !== expectedTickets.length || group.ticketIds.some((id) => !expectedTickets.includes(id))) reject('Eine Phasengruppe bildet ihre source-driven Epic- und Ticketmenge nicht exakt ab.');
    }
    const groupedTasks = view.groups.flatMap((group) => group.ticketIds).filter((id) => ticketsById.get(id)?.type === 'task');
    if (!unique(groupedTasks) || groupedTasks.length !== tasks.length) reject('Eine Jira-Ansicht zählt Aufgaben oder Worklogs phasenübergreifend doppelt.');
    const currentGroups = JSON.stringify(view.groups.map(({ id: _id, ...group }) => group));
    if (boundGroups !== null && currentGroups !== boundGroups) reject('Board und kompakte Liste besitzen widersprüchliche Phasengruppen.');
    boundGroups = currentGroups;
    if (view.kind === 'board') {
      if (!unique(view.columns.map((column) => column.id)) || !unique(view.columns.map((column) => column.order))) reject('Das Jira-Board besitzt doppelte Spalten oder Reihenfolgen.');
      const statuses = view.columns.flatMap((column) => column.statuses);
      if (!unique(statuses) || (context.ticketStatuses && [...context.ticketStatuses.values()].some((status) => !statuses.includes(status)))) reject('Das Jira-Board besitzt eine widersprüchliche Statuszuordnung.');
    }
  }
  return contract;
}
