import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const ticketsSource = readFileSync(new URL('../src/components/TicketsPage.tsx', import.meta.url), 'utf8');

describe('PM-orientierte Oberflächen', () => {
  it('benennt den Nutzen der Hauptansichten und macht die Arbeitsliste nachrangig', () => {
    for (const text of ['Projektcockpit', 'Projektplan', 'Tickets & Backlog', 'Meilensteine', 'Lieferobjekte', 'Budget & Aufwand']) expect(mainSource).toContain(text);
    expect(mainSource).toContain('Die führende Arbeitsansicht ist „Tickets &amp; Backlog“');
    expect(mainSource).toContain('Vollständige Arbeitsliste anzeigen');
  });

  it('zeigt einen ehrlichen Phasenplan und erfindet keine Gantt-Termine', () => {
    expect(mainSource).toContain('Projektplan in Phasen');
    expect(mainSource).toContain('Gantt-Planung');
    expect(mainSource).toContain('Datums-Gantt noch nicht vollständig darstellbar');
    expect(mainSource).toContain("'noch nicht belegt'");
  });

  it('verwendet verständliche Budgetbegriffe statt Rollup-Fachsprache', () => {
    expect(mainSource).toContain('Verbrauch nach Monat');
    expect(mainSource).toContain('Nach Phase');
    expect(mainSource).toContain('Nach Epic');
    expect(mainSource).toContain('Summe aus untergeordneten Aufgaben');
    expect(mainSource).not.toContain(' · Rollup');
    expect(ticketsSource).not.toContain('Task-Rollup');
  });
});
