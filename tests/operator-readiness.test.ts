import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectState } from '../src/model';
import { buildOperatorReadiness } from '../src/operator-readiness';
// @ts-expect-error Der ausführbare Validator besitzt bewusst keinen TypeScript-Buildpfad.
import { validateProductionReadiness, validateProductionReadinessFile } from '../scripts/validate-production-readiness.mjs';

function state(overrides: Record<string, unknown> = {}) { return { source: { catalog: null, snapshot: null }, setupWave: null, ...overrides } as unknown as ProjectState; }

describe('dreistufige Readiness', () => {
  it('leitet Plattform und Onboarding aus lokaler Evidence ab, aber nie den Kunden-Go-live', () => {
    const result = buildOperatorReadiness(state({ source: { catalog: { releaseId: 'release-1', manifestDigest: `sha256:${'a'.repeat(64)}` }, snapshot: { validationStatus: 'validated', spectraReleaseBinding: { installableBlueprint: true, releaseTag: 'spectra-v1.0.0' } } }, setupWave: { exportId: 'setup-1', readOnly: true, writesAuthorized: false, provenance: [], coreFinancePreparation: { status: 'prepared-for-controlled-live-run', accepted: false }, configurationState: { customerTargetRealized: false, pilotConfigured: false, writesApplied: false, companyStrategyGate: { decisionAuthority: 'producer' } }, readinessPath: null } }));
    expect(result.platformReady.status).toBe('bereit');
    expect(result.onboardingReady.status).toBe('bereit');
    expect(result.customerGoLiveReady.status).toBe('nicht-bereit');
    expect(result.deploymentBoundary.unsupported).toContain('mehrbenutzer');
  });
  it('behält lokale Plattform- und Onboardingbereitschaft ohne CORE-Wave bei', () => { const result = buildOperatorReadiness(state()); expect(result.platformReady.status).toBe('bereit'); expect(result.onboardingReady.status).toBe('bereit'); expect(result.customerGoLiveReady.status).toBe('unbekannt'); });
  it('validiert den Repositoryvertrag und blockiert unsichere Evidence', () => { expect(validateProductionReadinessFile().projectId).toBe('project-twin'); const value = JSON.parse(fs.readFileSync(path.resolve('operations/production-readiness.json'), 'utf8')); value.assessments.platformReady.evidence[0].path = '../.env.local'; expect(() => validateProductionReadiness(value)).toThrow(/unsicher/); });
});
