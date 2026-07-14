import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AdapterSourceError, validateCoreFinancePreparationContract, validateCurrentSetupEvidenceConsistency, validateSetupWaveProjectionContract, validateWave0ReadbackAttemptContract } from '../src/server/adapter';

const payloadBytes = Buffer.from('core-finance-payload');
const payloadDigest = createHash('sha256').update(payloadBytes).digest('hex');
const projection = { schemaVersion: 1, exportId: 'UABC-EXP-SETUP-WAVE1-001', recordType: 'setup-wave-1-projection', readOnly: true, writesAuthorized: false,
  target: { environment: 'Playthru', companyId: 'UABC-BASIC-DE', platform: '28.0.52286.0', application: '28.2.50931.52241', pilotName: 'Universaarl GmbH (BC Basic Pilot)', legacyName: 'Universaarl GmbH (Legacy)' },
  configurationState: { baselineKind: 'standard-cronus-demo', baselineProvenance: 'microsoft-standard-cronus-demo-data', customerTargetRealized: false, originMechanismStatus: 'unbekannt-bis-wave0-readback', copyRenameHypothesis: 'nutzerhinweis-unbestaetigt', setupStatus: 'blockiert-bis-dom-readback-und-zielkonfiguration', pilotConfigured: false, writesApplied: false, readbackStatus: 'pending', technicalCompanyName: 'UABC-BASIC-DE', internalCompanyId: null, observedDisplayName: 'Universaarl GmbH', targetDisplayName: 'Universaarl GmbH (BC Basic Pilot)', targetDecision: 'pending-wave-0-evidence', resetDecision: 'pending-resetpoint-evidence', targetState: { classification: 'bc-basic-target-not-applied', displayName: 'Universaarl GmbH (BC Basic Pilot)', configurationScope: 'CORE-FINANCE nach bestandenem Wave-0-, Zielmandanten-, Reset- und Schreibfreigabegate', laterLockedWaves: ['UABC-02-TRADE-MASTER', 'UABC-03-OPENING-DATA'] }, appliedDifference: { status: 'none-evidenced', readbackStatus: 'pending', readbackEvidenceCount: 0 }, wave0ReadbackAttempt: { status: 'blocked-before-dom-readback', evidencePath: 'evidence/playthru-uabc-basic-de/wave-0-company-identity-readback.yaml', attemptCount: 2, latestAttemptId: 'UABC-W0-01-ATTEMPT-002', latestAttemptAt: '2026-07-13T14:11:07.393+02:00', bcReadbackAuthority: false, bcFieldValuesRead: false, screenshotCaptured: false, writesPerformed: false, visibleTabTarget: { title: 'Dynamics 365 Business Central', environmentParameter: 'Playthru', companyParameter: 'UABC-BASIC-DE' } }, companyStrategyGate: { status: 'blocked-pending-wave0-and-reset-evidence', selectedOption: null, allowedOptions: ['controlled-reuse-of-dedicated-cronus-copy', 'clean-new-company-or-copy'], requiredEvidence: ['internal-company-id-readback', 'company-name-and-display-name-readback', 'standard-cronus-content-inventory', 'foreign-company-boundary-readback', 'resetpoint-with-restart-path', 'zero-package-state-readback'], decisionEvidenceCount: 0, decisionAuthority: 'project/bc-basic/pilot-setup-baseline.yaml#/companyInformation/companyStrategyDecision', nextExecutableStep: 'W0-01-read-company-identity', writesAuthorized: false } },
  packages: [{ packageId: 'UABC-01-CORE-FINANCE', status: 'prepared-for-controlled-live-run', tables: 0, records: 0, errors: 0 }],
  coreFinancePreparation: { packageId: 'UABC-01-CORE-FINANCE', status: 'prepared-for-controlled-live-run', packageTableCount: 19, packageRecordCount: 51, manualTableCount: 7, manualRecordCount: 18, accountRoleCount: 11, dimensionCount: 2, dimensionValueCount: 5, numberSeriesCount: 9, numberSeriesLineCount: 9, paymentTermsCount: 2, realBankIdentifierCount: 0, payloadDigest, financeReferenceDigest: 'b'.repeat(64), taxAssumption: { percent: 19, truthClass: 'synthetic-project-assumption', confirmationStatus: 'open' }, performed: false, applied: false, accepted: false, requiredGatesClosed: false },
  preflight: { status: 'beobachtet-nur-lesend', wave0Status: 'blocked-before-dom-readback', workingDate: '2026-07-13', operator: { userId: 'TEST.USER', permissionSet: 'SUPER' }, locale: 'German (Germany)', resetPoint: { status: 'missing-blocker', requiredBeforeAnyWrite: true } },
  writeGate: { writesAuthorized: false, noGoSteps: ['RUN-06'], nextAllowedStep: 'W0-01-read-company-identity' },
  provenance: [{ path: 'project/bc-basic/setup-wave-1-matrix.yaml', role: 'Paketvertrag' }] } as const;
