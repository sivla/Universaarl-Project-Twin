import { renderLimits } from '../model';
import type { LoadedCatalog } from './snapshot-catalog';

export type CatalogApiBinary = {
  contentType: string;
  bytes: Buffer;
  fileName?: string;
  disposition?: 'inline' | 'attachment';
};

export type ApiResult = { status: number; body: unknown; binary?: CatalogApiBinary };

export const apiErrorCodes = ['METHODE_NICHT_ERLAUBT', 'ENDPUNKT_NICHT_GEFUNDEN', 'ANFRAGE_UNGUELTIG', 'PROJEKT_NICHT_GEFUNDEN', 'PROJEKTLISTE_ZU_GROSS', 'QUELLE_NICHT_VERFUEGBAR', 'SNAPSHOT_VERTRAG_BLOCKIERT', 'NACHWEIS_NICHT_GEFUNDEN', 'API_NICHT_VERFUEGBAR'] as const;
export type ApiErrorCode = typeof apiErrorCodes[number];
const safeError = (code: ApiErrorCode, status: number): ApiResult => ({ status, body: { code } });

/** Reine read-only API über bereits vollständig validierte Snapshot-Kataloge. */
export function dispatchProjectApi(method: string, pathname: string, catalogs: readonly LoadedCatalog[]): ApiResult {
  try {
    if (method !== 'GET') return safeError('METHODE_NICHT_ERLAUBT', 405);
    if (pathname === '/api/projects') {
      if (catalogs.length > renderLimits.projects) return safeError('PROJEKTLISTE_ZU_GROSS', 503);
      return { status: 200, body: { projects: catalogs.map(({ entry }) => ({ id: entry.id, key: entry.id.toUpperCase().replaceAll('-', '').slice(0, 12), name: entry.displayName ?? entry.expectedProjectId })) } };
    }
    const match = pathname.match(/^\/api\/projects\/([a-z][a-z0-9-]+)\/(state|evidence\/([A-Za-z0-9._-]+)|resources\/([A-Za-z0-9._-]+)\/(preview|download))$/);
    if (!match) return safeError('ENDPUNKT_NICHT_GEFUNDEN', 404);
    const catalog = catalogs.find(({ entry }) => entry.id === match[1]);
    if (!catalog) return safeError('PROJEKT_NICHT_GEFUNDEN', 404);
    if (match[2] === 'state') return { status: 200, body: catalog.state };
    const payloadId = match[3] ?? match[4];
    const payload = catalog.payloads.get(payloadId);
    const expectedRole = match[3] ? 'evidence' : 'resource';
    if (!payload || payload.metadata.role !== expectedRole) return safeError('NACHWEIS_NICHT_GEFUNDEN', 404);
    return {
      status: 200,
      body: null,
      binary: {
        contentType: payload.metadata.mediaType,
        bytes: payload.bytes,
        ...(match[5] === 'download' ? { fileName: payload.metadata.id, disposition: 'attachment' as const } : { disposition: 'inline' as const }),
      },
    };
  } catch {
    return safeError('API_NICHT_VERFUEGBAR', 500);
  }
}
