import { describe, expect, it, vi } from 'vitest';
import { createValidatedBranchChannel } from '../src/server/branch-channel';

describe('atomarer Producerbranch-Kanal', () => {
  it('löst pro Aktualisierung genau einen Kandidaten auf und übernimmt ihn erst nach Validierung', async () => {
    const resolveCandidate = vi.fn(() => ({ commit: 'a'.repeat(40), tree: 'b'.repeat(40) }));
    const validateCandidate = vi.fn(async ({ commit }: { commit: string }) => ({ commit }));
    const channel = createValidatedBranchChannel({ branch: 'codex/universaarl-projekt', resolveCandidate, validateCandidate, now: () => '2026-07-12T23:45:00.000Z' });
    const active = await channel.refresh();
    expect(resolveCandidate).toHaveBeenCalledTimes(1);
    expect(validateCandidate).toHaveBeenCalledTimes(1);
    expect(active).toMatchObject({ commit: 'a'.repeat(40), value: { commit: 'a'.repeat(40) }, channel: { status: 'current', branch: 'codex/universaarl-projekt' } });
  });

  it('behält bei ungültiger neuer Branchspitze atomar den letzten gültigen Stand', async () => {
    let candidate = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
    const channel = createValidatedBranchChannel({ branch: 'codex/universaarl-projekt', resolveCandidate: () => candidate,
      validateCandidate: async (next) => { if (next.commit.startsWith('c')) throw new Error('ungültig'); return { commit: next.commit }; }, now: () => '2026-07-12T23:45:00.000Z' });
    const first = await channel.refresh();
    candidate = { commit: 'c'.repeat(40), tree: 'd'.repeat(40) };
    const stale = await channel.refresh();
    expect(stale.value).toBe(first.value);
    expect(stale.commit).toBe(first.commit);
    expect(stale.channel).toMatchObject({ status: 'stale', lastValidatedAt: '2026-07-12T23:45:00.000Z' });
  });

  it('liefert ohne jemals validierten Stand keinen Ersatzwert', async () => {
    const channel = createValidatedBranchChannel({ branch: 'codex/universaarl-projekt', resolveCandidate: () => ({ commit: 'a'.repeat(40), tree: 'b'.repeat(40) }), validateCandidate: async () => { throw new Error('ungültig'); } });
    await expect(channel.refresh()).rejects.toThrow('ungültig');
    expect(channel.current()).toBeUndefined();
  });

  it('führt parallele Aktualisierungsanfragen als genau eine Validierung aus', async () => {
    const validateCandidate = vi.fn(async () => ({ ok: true }));
    const channel = createValidatedBranchChannel({ branch: 'codex/universaarl-projekt', resolveCandidate: () => ({ commit: 'a'.repeat(40), tree: 'b'.repeat(40) }), validateCandidate });
    await Promise.all([channel.refresh(), channel.refresh(), channel.refresh()]);
    expect(validateCandidate).toHaveBeenCalledTimes(1);
  });
});
