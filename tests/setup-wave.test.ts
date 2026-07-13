import { describe, expect, it } from 'vitest';
import { AdapterSourceError, validateSetupWaveProjectionContract } from '../src/server/adapter';

const projection = { schemaVersion: 1, exportId: 'UABC-EXP-SETUP-WAVE1-001', recordType: 'setup-wave-1-projection', readOnly: true, writesAuthorized: false,
  target: { environment: 'Playthru', companyId: 'UABC-BASIC-DE', platform: '28.0.52286.0', application: '28.2.50931.52241', pilotName: 'Universaarl GmbH (BC Basic Pilot)', legacyName: 'Universaarl GmbH (Legacy)' },
  packages: [{ packageId: 'UABC-01-CORE-FINANCE', status: 'prepared-not-executed', tables: 0, records: 0, errors: 0 }],
  preflight: { status: 'beobachtet-nur-lesend', workingDate: '2026-07-13', operator: { userId: 'TEST.USER', permissionSet: 'SUPER' }, locale: 'German (Germany)', resetPoint: { status: 'missing-blocker', requiredBeforeAnyWrite: true } },
  writeGate: { writesAuthorized: false, noGoSteps: ['RUN-06'], nextAllowedStep: 'Resetpunkt dokumentieren und separat freigeben' },
  provenance: [{ path: 'project/bc-basic/setup-wave-1-matrix.yaml', role: 'Paketvertrag' }] } as const;
const schemaDocument = { type: 'object', additionalProperties: false, required: Object.keys(projection), properties: { schemaVersion: { const: 1 }, exportId: { type: 'string' }, recordType: { const: 'setup-wave-1-projection' }, readOnly: { const: true }, writesAuthorized: { const: false }, target: { type: 'object' }, packages: { type: 'array' }, preflight: { type: 'object' }, writeGate: { type: 'object' }, provenance: { type: 'array' } } };

describe('Setup-Wave-1-Projektion', () => {
  it('akzeptiert den strikt nur-lesenden Projektionsvertrag', () => expect(validateSetupWaveProjectionContract({ projection, schemaDocument })).toMatchObject({ readOnly: true, writesAuthorized: false, target: { companyId: 'UABC-BASIC-DE' } }));
  it.each([
    ['Schreibrecht', { ...projection, writesAuthorized: true }],
    ['unsicheren Pfad', { ...projection, provenance: [{ path: '../intern.yaml', role: 'Intern' }] }],
    ['abweichendes Schema', projection, { ...schemaDocument, properties: { ...schemaDocument.properties, recordType: { const: 'anderer-vertrag' } } }],
  ])('blockiert %s fail-closed', (_label, value, schema = schemaDocument) => expect(() => validateSetupWaveProjectionContract({ projection: value, schemaDocument: schema })).toThrow(AdapterSourceError));
});