const schemaDocument = { type: 'object', additionalProperties: false, required: Object.keys(projection), properties: { schemaVersion: { const: 1 }, exportId: { type: 'string' }, recordType: { const: 'setup-wave-1-projection' }, readOnly: { const: true }, writesAuthorized: { const: false }, target: { type: 'object' }, configurationState: { type: 'object' }, packages: { type: 'array' }, coreFinancePreparation: { type: 'object' }, preflight: { type: 'object' }, writeGate: { type: 'object' }, provenance: { type: 'array' } } };
const coreFinanceTruthBoundary = { bcReadbackAuthority: false, customerTargetRealized: false, pilotConfigured: false, writesApplied: false, writesAuthorized: false, packageApplied: false, customerAccepted: false, liveEvidence: { tables: 0, records: 0, errors: 0 } } as const;
const coreFinanceTaxAssumption = { jurisdiction: 'DE', standardVatPercent: 19, truthClass: 'synthetic-project-assumption', confirmationStatus: 'open', confirmationRequiredBeforeApply: true, legalOrTaxAdviceClaimed: false } as const;
const coreFinanceControlTotals = { packageTableCount: 19, packageRecordCount: 51, manualTableCount: 7, manualRecordCount: 18, totalTableCount: 26, totalRecordCount: 69, accountRoleCount: 11, dimensionCount: 2, dimensionValueCount: 5, numberSeriesCount: 9, numberSeriesLineCount: 9, paymentTermsCount: 2, realBankIdentifierCount: 0 } as const;
const coreFinancePayload = { packageId: 'UABC-01-CORE-FINANCE', status: 'prepared-for-controlled-live-run', truthBoundary: coreFinanceTruthBoundary, gates: { status: 'blocked-before-dom-readback' }, taxAssumption: coreFinanceTaxAssumption, controlTotals: coreFinanceControlTotals, preparationWorklog: { taskId: 'UABC-40', hours: 2, billable: true, netAmount: 240 } } as const;
const coreFinanceManifest = { packageId: 'UABC-01-CORE-FINANCE', status: 'prepared-for-controlled-live-run', payload: { path: 'project/bc-basic/core-finance-payload.yaml', schemaPath: 'governance/schemas/core-finance-payload.schema.json', digestAlgorithm: 'SHA-256', digest: payloadDigest }, truthBoundary: coreFinanceTruthBoundary, gates: { status: 'blocked-before-dom-readback' }, taxAssumption: coreFinanceTaxAssumption, controlTotals: coreFinanceControlTotals, controlDigests: { accountRolesSha256: 'c'.repeat(64), financeReferencesSha256: 'b'.repeat(64), allRecordReferencesSha256: 'd'.repeat(64) }, worklogBinding: { ticketId: 'UABC-40', worklogId: 'WL-UABC-40', hours: 2, netAmount: 240 } } as const;
const payloadSchema = { type: 'object' } as const;
const unreadValue = { status: 'nicht-aus-bc-ui-gelesen', value: null, page: null, screenshotPath: null } as const;
const attemptItems = [
  { attemptId: 'UABC-W0-01-ATTEMPT-001', recordedAt: '2026-07-13T11:55:38.382+02:00', tabLastOpenedAt: '2026-07-13T08:37:00.550Z', accessPolicy: 'enterprise-network-policy', status: 'blocked-before-dom-readback', domReadPerformed: false, screenshotPerformed: false, bcFieldValuesRead: false, authenticationStateRead: false, writesPerformed: false },
  { attemptId: 'UABC-W0-01-ATTEMPT-002', recordedAt: '2026-07-13T14:11:07.393+02:00', tabLastOpenedAt: '2026-07-13T08:37:00.550Z', accessPolicy: 'enterprise-network-policy', status: 'blocked-before-dom-readback', domReadPerformed: false, screenshotPerformed: false, bcFieldValuesRead: false, authenticationStateRead: false, writesPerformed: false },
] as const;
const attemptWorklogs = [
  { id: 'WL-UABC-39-W0-01-BLOCKED-20260713', taskId: 'UABC-39', date: '2026-07-13', role: 'Lead BC Consultant', actorRef: 'P-PILOT-LEAD-001', actorType: 'human', actionRole: 'Projektleitung und Lead BC Consultant', hours: 0.25, activity: 'Nur-lesenden Versuch und Sicherheitsblock dokumentiert.', phase: 'P2', billable: true, hourlyRate: 120, netAmount: 30 },
  { id: 'WL-UABC-39-W0-01-RETRY-BLOCKED-20260713', taskId: 'UABC-39', date: '2026-07-13', role: 'Lead BC Consultant', actorRef: 'P-PILOT-LEAD-001', actorType: 'human', actionRole: 'Projektleitung und Lead BC Consultant', hours: 0.25, activity: 'Zweiten Nur-Lese-Versuch und denselben Sicherheitsblock dokumentiert.', phase: 'P2', billable: true, hourlyRate: 120, netAmount: 30 },
] as const;
const attempt = { schemaVersion: 1, evidenceId: 'UABC-EV-W0-01-ATTEMPT-20260713', stepId: 'W0-01-read-company-identity', classification: 'current-read-only-attempt', authorityScope: 'browser-access-attempt-only', currentAuthority: true, bcReadbackAuthority: false, status: 'blocked-before-dom-readback',
  attemptCount: 2, latestAttemptId: 'UABC-W0-01-ATTEMPT-002',
  time: { exactBrowserAttemptStartCaptured: false, visibleTabLastOpenedAt: '2026-07-13T08:37:00.550Z', firstPersistentlyCapturedLocalTime: '2026-07-13T11:53:28.275+02:00', recordedAt: '2026-07-13T11:55:38.382+02:00', note: 'Der genaue Startzeitpunkt wird nicht erfunden.' },
  responsibility: { operationActorRef: 'ACTOR-CODEX-SPECTRA', operationActorType: 'browser-automation', operationRole: 'autorisierte Nur-Lese-Browserautomation', accountableActorRef: 'P-PILOT-LEAD-001', accountableRole: 'Projektleitung und Lead BC Consultant' },
  attempts: attemptItems, worklogs: attemptWorklogs,
  visibleTabMetadata: { title: 'Dynamics 365 Business Central', sanitizedUrl: 'https://businesscentral.dynamics.com/<tenant>/Playthru?company=UABC-BASIC-DE', environmentParameter: 'Playthru', companyParameter: 'UABC-BASIC-DE', truthBoundary: 'Titel und URL-Parameter sind kein BC-Feldreadback.' },
  userProvidedProjectInformation: { truthClass: 'user-provided-project-information', selectedTechnicalCompanyName: 'UABC-BASIC-DE', contentBaseline: 'standard-cronus-demo', customerTargetRealized: false, originMechanismStatus: 'unbekannt-bis-wave0-readback', copyRenameHypothesis: 'nutzerhinweis-unbestaetigt', pilotConfigured: false, writesApplied: false, browserReadbackConfirmed: false, boundary: 'Projektinformation ersetzt keine BC-Evidence.' },
  accessResult: { policy: 'enterprise-network-policy', blockedBeforeDomRead: true, blockedBeforeScreenshot: true, blockedBeforeBcFieldRead: true, authenticationStateRead: false, domReadPerformed: false, screenshotPerformed: false, screenshots: [] },
  readbacks: { environment: unreadValue, visibleCompanyName: unreadValue, internalCompanyId: unreadValue, companyInformation: { status: 'nicht-aus-bc-ui-gelesen', values: null, page: null, screenshotPath: null }, countryRegion: unreadValue, cronusProvenance: { status: 'nicht-aus-bc-ui-gelesen', indicators: [], page: null, screenshotPath: null }, companyList: { status: 'nicht-aus-bc-ui-gelesen', companies: [], page: null, screenshotPath: null } },
  effects: { writesPerformed: false, saveActionPerformed: false, companyChanged: false, companyCreated: false, companyCopied: false, companyRenamed: false, companyDeleted: false, setupChanged: false, packageChanged: false, postingPerformed: false },
  decision: { status: 'offen-unzureichende-nur-lese-evidence', selectedOption: null, forbiddenInferences: ['interne-company-id-aus-url', 'cronus-provenienz-aus-titel-oder-url', 'zielstrategie-aus-titel-oder-url', 'pilotkonfiguration-aus-company-query'], remainingEvidence: ['internal-company-id-readback', 'company-name-and-display-name-readback', 'standard-cronus-content-inventory', 'foreign-company-boundary-readback', 'resetpoint-with-restart-path', 'zero-package-state-readback'] },
  nextAction: { stepId: 'W0-01-read-company-identity', mode: 'manuell-zugaengliche-nur-lese-sitzung', instruction: 'BC-Felder in einer freigegebenen Sitzung nur lesen.', requiredVisibleValues: ['interner Company-ID-Wert'], writesAuthorized: false } } as const;
