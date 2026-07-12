import { describe, expect, it } from 'vitest';
import { AdapterSourceError, spectraEvidenceSummary } from '../src/server/adapter';

describe('commitgebundene Spectra-Evidence', () => {
  it('zeigt Releasebindung und bestaetigte Payloadvollstaendigkeit ohne erfundene Werte', () => {
    expect(spectraEvidenceSummary('spectra-release-evidence', {
      tag: { name: 'spectra-v0.8.0-alpha.1', peeledCommit: '5dd23c2ff2c408c03fd613348fcb305635cfbf9a' },
      payload: { bundleDigest: '73cccf2555357f761059cd369358e0ab6315807889995326a55761d3c58d6029', fileCount: 89, verifiedGitBlobs: 89, mismatches: 0 },
      release: { version: '0.8.0-alpha.1' }, verification: { status: 'passed' },
    })).toEqual({
      title: 'Spectra 0.8.0-alpha.1 · 89/89 Payloads', status: 'passed',
      rationale: 'Tag spectra-v0.8.0-alpha.1 · Commit 5dd23c2ff2c408c03fd613348fcb305635cfbf9a · Digest 73cccf2555357f761059cd369358e0ab6315807889995326a55761d3c58d6029',
    });
  });

  it('zeigt die belegte Graphentscheidung und blockiert unvollstaendige Release-Evidence', () => {
    expect(spectraEvidenceSummary('spectra-portable-conformance-evidence', {
      status: 'passed', spectraRelease: 'spectra-v0.8.0-alpha.1',
      graphCoverage: { nativeRelations: 252, portableEdges: 190, productDecision: 'accepted-graph-separation', standardizedCoverageMetric: false },
    })).toEqual({
      title: 'spectra-v0.8.0-alpha.1 · Graphtrennung akzeptiert', status: 'passed',
      rationale: '252 native Relationen · 190 portable Kanten · Coverage-Metrik nicht veröffentlicht',
    });
    expect(() => spectraEvidenceSummary('spectra-release-evidence', {
      tag: { name: 'spectra-v0.8.0-alpha.1', peeledCommit: '5dd23c2ff2c408c03fd613348fcb305635cfbf9a' },
      payload: { bundleDigest: '73cccf2555357f761059cd369358e0ab6315807889995326a55761d3c58d6029', fileCount: 89, verifiedGitBlobs: 88, mismatches: 1 },
      release: { version: '0.8.0-alpha.1' }, verification: { status: 'failed' },
    })).toThrow(AdapterSourceError);
  });
});
