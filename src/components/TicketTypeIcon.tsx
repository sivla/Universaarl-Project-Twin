import type { PresentationTicket } from '../model';

const ticketGlyphs: Readonly<Record<PresentationTicket['displayIconKey'], string>> = {
  'epic-layers': '▰',
  'story-bookmark': '◆',
  'task-check': '✓',
  'subtask-branch': '↳',
  bug: '✹',
  'change-arrow': '↔',
};

export function TicketTypeIcon({ ticket, compact = false }: { ticket: PresentationTicket; compact?: boolean }) {
  const accessibleName = `Tickettyp ${ticket.typeLabel}`;
  return <span className={`ticket-type-badge ticket-type-${ticket.displayColorToken}${compact ? ' compact' : ''}`} title={accessibleName}>
    <span className="ticket-type-icon" role="img" aria-label={accessibleName}>{ticketGlyphs[ticket.displayIconKey]}</span>
    <span className="ticket-type-label">{ticket.typeLabel}</span>
  </span>;
}