const attemptArtifact = { id: 'UABC-SRC-BCB-W0-01-ATTEMPT-001', sourceType: 'current-read-only-attempt', sourcePath: projection.configurationState.wave0ReadbackAttempt.evidencePath, status: 'blocked-before-dom-readback', classification: 'current-read-only-attempt', currentAuthority: true, currentRollupContribution: true } as const;

describe('Setup-Wave-1-Projektion', () => {
  it('akzeptiert den strikt nur-lesenden Projektionsvertrag', () => expect(validateSetupWaveProjectionContract({ projection, schemaDocument })).toMatchObject({ readOnly: true, writesAuthorized: false, target: { companyId: 'UABC-BASIC-DE' } }));

  it('bindet CORE-FINANCE-Vorbereitung, Kontrollsummen und Digests ohne Ausführungsbehauptung', () => {
    const setupWave = validateSetupWaveProjectionContract({ projection, schemaDocument });
    expect(validateCoreFinancePreparationContract({ setupWave, payload: coreFinancePayload, payloadBytes, payloadSchema, manifest: coreFinanceManifest })).toMatchObject({ coreFinancePreparation: { status: 'prepared-for-controlled-live-run', packageTableCount: 19, packageRecordCount: 51, manualTableCount: 7, manualRecordCount: 18, realBankIdentifierCount: 0, performed: false, applied: false, accepted: false, requiredGatesClosed: false } });
  });

  it.each([
    ['abweichenden Payload-Blob', { payloadBytes: Buffer.from('manipuliert') }],
    ['abweichenden Payload-Digest', { manifest: { ...coreFinanceManifest, payload: { ...coreFinanceManifest.payload, digest: 'e'.repeat(64) } } }],
    ['abweichende Payload-Referenz', { manifest: { ...coreFinanceManifest, payload: { ...coreFinanceManifest.payload, path: 'project/bc-basic/falsch.yaml' } } }],
    ['angewendetes Paket', { payload: { ...coreFinancePayload, truthBoundary: { ...coreFinanceTruthBoundary, packageApplied: true } } }],
    ['Schreibbehauptung', { payload: { ...coreFinancePayload, truthBoundary: { ...coreFinanceTruthBoundary, writesAuthorized: true } } }],
    ['Kundenabnahmebehauptung', { payload: { ...coreFinancePayload, truthBoundary: { ...coreFinanceTruthBoundary, customerAccepted: true } } }],
    ['bestätigte Steuerannahme', { payload: { ...coreFinancePayload, taxAssumption: { ...coreFinanceTaxAssumption, confirmationStatus: 'confirmed' } } }],
    ['reale Bankkennung', { payload: { ...coreFinancePayload, controlTotals: { ...coreFinanceControlTotals, realBankIdentifierCount: 1 } } }],
    ['umgangenes W0-Gate', { payload: { ...coreFinancePayload, gates: { status: 'ready-for-apply' } } }],
  ])('blockiert %s im CORE-FINANCE-Vertrag fail-closed', (_label, change) => {
    const setupWave = validateSetupWaveProjectionContract({ projection, schemaDocument });
    expect(() => validateCoreFinancePreparationContract({ setupWave, payload: coreFinancePayload, payloadBytes, payloadSchema, manifest: coreFinanceManifest, ...change })).toThrowError(AdapterSourceError);
  });

  it('bindet zwei getrennte blockierte Nur-Lese-Versuche ohne BC-Readback', () => expect(validateWave0ReadbackAttemptContract(attempt)).toMatchObject({ attemptCount: 2, latestAttemptId: 'UABC-W0-01-ATTEMPT-002', attempts: [{ attemptId: 'UABC-W0-01-ATTEMPT-001', domReadPerformed: false }, { attemptId: 'UABC-W0-01-ATTEMPT-002', domReadPerformed: false }], worklogs: [{ hours: 0.25 }, { hours: 0.25 }], bcReadbackAuthority: false, readbacks: { internalCompanyId: { value: null }, countryRegion: { value: null } }, effects: { writesPerformed: false } }));

  it('blockiert aktuelle Ausführungsevidence bei einem nicht eingerichteten Pilot fail-closed', () => {
    const setupWave = validateSetupWaveProjectionContract({ projection, schemaDocument });
    const historical = { ...attemptArtifact, id: 'UABC-HISTORICAL-EVIDENCE', sourceType: 'country-company-information-execution-evidence', currentAuthority: false, currentRollupContribution: false } as const;
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [attemptArtifact, { ...historical, currentAuthority: true }])).toThrowError(AdapterSourceError);
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [attemptArtifact, { ...historical, currentAuthority: null }])).toThrowError(AdapterSourceError);
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [attemptArtifact, historical])).not.toThrow();
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [])).toThrowError(AdapterSourceError);
    expect(() => validateCurrentSetupEvidenceConsistency(setupWave, [{ ...attemptArtifact, sourcePath: 'evidence/anderer-versuch.yaml' }])).toThrowError(AdapterSourceError);
  });
  it.each([
    ['realisiertes Kundenziel in Evidence', { ...attempt, userProvidedProjectInformation: { ...attempt.userProvidedProjectInformation, customerTargetRealized: true } }],
    ['bestätigte Kopie oder Umbenennung in Evidence', { ...attempt, userProvidedProjectInformation: { ...attempt.userProvidedProjectInformation, copyRenameHypothesis: 'bestaetigt' } }],
    ['BC-Readback-Autorität', { ...attempt, bcReadbackAuthority: true }],
    ['BC-Feldwert aus URL oder Titel', { ...attempt, readbacks: { ...attempt.readbacks, visibleCompanyName: { ...unreadValue, value: 'UABC-BASIC-DE' } } }],
    ['Screenshotbehauptung', { ...attempt, accessResult: { ...attempt.accessResult, screenshotPerformed: true } }],
    ['DOM-Readback im zweiten Versuch', { ...attempt, attempts: [attemptItems[0], { ...attemptItems[1], domReadPerformed: true }] }],
    ['doppelter Versuch', { ...attempt, attempts: [attemptItems[0], { ...attemptItems[1], attemptId: 'UABC-W0-01-ATTEMPT-001' }] }],
    ['Schreibbehauptung', { ...attempt, effects: { ...attempt.effects, writesPerformed: true } }],
  ])('blockiert widersprüchliche %s fail-closed', (_label, value) => expect(() => validateWave0ReadbackAttemptContract(value)).toThrowError(AdapterSourceError));
  it.each([
    ['realisiertes Kundenziel', { ...projection, configurationState: { ...projection.configurationState, customerTargetRealized: true } }],
    ['bestätigte Kopie oder Umbenennung', { ...projection, configurationState: { ...projection.configurationState, copyRenameHypothesis: 'bestaetigt' } }],
    ['bekannter Entstehungsweg ohne Readback', { ...projection, configurationState: { ...projection.configurationState, originMechanismStatus: 'kopie-bestaetigt' } }],
    ['angewendeter Einrichtungsstatus', { ...projection, configurationState: { ...projection.configurationState, setupStatus: 'angewendet' } }],
    ['Schreibrecht', { ...projection, writesAuthorized: true }],
    ['angeblich angewendete Änderungen', { ...projection, configurationState: { ...projection.configurationState, writesApplied: true } }],
    ['unsicheren Pfad', { ...projection, provenance: [{ path: '../intern.yaml', role: 'Intern' }] }],
    ['abweichendes Schema', projection, { ...schemaDocument, properties: { ...schemaDocument.properties, recordType: { const: 'anderer-vertrag' } } }],
  ])('blockiert %s fail-closed', (_label, value, schema = schemaDocument) => expect(() => validateSetupWaveProjectionContract({ projection: value, schemaDocument: schema })).toThrow(AdapterSourceError));
});
