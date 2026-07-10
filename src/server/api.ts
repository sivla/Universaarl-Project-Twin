import { createTwinState, resolveEvidenceId } from './adapter';
import { findProject, publicProjects, type ProjectEntry } from '../projects/registry';

export type ApiResult = { status: number; body: unknown; file?: string };
type StateReader = typeof createTwinState;

const safeError = (code: string, message: string, status: number): ApiResult => ({ status, body: { code, error: message } });

export async function dispatchProjectApi(method: string, pathname: string, registry: readonly ProjectEntry[], readState: StateReader = createTwinState): Promise<ApiResult> {
  if (method !== 'GET') return safeError('METHOD_NOT_ALLOWED', 'Nur lesende Zugriffe sind erlaubt.', 405);
  if (pathname === '/api/projects') return { status: 200, body: { projects: publicProjects(registry) } };
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/(state|evidence\/([^/]+))$/);
  if (!match) return safeError('NOT_FOUND', 'API-Endpunkt nicht gefunden.', 404);
  let projectId: string; let evidenceId = '';
  try { projectId = decodeURIComponent(match[1]); evidenceId = match[3] ? decodeURIComponent(match[3]) : ''; }
  catch { return safeError('INVALID_REQUEST', 'Ungültige Anfrage.', 400); }
  const project = findProject(registry, projectId);
  if (!project) return safeError('PROJECT_NOT_FOUND', 'Projekt nicht gefunden.', 404);
  if (match[2] === 'state') {
    try { return { status: 200, body: await readState(project.sourceRoot) }; }
    catch { return safeError('SOURCE_UNAVAILABLE', 'Die freigegebene Projektquelle ist nicht verfügbar.', 503); }
  }
  if (!/^ev_[a-f0-9]{24}$/.test(evidenceId)) return safeError('EVIDENCE_NOT_FOUND', 'Nachweis nicht gefunden.', 404);
  const file = resolveEvidenceId(project.sourceRoot, evidenceId);
  return file ? { status: 200, body: null, file } : safeError('EVIDENCE_NOT_FOUND', 'Nachweis nicht gefunden.', 404);
}
