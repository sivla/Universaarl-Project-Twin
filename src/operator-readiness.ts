import { z } from 'zod';
import productionReadiness from '../operations/production-readiness.json';
import type { ProjectState } from './model';

const readinessLevelSchema = z.object({ status: z.enum(['bereit', 'nicht-bereit', 'unbekannt']), title: z.string().min(1), summary: z.string().min(1), sourceRefs: z.array(z.string().min(1)) }).strict();
const localAssessmentSchema = z.object({ status: z.enum(['passed', 'pending', 'failed', 'source-dependent']), evidenceMode: z.enum(['local', 'source']), evidence: z.array(z.object({ kind: z.string().min(1), path: z.string().min(1) }).strict()), blockers: z.array(z.string().min(1)).nullable() }).strict();
const localReadinessSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('universaarl-component-production-readiness'), projectId: z.literal('project-twin'), deploymentBoundary: z.literal('local-loopback-single-operator'), assessments: z.object({ platformReady: localAssessmentSchema, onboardingReady: localAssessmentSchema, customerGoLiveReady: localAssessmentSchema }).strict(), distribution: z.object({ status: z.string().min(1), licenseDecision: z.string().min(1), evidence: z.array(z.string().min(1)) }).strict() }).strict();

export const operatorReadinessSchema = z.object({
  schemaVersion: z.literal(1),
  platformReady: readinessLevelSchema,
  onboardingReady: readinessLevelSchema,
  customerGoLiveReady: readinessLevelSchema,
  deploymentBoundary: z.object({ host: z.literal('127.0.0.1'), mode: z.literal('lokaler-einzeloperator'), unsupported: z.tuple([z.literal('lan'), z.literal('mehrbenutzer'), z.literal('authentifizierung'), z.literal('tls-terminierung')]) }).strict(),
}).strict();

export type OperatorReadiness = z.infer<typeof operatorReadinessSchema>;
type LocalReadiness = z.infer<typeof localReadinessSchema>;

function localLevel(assessment: LocalReadiness['assessments']['platformReady'], readyTitle: string, openTitle: string) {
  const ready = assessment.status === 'passed';
  return {
    status: ready ? 'bereit' as const : assessment.status === 'failed' ? 'nicht-bereit' as const : 'unbekannt' as const,
    title: ready ? readyTitle : openTitle,
    summary: ready ? 'Die lokale technische Evidence ist vollständig validiert.' : assessment.blockers?.join(' ') || 'Die lokale technische Evidence ist noch nicht vollständig.',
    sourceRefs: assessment.evidence.map((item) => item.path),
  };
}

export function buildOperatorReadiness(state: ProjectState, contract: unknown = productionReadiness): OperatorReadiness {
  const local = localReadinessSchema.parse(contract);
  const setup = state.setupWave;
  const platformReady = localLevel(local.assessments.platformReady, 'Plattform bereit', 'Plattformbereitschaft offen');
  const onboardingReady = localLevel(local.assessments.onboardingReady, 'Onboarding vorbereitet', 'Onboardingbereitschaft offen');
  const goLiveReady = setup
    ? {
        status: setup.configurationState.customerTargetRealized && setup.configurationState.pilotConfigured && setup.configurationState.writesApplied && setup.writesAuthorized && setup.coreFinancePreparation.accepted ? 'bereit' as const : 'nicht-bereit' as const,
        title: 'Kunden-Go-live nicht bereit',
        summary: 'Kundenrealisierung, Pilotkonfiguration, Schreibfreigabe und Abnahme sind im Producerstand nicht vollständig belegt.',
        sourceRefs: [setup.readinessPath?.sourcePath, setup.configurationState.companyStrategyGate.decisionAuthority].filter((item): item is string => Boolean(item)),
      }
    : { status: 'unbekannt' as const, title: 'Kunden-Go-live unbekannt', summary: 'Der Snapshot enthält keinen typisierten Go-live-Vertrag.', sourceRefs: [] };

  return operatorReadinessSchema.parse({ schemaVersion: 1, platformReady, onboardingReady, customerGoLiveReady: goLiveReady, deploymentBoundary: { host: '127.0.0.1', mode: 'lokaler-einzeloperator', unsupported: ['lan', 'mehrbenutzer', 'authentifizierung', 'tls-terminierung'] } });
}
