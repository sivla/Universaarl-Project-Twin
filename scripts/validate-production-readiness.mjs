import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const safePath = /^(?!.*(?:^|\/)(?:\.env[^/]*|\.runtime|node_modules)(?:\/|$))(?!.*(?:^|\/)\.\.?(?:\/|$))[.A-Za-z0-9][A-Za-z0-9._/-]*\.(?:md|json|yml|yaml|ts|tsx|mjs)$/;
const kinds = {
  platformReady: new Set(['test-report', 'operator-guide', 'release-evidence', 'security-boundary', 'platform-matrix']),
  onboardingReady: new Set(['onboarding-runbook', 'input-contract', 'profile-proof', 'recovery-proof', 'source-register', 'readiness-validation']),
  customerGoLiveReady: new Set(['readiness-validation']),
};

function assert(condition, message) { if (!condition) throw new Error(message); }

export function validateProductionReadiness(value, base = root) {
  assert(value?.schemaVersion === 1 && value.kind === 'universaarl-component-production-readiness' && value.projectId === 'project-twin', 'Der Production-Readiness-Vertrag besitzt eine falsche Identität.');
  assert(value.deploymentBoundary === 'local-loopback-single-operator', 'Die Deployment-Grenze ist ungültig.');
  for (const level of Object.keys(kinds)) {
    const assessment = value.assessments?.[level];
    assert(assessment && ['passed', 'pending', 'failed', 'source-dependent'].includes(assessment.status), `Der Readiness-Status ${level} ist ungültig.`);
    assert(['local', 'source'].includes(assessment.evidenceMode), `Der Evidence-Modus ${level} ist ungültig.`);
    assert(Array.isArray(assessment.evidence), `Die Evidence ${level} fehlt.`);
    if (assessment.status === 'passed') assert(assessment.evidence.length > 0 && assessment.blockers === null, `Ein bestandener Status ${level} benötigt Evidence und darf keinen Blocker tragen.`);
    else assert(Array.isArray(assessment.blockers) && assessment.blockers.length > 0 && assessment.blockers.every((item) => typeof item === 'string' && item.trim()), `Der offene Status ${level} benötigt konkrete Blocker.`);
    for (const evidence of assessment.evidence) {
      assert(kinds[level].has(evidence?.kind), `Die Evidence-Art ${evidence?.kind ?? 'unbekannt'} ist für ${level} nicht erlaubt.`);
      assert(typeof evidence.path === 'string' && safePath.test(evidence.path) && evidence.path !== 'operations/production-readiness.json', `Der Evidence-Pfad ${evidence?.path ?? 'unbekannt'} ist unsicher.`);
      const resolved = path.resolve(base, evidence.path);
      assert(resolved.startsWith(`${path.resolve(base)}${path.sep}`) && fs.existsSync(resolved) && fs.statSync(resolved).isFile(), `Die Evidence-Datei ${evidence.path} fehlt.`);
    }
  }
  assert(value.assessments.customerGoLiveReady.status === 'source-dependent' && value.assessments.customerGoLiveReady.evidenceMode === 'source', 'Kunden-Go-live muss ausschließlich producerabhängig bleiben.');
  assert(value.distribution?.status === 'internal-only' && value.distribution.licenseDecision === 'pending', 'Ohne menschliche Lizenzentscheidung darf die Distribution nicht freigegeben sein.');
  return value;
}

export function validateProductionReadinessFile(file = path.join(root, 'operations', 'production-readiness.json')) {
  return validateProductionReadiness(JSON.parse(fs.readFileSync(file, 'utf8')), root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateProductionReadinessFile();
  process.stdout.write('Production-Readiness-Vertrag bestanden.\n');
}
