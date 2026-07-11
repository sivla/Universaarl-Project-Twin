import { createTwinState, resolveEvidenceId, type EvidenceBlob } from './adapter';
import { findProject, publicProjects, type ProjectEntry } from '../projects/registry';
import { renderLimits } from '../model';

export type ApiResult = { status: number; body: unknown; binary?: EvidenceBlob };
type StateReader = typeof createTwinState;

export const apiErrorCodes = ['METHODE_NICHT_ERLAUBT', 'ENDPUNKT_NICHT_GEFUNDEN', 'ANFRAGE_UNGUELTIG', 'PROJEKT_NICHT_GEFUNDEN', 'PROJEKTLISTE_ZU_GROSS', 'QUELLE_NICHT_VERFUEGBAR', 'NACHWEIS_NICHT_GEFUNDEN', 'API_NICHT_VERFUEGBAR'] as const;
export type ApiErrorCode = typeof apiErrorCodes[number];
const safeError = (code: ApiErrorCode, status: number): ApiResult => ({ status, body: { code } });

export async function dispatchProjectApi(method: string, pathname: string, registry: readonly ProjectEntry[], readState: StateReader = createTwinState): Promise<ApiResult> {
  try {
    if (method !== 'GET') return safeError('METHODE_NICHT_ERLAUBT', 405);
    if (pathname === '/api/projects') { const projects = publicProjects(registry); return projects.length <= renderLimits.projects ? { status: 200, body: { projects } } : safeError('PROJEKTLISTE_ZU_GROSS', 503); }
    const match = pathname.match(/^\/api\/projects\/([^/]+)\/(state|evidence\/([^/]+))$/);
    if (!match) return safeError('ENDPUNKT_NICHT_GEFUNDEN', 404);
    let projectId: string; let evidenceId = '';
    try { projectId = decodeURIComponent(match[1]); evidenceId = match[3] ? decodeURIComponent(match[3]) : ''; }
    catch { return safeError('ANFRAGE_UNGUELTIG', 400); }
    const project = findProject(registry, projectId);
    if (!project) return safeError('PROJEKT_NICHT_GEFUNDEN', 404);
    if (match[2] === 'state') {
      try { return { status: 200, body: await readState(project.id, project.sourceRoot, { ...(project.sourceBinding ? { sourceBinding: project.sourceBinding } : {}), ...(project.sourceContract ? { projectDataContract: project.sourceContract } : {}) }) }; }
      catch { return safeError('QUELLE_NICHT_VERFUEGBAR', 503); }
    }
    if (!/^ev_[a-f0-9]{24}$/.test(evidenceId)) return safeError('NACHWEIS_NICHT_GEFUNDEN', 404);
    const binary = resolveEvidenceId(project.id, project.sourceRoot, evidenceId, { ...(project.sourceBinding ? { sourceBinding: project.sourceBinding } : {}), ...(project.sourceContract ? { projectDataContract: project.sourceContract } : {}) });
    return binary ? { status: 200, body: null, binary } : safeError('NACHWEIS_NICHT_GEFUNDEN', 404);
  } catch {
    return safeError('API_NICHT_VERFUEGBAR', 500);
  }
}
