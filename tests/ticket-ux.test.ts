import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { presentationFixtureState } from '../src/testing/presentation-fixture';

const ticketsPageSource = readFileSync(new URL('../src/components/TicketsPage.tsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const detailSource = mainSource.slice(mainSource.indexOf('function Detail('), mainSource.indexOf('function LinkedReference('));
const billingSource = mainSource.slice(mainSource.indexOf('function Billing('), mainSource.indexOf('function Documentation('));

describe('ticketfokussierte Aufwandsdarstellung', () => {
  it('gibt in Ticketübersicht und Ticketdetail keine EUR-Beträge aus', () => {
    expect(ticketsPageSource).not.toMatch(/\bEUR\b/);
    expect(detailSource).not.toMatch(/\bEUR\b/);
    expect(ticketsPageSource).toContain('Taskbasis: {taskHours} Std.');
    expect(detailSource).toContain("<h4>Einzelne Worklogs</h4>");
  });

  it('behält Stunden, belegte Jira-Felder und Referenznavigation im Ticketdetail', () => {
    for (const label of ['Typ', 'Status', 'Priorität', 'Verantwortung', 'Beschreibung', 'Akzeptanzkriterien', 'Abhängigkeiten', 'Statushistorie', 'Typisierte Kommentare', 'Einzelne Worklogs', 'Positivgelistete Evidence']) {
      expect(detailSource).toContain(label);
    }
    expect(detailSource).toContain('LinkedReference');
    expect(ticketsPageSource).toContain('Schätzung {presentation.estimateHours} Std.');
    expect(ticketsPageSource).toContain('{presentation.remainingHours} Std. Rest');
  });

  it('erhält die validierten Finanzdaten und ihre separate Abrechnungsansicht', () => {
    expect(presentationFixtureState.story?.controls).toMatchObject({ worklogHours: 80, worklogCost: 9600 });
    expect(billingSource).toMatch(/\bEUR\b/);
  });
});
