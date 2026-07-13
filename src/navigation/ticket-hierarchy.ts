import type { PresentationTicket, ProjectState } from '../model';

type StoryTicket = NonNullable<ProjectState['story']>['tickets'][number];

export function directTicketChildren(tickets: readonly StoryTicket[], parentId: string) {
  return tickets.filter((ticket) => ticket.parent === parentId);
}

export function ticketHierarchyContext(tickets: readonly StoryTicket[], presentations: readonly PresentationTicket[], ticketId: string) {
  const storyById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const presentationById = new Map(presentations.map((ticket) => [ticket.ticketId, ticket]));
  const result: string[] = [];
  let current = presentationById.get(ticketId)?.parentId;
  while (current) {
    const presentation = presentationById.get(current); const story = storyById.get(current);
    if (!presentation || !story) break;
    result.unshift(`${presentation.typeLabel} ${story.summary}`);
    current = presentation.parentId;
  }
  return result.join(' > ');
}
