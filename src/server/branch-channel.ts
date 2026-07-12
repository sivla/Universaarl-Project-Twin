export type BranchCandidate = Readonly<{ commit: string; tree: string }>;

export type BranchChannelMetadata = Readonly<{
  branch: string;
  status: 'current' | 'stale';
  lastValidatedAt: string;
  notice: string | null;
}>;

export type BranchChannelSnapshot<T> = Readonly<{
  value: T;
  commit: string;
  tree: string;
  channel: BranchChannelMetadata;
}>;

export function createValidatedBranchChannel<T>(options: {
  branch: string;
  resolveCandidate: () => BranchCandidate;
  validateCandidate: (candidate: BranchCandidate, branch: string) => Promise<T>;
  now?: () => string;
}) {
  let active: BranchChannelSnapshot<T> | undefined;
  let pending: Promise<BranchChannelSnapshot<T>> | undefined;
  const now = options.now ?? (() => new Date().toISOString());

  const performRefresh = async () => {
    try {
      const candidate = options.resolveCandidate();
      if (active?.commit === candidate.commit && active.tree === candidate.tree) {
        active = { ...active, channel: { ...active.channel, status: 'current', notice: null } };
        return active;
      }
      const value = await options.validateCandidate(candidate, options.branch);
      active = { value, ...candidate, channel: { branch: options.branch, status: 'current', lastValidatedAt: now(), notice: null } };
      return active;
    } catch (error) {
      if (!active) throw error;
      active = { ...active, channel: { ...active.channel, status: 'stale', notice: 'Die Aktualisierung des Freigabebranchs ist fehlgeschlagen. Der letzte vollständig validierte Stand bleibt sichtbar.' } };
      return active;
    }
  };

  return Object.freeze({
    refresh() {
      if (!pending) pending = performRefresh().finally(() => { pending = undefined; });
      return pending;
    },
    current() { return active; },
  });
}
