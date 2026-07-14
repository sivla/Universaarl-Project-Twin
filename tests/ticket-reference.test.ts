import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitKnownTicketReferences } from '../src/ticket-reference';

describe('durchgängige Ticketnavigation', () => {
  it('erkennt bekannte Ticket-IDs exakt und bevorzugt die längste Kennung', () => {
    expect(splitKnownTicketReferences('UABC-1: In Arbeit, danach UABC-10.', ['UABC-1', 'UABC-10'])).toEqual([
      { kind: 'ticket', value: 'UABC-1' },
      { kind: 'text', value: ': In Arbeit, danach ' },
      { kind: 'ticket', value: 'UABC-10' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('verlinkt unbekannte oder verlängerte Kennungen nicht versehentlich', () => {
    expect(splitKnownTicketReferences('UABC-1X, ALT-UABC-1 und UABC-999', ['UABC-1'])).toEqual([
      { kind: 'text', value: 'UABC-1X, ALT-UABC-1 und UABC-999' },
    ]);
  });

  it('verwendet denselben Linkvertrag in Cockpit, Tagebuch, Timeline, Lieferung und Stichtag', () => {
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    expect(ui).toContain('function TicketLink');
    expect(ui).toContain('function TicketText');
    expect(ui).toContain('<TicketLink id={event.objectId}');
    expect(ui).toContain('<TicketLink id={status.objectId}');
    expect(ui).toContain('<TicketReferenceList state={state} ids={event.tickets} open={open} />');
    expect(ui).toContain('Kontext: Ticket <TicketLink id={artifact.id}');
  });

  it('verlinkt bekannte Ticketkennungen auch im sicheren Dokumentinhalt', () => {
    const renderer = fs.readFileSync(path.resolve('src/components/SemanticMarkdown.tsx'), 'utf8');
    const spaces = fs.readFileSync(path.resolve('src/components/DocumentationSpaces.tsx'), 'utf8');
    expect(renderer).toContain('splitKnownTicketReferences');
    expect(renderer).toContain('aria-label={`Ticket ${part.value} öffnen`}');
    expect(spaces).toContain('ticketIds={[...ticketArtifacts.keys()]}');
    expect(spaces).toContain('onOpenTicket={(id) =>');
  });
});
