import { describe, expect, it } from 'vitest';
import { AdapterSourceError, validatePresentationContract } from '../src/server/adapter';
import { presentationFixture, presentationFixtureContext, presentationFixtureInput, presentationFixtureState, presentationFixtureVariant, type PresentationFixtureVariant } from '../src/testing/presentation-fixture';

describe('producerdefinierter Präsentationsvertrag', () => {
  it('validiert drei Wissensräume, zwei Jira-Ansichten und fünf vorbereitete Tickettypen gemeinsam', () => {
    expect(presentationFixture.spaces).toHaveLength(3);
    expect(presentationFixture.jira.views.map((view) => view.kind)).toEqual(['board', 'list']);
    expect(presentationFixture.jira.ticketTypes.map((item) => item.type)).toEqual(['phase', 'epic', 'story', 'bug', 'task']);
    expect(presentationFixture.jira.tickets.slice(0, 3).map((item) => item.type)).toEqual(['phase', 'phase', 'phase']);
    expect(presentationFixture.jira.views.every((view) => view.groups.map((group) => group.phaseTicketId).join(',') === 'UABC-1,UABC-2,UABC-3')).toBe(true);
    expect(presentationFixture.jira.tickets.find((item) => item.ticketId === 'UABC-4')?.phaseRefs).toEqual(['UABC-1']);
    expect(presentationFixtureState.story?.tickets).toHaveLength(20);
    expect(presentationFixtureState.presentation?.jira.canonicalTicketCount).toBe(20);
    expect(presentationFixture.jira.tickets.find((item) => item.ticketId === 'UABC-19')).toMatchObject({ type: 'bug', parentId: 'UABC-4', displayIconKey: 'bug-mark', displayColorToken: 'red' });
    expect(presentationFixture.jira.tickets.find((item) => item.ticketId === 'UABC-20')).toMatchObject({ type: 'task', parentId: 'UABC-19', billable: true });
    expect(presentationFixtureState.story?.controls).toMatchObject({ worklogHours: 80, worklogCost: 9600 });
  });

  it.each<PresentationFixtureVariant>(['cycle', 'duplicate-id', 'duplicate-order', 'unknown-reference', 'invalid-initial-state', 'unknown-icon', 'unknown-ticket-type', 'invalid-parent', 'bug-invalid-parent', 'nonbillable-task', 'rollup-mismatch', 'phase-ref-mismatch', 'phase-container', 'wrong-phase-order', 'phase-billable', 'epic-without-phase', 'duplicate-epic-reference', 'duplicate-task-reference'])(
    'blockiert die isolierte Mutation %s fail-closed',
    (variant) => expect(() => validatePresentationContract(presentationFixtureVariant(variant), presentationFixtureContext)).toThrow(AdapterSourceError),
  );

  it('blockiert fakturierbare Worklogs auf einem Elternvorgang und zählt die Tasksumme nur einmal', () => {
    const ticketWorklogs = new Map(presentationFixtureContext.ticketWorklogs);
    ticketWorklogs.set('UABC-1', { hours: 30, amountEur: 3600 });
    expect(() => validatePresentationContract(presentationFixtureInput, { ...presentationFixtureContext, ticketWorklogs })).toThrow(AdapterSourceError);
    expect(presentationFixture.jira.tickets.filter((ticket) => ticket.billable).reduce((sum, ticket) => sum + ticket.actualHours, 0)).toBe(80);
    expect(presentationFixture.jira.tickets.filter((ticket) => ticket.billable).reduce((sum, ticket) => sum + ticket.amountEur, 0)).toBe(9600);
  });
});
