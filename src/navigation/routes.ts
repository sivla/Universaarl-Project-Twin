export const areas = ['aktueller-stand', 'projektverlauf', 'arbeit', 'planung', 'lieferung', 'abrechnung', 'projektdokumentation', 'quellen'] as const;
export type Area = typeof areas[number];
export type RouteState = { kind: 'root' } | { kind: 'project'; projectId: string; area: Area } | { kind: 'project-not-found'; projectId: string } | { kind: 'area-not-found'; projectId: string };

export function parseRoute(pathname: string, projectIds: readonly string[]): RouteState {
  if (pathname === '/') return { kind: 'root' };
  const match = pathname.match(/^\/projekte\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return { kind: 'area-not-found', projectId: '' };
  let projectId: string;
  try { projectId = decodeURIComponent(match[1]); } catch { return { kind: 'project-not-found', projectId: '' }; }
  if (!projectIds.includes(projectId)) return { kind: 'project-not-found', projectId };
  return areas.includes(match[2] as Area) ? { kind: 'project', projectId, area: match[2] as Area } : { kind: 'area-not-found', projectId };
}

export function projectUrl(projectId: string, area: Area) { return `/projekte/${encodeURIComponent(projectId)}/${area}`; }
