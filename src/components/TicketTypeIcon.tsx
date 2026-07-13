import type { PresentationTicket } from '../model';

const ticketGlyphs: Readonly<Record<PresentationTicket['displayIconKey'], string>> = {
  'phase-flag': '⚑',
  'epic-layers': '▰',
  'story-bookmark': '◆',
  'bug-mark': '●',
  'task-check': '✓',
  'jira-phase': '⚑',
  'jira-epic': '▰',
  'jira-story': '◆',
  'jira-bug': '●',
  'jira-task': '✓',
};

export function TicketTypeIcon({ ticket, compact = false }: { ticket: PresentationTicket; compact?: boolean }) {
  const accessibleName = `Tickettyp ${ticket.typeLabel}`;
  return <span className={`ticket-type-badge ticket-type-${ticket.displayColorToken}${compact ? ' compact' : ''}`} title={accessibleName}>
    <span className="ticket-type-icon" role="img" aria-label={accessibleName}>{ticketGlyphs[ticket.displayIconKey]}</span>
    <span className="ticket-type-label">{ticket.typeLabel}</span>
  </span>;
}
