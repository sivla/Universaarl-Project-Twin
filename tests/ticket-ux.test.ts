import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { presentationFixtureState } from '../src/testing/presentation-fixture';
import { directTicketChildren, ticketHierarchyContext } from '../src/navigation/ticket-hierarchy';

const ticketsPageSource = readFileSync(new URL('../src/components/TicketsPage.tsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const detailSource = mainSource.slice(mainSource.indexOf('function Detail('), mainSource.indexOf('function LinkedReference('));
const billingSource = mainSource.slice(mainSource.indexOf('function Billing('), mainSource.indexOf('function DocumentCards('));

describe('ticketfokussierte Aufwandsdarstellung', () => {
  it('ordnet jede Aufgabe exakt ihrer Story oder ihrem Fehler zu und liefert den vollständigen Kontext', () => {
    const story = presentationFixtureState.story!;
    const tickets = presentationFixtureState.presentation!.jira.tickets;
    expect(directTicketChildren(story.tickets, 'UABC-9').map((ticket) => ticket.id)).toEqual(['UABC-14']);
    expect(directTicketChildren(story.tickets, 'UABC-10').map((ticket) => ticket.id)).toEqual(['UABC-15']);
    expect(directTicketChildren(story.tickets, 'UABC-19').map((ticket) => ticket.id)).toEqual(['UABC-20']);
    expect(ticketHierarchyContext(story.tickets, tickets, 'UABC-14')).toBe('Phase Phase 1 · Grundlagen > Epic Finanzwesen > Story Finanzbasis einrichten');
    expect(ticketHierarchyContext(story.tickets, tickets, 'UABC-20')).toBe('Phase Phase 1 · Grundlagen > Epic Finanzwesen > Fehler Buchungsabweichung korrigieren');
  });

  it('trennt Aufklappen und Details, vermeidet parallele Such-/Boardtreffer und benennt Zustände zugänglich', () => {
    const zugänglicherAufklappzustand = 'aria-expanded={isOpen}';
    expect(ticketsPageSource).toContain(zugänglicherAufklappzustand);
    expect(ticketsPageSource).toContain('im Detail öffnen');
    expect(ticketsPageSource).toContain('query.trim() ? <section className="ticket-search-results"');
    expect(ticketsPageSource).toContain("ticketHierarchyContext(story.tickets, contract.jira.tickets, ticketId)");
  });

  it('gibt in Ticketübersicht und Ticketdetail keine EUR-Beträge aus', () => {
    expect(ticketsPageSource).not.toMatch(/\bEUR\b/);
    expect(detailSource).not.toMatch(/\bEUR\b/);
    expect(ticketsPageSource).toContain('Taskbasis: {taskHours} Std.');
    expect(detailSource).toContain("<h4>Einzelne Worklogs</h4>");
  });

  it('behält Stunden, belegte Jira-Felder und Referenznavigation im Ticketdetail', () => {
    for (const label of ['Typ', 'Status', 'Priorität', 'Verantwortung', 'Beschreibung', 'Akzeptanzkriterien', 'Abhängigkeiten', 'Statushistorie', 'Typisierte Kommentare', 'Einzelne Worklogs', 'Positivgelistete Evidence', 'Übergeordnetes Ticket', 'Stories und Fehler', 'Technische Provenienz']) {
      expect(detailSource).toContain(label);
    }
    expect(detailSource).toContain('LinkedReference');
    expect(ticketsPageSource).toContain('Schätzung {presentation.estimateHours} Std.');
    expect(ticketsPageSource).toContain('{presentation.remainingHours} Std. Rest');
  });

  it('erhält die validierten Finanzdaten und ihre separate Abrechnungsansicht', () => {
    expect(presentationFixtureState.story?.controls).toMatchObject({ worklogHours: 80, worklogCost: 9600 });
    expect(billingSource).toContain('Geplantes Budget');
    expect(billingSource).toContain('Erfasster Betrag');
    expect(billingSource).toContain('<th>Betrag</th>');
    expect(billingSource).toContain('numberFormatter.format(financial.amountEur)');
    expect(billingSource).toContain("' · Rollup'");
    expect(billingSource).toMatch(/\bEUR\b/);
  });
});
