import { describe, expect, it } from 'vitest';
import { AdapterSourceError, validateCurrentSetupEvidenceConsistency, validateSetupWaveProjectionContract } from '../src/server/adapter';

const projection = { schemaVersion: 1, exportId: 'UABC-EXP-SETUP-WAVE1-001', recordType: 'setup-wave-1-projection', readOnly: true, writesAuthorized: false,
  target: { environment: 'Playthru', companyId: 'UABC-BASIC-DE', platform: '28.0.52286.0', application: '28.2.50931.52241', pilotName: 'Universaarl GmbH (BC Basic Pilot)', legacyName: 'Universaarl GmbH (Legacy)' },
  configurationState: { baselineKind: 'standard-cronus-demo', baselineProvenance: 'microsoft-standard-cronus-demo-data', pilotConfigured: false, writesApplied: false, readbackStatus: 'pending', technicalCompanyName: 'UABC-BASIC-DE', internalCompanyId: null, observedDisplayName: 'Universaarl GmbH', targetDisplayName: 'Universaarl GmbH (BC Basic Pilot)', targetDecision: 'pending-wave-0-evidence', resetDecision: 'pending-resetpoint-evidence', targetState: { classification: 'bc-basic-target-not-applied', displayName: 'Universaarl GmbH (BC Basic Pilot)', configurationScope: 'CORE-FINANCE nach bestandenem Wave-0-, Zielmandanten-, Reset- und Schreibfreigabegate', laterLockedWaves: ['UABC-02-TRADE-MASTER', 'UABC-03-OPENING-DATA'] }, appliedDifference: { status: 'none-evidenced', readbackStatus: 'pending', readbackEvidenceCount: 0 }, companyStrategyGate: { status: 'blocked-pending-wave0-and-reset-evidence', selectedOption: null, allowedOptions: ['controlled-reuse-of-dedicated-cronus-copy', 'clean-new-company-or-copy'], requiredEvidence: ['internal-company-id-readback', 'company-name-and-display-name-readback', 'standard-cronus-content-inventory', 'foreign-company-boundary-readback', 'resetpoint-with-restart-path', 'zero-package-state-readback'], decisionEvidenceCount: 0, decisionAuthority: 'project/bc-basic/pilot-setup-baseline.yaml#/companyInformation/companyStrategyDecision', nextExecutableStep: 'W0-01-read-company-identity', writesAuthorized: false } },
  packages: [{ packageId: 'UABC-01-CORE-FINANCE', status: 'prepared-not-executed', tables: 0, records: 0, errors: 0 }],
  preflight: { status: 'beobachtet-nur-lesend', wave0Status: 'required-not-executed', workingDate: '2026-07-13', operator: { userId: 'TEST.USER', permissionSet: 'SUPER' }, locale: 'German (Germany)', resetPoint: { status: 'missing-blocker', requiredBeforeAnyWrite: true } },
  writeGate: { writesAuthorized: false, noGoSteps: ['RUN-06'], nextAllowedStep: 'Resetpunkt dokumentieren und separat freigeben' },
  provenance: [{ path: 'project/bc-basic/setup-wave-1-matrix.yaml', role: 'Paketvertrag' }] } as const;
const schemaDocument = { type: 'object', additionalProperties: false, required: Object.keys(projection), properties: { schemaVersion: { const: 1 }, exportId: { type: 'string' }, recordType: { const: 'setup-wave-1-projection' }, readOnly: { const: true }, writesAuthorized: { const: false }, target: { type: 'object' }, configurationState: { type: 'object' }, packages: { type: 'array' }, preflight: { type: 'object' }, writeGate: { type: 'object' }, provenance: { type: 'array' } } };

describe('Setup-Wave-1-Projektion', () => {
  it('akzeptiert den strikt nur-lesenden Projektionsvertrag', () => expect(validateSetupWaveProjectionContract({ projection, schemaDocument })).toMatchObject({ readOnly: true, writesAuthorized: false, target: { companyId: 'UABC-BASIC-DE' } }));

  it('blockiert aktuelle Ausführungsevidence bei einem nicht eingerichteten Pilot fail-closed', () => {
    const setupWave = validateSetupWaveProjectionContract({ projection, schemaDocument });
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [{ sourceType: 'country-company-information-execution-evidence', currentAuthority: true }])).toThrowError(AdapterSourceError);
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [{ sourceType: 'country-company-information-execution-evidence', currentAuthority: null }])).toThrowError(AdapterSourceError);
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [{ sourceType: 'country-company-information-execution-evidence', currentAuthority: false }])).not.toThrow();
  });
  it.each([
    ['Schreibrecht', { ...projection, writesAuthorized: true }],
    ['angeblich angewendete Änderungen', { ...projection, configurationState: { ...projection.configurationState, writesApplied: true } }],
    ['unsicheren Pfad', { ...projection, provenance: [{ path: '../intern.yaml', role: 'Intern' }] }],
    ['abweichendes Schema', projection, { ...schemaDocument, properties: { ...schemaDocument.properties, recordType: { const: 'anderer-vertrag' } } }],
  ])('blockiert %s fail-closed', (_label, value, schema = schemaDocument) => expect(() => validateSetupWaveProjectionContract({ projection: value, schemaDocument: schema })).toThrow(AdapterSourceError));
});
