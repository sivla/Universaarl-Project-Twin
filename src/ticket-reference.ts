export type TicketTextPart = { kind: 'text'; value: string } | { kind: 'ticket'; value: string };

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitKnownTicketReferences(text: string, ticketIds: readonly string[]): TicketTextPart[] {
  const known = [...new Set(ticketIds.filter(Boolean))].sort((left, right) => right.length - left.length || left.localeCompare(right));
  if (!text || known.length === 0) return text ? [{ kind: 'text', value: text }] : [];
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(${known.map(escapePattern).join('|')})(?![A-Za-z0-9-])`, 'g');
  return text.split(pattern).filter(Boolean).map((value) => known.includes(value) ? { kind: 'ticket', value } : { kind: 'text', value });
}
