import { describe, expect, it } from 'vitest';
import { buildGapMatrix } from '../src/gap-matrix';
import type { ProjectState } from '../src/model';

describe('lesende Gap-Matrix', () => {
  it('zeigt fehlende Producerfamilien ehrlich und erzeugt keine Ersatzwerte', () => {
    const rows = buildGapMatrix({ artifacts: [], evidenceItems: [], resources: [], story: null, presentation: null, setupWave: null, source: { catalog: null, snapshot: null } } as unknown as ProjectState);
    expect(rows).toHaveLength(7);
    expect(rows.every((item) => item.status === 'nicht belegt')).toBe(true);
  });
});
