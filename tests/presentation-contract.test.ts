import { describe, expect, it } from 'vitest';
import { AdapterSourceError, validatePresentationContract } from '../src/server/adapter';
import { presentationFixture, presentationFixtureContext, presentationFixtureState, presentationFixtureVariant, type PresentationFixtureVariant } from '../src/testing/presentation-fixture';

describe('producerdefinierter Präsentationsvertrag', () => {
  it('validiert drei Wissensräume, zwei Jira-Ansichten und sechs Tickettypen gemeinsam', () => {
    expect(presentationFixture.spaces).toHaveLength(3);
    expect(presentationFixture.jira.views.map((view) => view.kind)).toEqual(['board', 'list']);
    expect(presentationFixture.jira.ticketTypes.map((item) => item.type)).toEqual(['epic', 'story', 'task', 'subtask', 'bug', 'change']);
    expect(presentationFixtureState.story?.tickets).toHaveLength(6);
    expect(presentationFixtureState.presentation?.jira.canonicalTicketCount).toBe(6);
  });

  it.each<PresentationFixtureVariant>(['cycle', 'duplicate-id', 'duplicate-order', 'unknown-reference', 'invalid-initial-state', 'unknown-icon'])(
    'blockiert die isolierte Mutation %s fail-closed',
    (variant) => expect(() => validatePresentationContract(presentationFixtureVariant(variant), presentationFixtureContext)).toThrow(AdapterSourceError),
  );
});
