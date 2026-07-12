import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { areas, parseRoute, projectUrl, type Area } from './navigation/routes';
import { boundedList, createProjectRequestGate, displayArtifactType, displayBillingStatus, displayDocumentType, displayPhase, displayStatus, focusMainAfterMobileMoreNavigation, mobileMoreViewportDecision, projectListFromApiBody, projectStateSchema, projectViewKey, renderLimits, uiErrorCodeFromBody, uiErrorMessage, type Artifact, type ProjectContext, type ProjectState, type UiErrorCode } from './model';
import type { PublicProject } from './projects/registry';
import { buildGanttProjection } from './planning/gantt';
import './styles.css';
import './theme/responsive.css';
import './theme/contrast.css';
import './theme/gantt.css';

const labels: Record<Area, string> = {
  'aktueller-stand': 'Aktueller Stand',
  projektverlauf: 'Projektverlauf',
  arbeit: 'Arbeit',
  planung: 'Planung',
  lieferung: 'Lieferung',
  abrechnung: 'Abrechnung',
  quellen: 'Quellen',
};

type Theme = 'system' | 'light' | 'dark';
type ThemeSetter = React.Dispatch<React.SetStateAction<Theme>>;
type Navigate = (projectId: string, area: Area) => void;
type Route = ReturnType<typeof parseRoute>;
type BoundState = { projectId: string; value: ProjectState };
type BoundError = { projectId: string; code: UiErrorCode };
type BoundSelection = { viewKey: string; artifact: Artifact };

const isTheme = (value: string | null): value is Theme => value === 'system' || value === 'light' || value === 'dark';
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const readJson = async (response: Response) => { try { return await response.json() as unknown; } catch { return null; } };

if (typeof document !== 'undefined') document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) return;
  const items = [...dialog.querySelectorAll<HTMLElement>('button,select,[href],input,textarea')].filter((item) => !item.hasAttribute('disabled'));
  if (!items.length) return;
  const first = items[0]; const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => { const stored = localStorage.getItem('twin-theme'); return isTheme(stored) ? stored : 'system'; });
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.themeMode = theme;
    };
    apply(); media.addEventListener('change', apply); localStorage.setItem('twin-theme', theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return [theme, setTheme] as const;
}

function App() {
  const [projects, setProjects] = useState<PublicProject[]>();
  const [error, setError] = useState<UiErrorCode>();
  const [route, setRoute] = useState(() => parseRoute(location.pathname, []));
  const [state, setState] = useState<BoundState>();
  const [stateError, setStateError] = useState<BoundError>();
  const [theme, setTheme] = useTheme();
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<BoundSelection>();
  const moreButton = useRef<HTMLButtonElement>(null);
  const routeProjectId = route.kind === 'project' ? route.projectId : null;
  const currentProjectId = useRef<string | null>(routeProjectId); currentProjectId.current = routeProjectId;
  const requestGate = useRef(createProjectRequestGate());
  const closeMore = useCallback((focusTarget: 'trigger' | 'main' = 'trigger') => {
    setMore(false);
    requestAnimationFrame(() => { if (focusTarget === 'main') focusMainAfterMobileMoreNavigation(true, document); else moreButton.current?.focus(); });
  }, []);
  const adoptRoute = useCallback((next: Route) => {
    const nextProjectId = next.kind === 'project' ? next.projectId : null;
    if (nextProjectId !== currentProjectId.current) {
      requestGate.current.invalidate(); setState(undefined); setStateError(undefined);
    }
    currentProjectId.current = nextProjectId; setSelected(undefined); setRoute(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/projects', { signal: controller.signal }); const items = projectListFromApiBody(await readJson(response));
        if (!response.ok || !items) { if (!controller.signal.aborted) setError('PROJEKTLISTE_NICHT_VERFUEGBAR'); return; }
        setProjects(items);
        if (location.pathname === '/' && items.length === 1) history.replaceState(null, '', projectUrl(items[0].id, 'aktueller-stand'));
        adoptRoute(parseRoute(location.pathname, items.map((project) => project.id)));
      } catch (caught: unknown) { if (!isAbort(caught) && !controller.signal.aborted) setError('PROJEKTLISTE_NICHT_VERFUEGBAR'); }
    })();
    return () => controller.abort();
  }, [adoptRoute]);

  useEffect(() => {
    const handleHistory = () => { if (projects) adoptRoute(parseRoute(location.pathname, projects.map((project) => project.id))); };
    addEventListener('popstate', handleHistory); return () => removeEventListener('popstate', handleHistory);
  }, [adoptRoute, projects]);

  useEffect(() => {
    if (!routeProjectId) { requestGate.current.invalidate(); setState(undefined); setStateError(undefined); setSelected(undefined); return; }
    const projectId = routeProjectId; const controller = new AbortController(); const token = requestGate.current.begin(projectId);
    setState(undefined); setStateError(undefined); setSelected(undefined);
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/state`, { signal: controller.signal }); const body = await readJson(response);
        if (!response.ok) {
          const code = uiErrorCodeFromBody(body, 'PROJEKTSTAND_NICHT_VERFUEGBAR');
          if (requestGate.current.accepts(token, currentProjectId.current ?? '')) setStateError({ projectId, code });
          return;
        }
        const parsed = projectStateSchema.safeParse(body);
        if (!parsed.success) {
          if (requestGate.current.accepts(token, currentProjectId.current ?? '')) setStateError({ projectId, code: 'PROJEKTSTAND_NICHT_VERFUEGBAR' });
          return;
        }
        if (parsed.data.source.projectId !== projectId) {
          if (requestGate.current.accepts(token, currentProjectId.current ?? '')) setStateError({ projectId, code: 'PROJEKTKONTEXT_UNGUELTIG' });
          return;
        }
        if (!requestGate.current.accepts(token, currentProjectId.current ?? '', parsed.data.source.projectId)) return;
        setState({ projectId, value: parsed.data });
      } catch (caught: unknown) {
        if (!isAbort(caught) && !controller.signal.aborted && requestGate.current.accepts(token, currentProjectId.current ?? '')) setStateError({ projectId, code: 'PROJEKTSTAND_NICHT_VERFUEGBAR' });
      }
    })();
    return () => controller.abort();
  }, [routeProjectId]);

  const navigate: Navigate = (projectId, area) => {
    history.pushState(null, '', projectUrl(projectId, area)); adoptRoute({ kind: 'project', projectId, area });
    if (more) closeMore('main');
  };

  if (error) return <Status title="Projektliste nicht verfügbar" text={uiErrorMessage(error, 'PROJEKTLISTE_NICHT_VERFUEGBAR')} />;
  if (!projects) return <Status title="Projekt-Twin wird geladen" text="Die konfigurierte Projektliste wird gelesen." busy />;
  if (route.kind === 'project-not-found') return <Status title="Projekt nicht gefunden" text="Für diese Projekt-ID ist keine konfigurierte Quelle registriert." />;
  if (route.kind !== 'project') return <Status title="Ansicht nicht verfügbar" text="Die angeforderte Projektansicht ist nicht vorhanden." />;
  const project = projects.find((item) => item.id === route.projectId);
  if (!project) return <Status title="Projekt nicht gefunden" text="Für diese Projekt-ID ist keine konfigurierte Quelle registriert." />;
  const context: ProjectContext = { projectId: project.id, projectKey: project.key, projectName: project.name };
  const viewKey = projectViewKey(context.projectId, route.area);
  const visibleState = state?.projectId === context.projectId && state.value.source.projectId === context.projectId ? state.value : undefined;
  const visibleError = stateError?.projectId === context.projectId ? stateError.code : undefined;
  const visibleSelection = selected?.viewKey === viewKey ? selected.artifact : undefined;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Zum Hauptinhalt springen</a>
    <Header context={context} projects={projects} area={route.area} navigate={navigate} theme={theme} setTheme={setTheme} />
    <Sidebar context={context} active={route.area} navigate={navigate} />
    <main id="main" tabIndex={-1}>
      <div className="page-heading"><p>{context.projectKey} / {context.projectName}</p><h1>{labels[route.area]}</h1></div>
      {visibleError ? <Status title={visibleError === 'SNAPSHOT_VERTRAG_BLOCKIERT' ? 'Spectra-Snapshotvertrag blockiert' : 'Quelle nicht verfügbar'} text={uiErrorMessage(visibleError)} embedded />
          : !visibleState ? <Status title="Projektstand wird geladen" text="Die commitgebundene Quellen-Momentaufnahme wird gelesen." busy embedded />
            : <ProjectArea area={route.area} state={visibleState} context={context} open={(artifact) => setSelected({ viewKey, artifact })} />}
    </main>
    <nav className="bottom-nav" aria-label="Mobile Hauptnavigation">
      {(['aktueller-stand', 'projektverlauf', 'arbeit'] as Area[]).map((area) => <button key={area} aria-current={route.area === area ? 'page' : undefined} onClick={() => navigate(context.projectId, area)}>{labels[area]}</button>)}
      <button ref={moreButton} aria-expanded={more} onClick={() => setMore(true)}>Mehr</button>
    </nav>
    {more && <MobileMore context={context} projects={projects} active={route.area} navigate={navigate} theme={theme} setTheme={setTheme} close={closeMore} />}
    {visibleSelection && <Detail artifact={visibleSelection} storyTicket={state?.value.story?.tickets.find((ticket) => ticket.id === visibleSelection.id)} close={() => setSelected(undefined)} />}
  </div>;
}

type HeaderProps = { context: ProjectContext; projects: PublicProject[]; area: Area; navigate: Navigate; theme: Theme; setTheme: ThemeSetter };
function Header({ context, projects, area, navigate, theme, setTheme }: HeaderProps) {
  return <header className="topbar"><div className="brand"><strong>UNIVERSAARL</strong><span>PROJEKT-TWIN</span></div><label className="project-switcher">Projekt wechseln<select aria-label="Projekt wechseln" value={context.projectId} onChange={(event) => navigate(event.target.value, area)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.key}</option>)}</select></label><ThemeSelect theme={theme} setTheme={setTheme} /></header>;
}

type SidebarProps = { context: ProjectContext; active: Area; navigate: Navigate };
function Sidebar({ context, active, navigate }: SidebarProps) {
  return <aside className="sidebar"><nav aria-label="Projektbereiche">{areas.map((area) => <button key={area} aria-current={active === area ? 'page' : undefined} onClick={() => navigate(context.projectId, area)}>{labels[area]}</button>)}</nav><p>NUR LESEN · {context.projectKey}</p></aside>;
}

function ThemeSelect({ theme, setTheme }: { theme: Theme; setTheme: ThemeSetter }) {
  return <label className="theme-select">Darstellung<select aria-label="Darstellung wählen" value={theme} onChange={(event) => { if (isTheme(event.target.value)) setTheme(event.target.value); }}><option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></label>;
}

type MobileMoreProps = Omit<HeaderProps, 'area'> & { active: Area; close: (focusTarget?: 'trigger' | 'main') => void };
function MobileMore({ context, projects, active, navigate, theme, setTheme, close }: MobileMoreProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button,select')?.focus();
    const desktop = matchMedia('(min-width: 721px)');
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close('trigger'); };
    const handleViewport = () => { if (mobileMoreViewportDecision(true, window.innerWidth, desktop.matches) === 'close-to-main') close('main'); };
    addEventListener('keydown', handleKey); addEventListener('resize', handleViewport); desktop.addEventListener('change', handleViewport); handleViewport();
    return () => { removeEventListener('keydown', handleKey); removeEventListener('resize', handleViewport); desktop.removeEventListener('change', handleViewport); };
  }, [close]);
  return <div className="modal-scrim"><div className="more-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="more-title"><header><h2 id="more-title">Weitere Bereiche</h2><button onClick={() => close('trigger')} aria-label="Menü schließen">Schließen</button></header><label>Projekt wechseln<select aria-label="Projekt wechseln" value={context.projectId} onChange={(event) => navigate(event.target.value, active)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.key}</option>)}</select></label><ThemeSelect theme={theme} setTheme={setTheme} /><nav aria-label="Weitere Projektbereiche">{areas.slice(3).map((area) => <button key={area} onClick={() => navigate(context.projectId, area)}>{labels[area]}</button>)}</nav></div></div>;
}

const workKinds = new Set<Artifact['kind']>(['epic', 'story', 'task', 'bug']);
const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const isWorkArtifact = (artifact: Artifact) => workKinds.has(artifact.kind);
const sourceText = (value: string | null) => value ?? 'Nicht belegt';
const sourcePhaseLabel = (artifact: Artifact) => artifact.phaseId ?? artifact.sourcePhase ?? displayPhase(artifact.phase);
const sourceEffortLabel = (artifact: Artifact) => artifact.estimateHours !== null ? `${numberFormatter.format(artifact.estimateHours)} Std. geplant` : artifact.effort ?? 'Nicht belegt';
const sourceActualLabel = (artifact: Artifact) => artifact.actualHours !== null ? `${numberFormatter.format(artifact.actualHours)} Std.` : 'Nicht belegt';
const sourceDateLabel = (value: string | null) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' }) : 'Nicht belegt';
const sourceDateTimeLabel = (value: string) => new Date(value).toLocaleString('de-DE');

function ProjectArea({ area, state, context, open }: { area: Area; state: ProjectState; context: ProjectContext; open: (artifact: Artifact) => void }) {
  if (area === 'aktueller-stand') return <Current state={state} context={context} open={open} />;
  if (area === 'arbeit') return <Work state={state} open={open} />;
  if (area === 'projektverlauf') return <ProjectHistory state={state} open={open} />;
  if (area === 'planung') return <Planning state={state} open={open} />;
  if (area === 'lieferung') return <Delivery state={state} open={open} />;
  if (area === 'abrechnung') return <Billing state={state} open={open} />;
  return <Sources state={state} context={context} />;
}

function SourceEmpty({ title, text }: { title: string; text: string }) {
  return <section className="source-empty"><p>QUELLDATEN NICHT VORHANDEN</p><h2>{title}</h2><p>{text}</p><small>Der Projekt-Twin erzeugt keine Beispieldaten oder Ersatzwerte.</small></section>;
}

function ReferenceSummary({ values }: { values: readonly string[] }) {
  const references = boundedList(values, renderLimits.rowReferences);
  if (!references.total) return <>Keine</>;
  return <span className="reference-summary">{references.items.map((value) => <code key={value}>{value}</code>)}{references.limited && <small>+{references.total - references.visible}</small>}</span>;
}

function Work({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const tickets = boundedList(state.artifacts.filter(isWorkArtifact).sort((a, b) => Number(!a.sourceType?.startsWith('project-story-')) - Number(!b.sourceType?.startsWith('project-story-'))), renderLimits.artifacts);
  if (!tickets.total) return <SourceEmpty title="Keine Jira-Artefakte belegt" text="Der commitgebundene Projektstand enthält keine durch den Projektvertrag referenzierten Jira-Vorgänge." />;
  return <section className="area-view"><header><div><p>JIRA-ARTEFAKTE</p><h2>Quellgebundene Arbeit</h2></div><span>{tickets.limited ? `${tickets.visible} von ${tickets.total} Vorgängen` : `${tickets.total} Vorgänge`}</span></header>
    <p className="honest-note">Typ, Status, Phase, Arbeitsstrom, Aufwand und Abhängigkeiten stammen ausschließlich aus dem ausgewiesenen Commit.</p>
    <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Vorgang</th><th>Typ</th><th>Status</th><th>Phase</th><th>Arbeitsstrom</th><th>Aufwand</th><th>Abhängigkeiten</th></tr></thead><tbody>{tickets.items.map((artifact) => <tr key={artifact.id}><td><button className="text-action" onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span></button></td><td>{displayArtifactType(artifact.sourceType)}</td><td>{displayStatus(artifact.status)}</td><td><code>{sourcePhaseLabel(artifact)}</code></td><td>{sourceText(artifact.workstream)}</td><td>{sourceEffortLabel(artifact)}</td><td><ReferenceSummary values={artifact.dependencies} /></td></tr>)}</tbody></table></div>
    {tickets.limited && <p className="honest-note">Angezeigt werden die ersten {tickets.visible} von {tickets.total} belegten Vorgängen.</p>}
  </section>;
}

function ProjectHistory({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const events = boundedList(state.artifacts.filter(isWorkArtifact).flatMap((artifact) => artifact.history.map((event) => ({ artifact, event }))), renderLimits.historyEvents);
  const meetings = boundedList(state.artifacts.filter((artifact) => artifact.kind === 'document' && artifact.documentType === 'meeting-transcript'), renderLimits.artifacts);
  if (!events.total && !meetings.total) return <SourceEmpty title="Kein Projektverlauf belegt" text="Weder strukturierte Jira-Übergänge noch Besprechungstranskripte sind im normalisierten Quellenvertrag vorhanden." />;
  return <section className="area-view"><header><div><p>BELEGTER VERLAUF</p><h2>Statusübergänge und Besprechungen</h2></div><span>{events.total} Übergänge · {meetings.total} Transkripte</span></header>
    {events.total > 0 && <div className="timeline-list">{events.items.map(({ artifact, event }, index) => <article key={`${artifact.id}-${event.at}-${index}`}><time dateTime={event.at}>{sourceDateTimeLabel(event.at)}</time><button className="text-action" onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span></button><p>{displayStatus(event.from)} → {displayStatus(event.to)}</p><small>Akteur: <code>{event.by}</code>{artifact.historySynthetic === true ? ' · In der Quelle als synthetisch gekennzeichnet' : ''}</small></article>)}</div>}
    {events.limited && <p className="honest-note">Angezeigt werden die ersten {events.visible} von {events.total} belegten Übergängen.</p>}
    <DocumentCards title="Besprechungstranskripte" artifacts={meetings} open={open} emptyText="Keine strukturierten Besprechungstranskripte belegt." />
  </section>;
}

function Planning({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const tickets = boundedList(state.artifacts.filter((artifact) => isWorkArtifact(artifact) && (artifact.startDate !== null || artifact.dueDate !== null || artifact.phaseId !== null || artifact.sourcePhase !== null)), renderLimits.artifacts);
  const gantt = buildGanttProjection(state.artifacts);
  if (!tickets.total && !gantt) return <SourceEmpty title="Keine Zeitplanung belegt" text="Der normalisierte Quellenvertrag enthält keine Tickettermine oder Phasenzuordnungen." />;
  return <section className="area-view"><header><div><p>QUELLZEITPLAN</p><h2>Projektplan nach Phasen</h2></div><span>{gantt?.rows.length ?? 0} Phasen · {tickets.total} geplante Vorgänge</span></header>
    <p className="honest-note">Die Zeitachse stellt ausschließlich belegte Datumswerte des ausgewiesenen Commits dar. Sie ist keine Kundenzusage und erzeugt keine Termine.</p>
    {gantt && <div className="gantt" aria-label={`Gantt-Diagramm vom ${sourceDateLabel(gantt.startDate)} bis ${sourceDateLabel(gantt.endDate)}`}><div className="gantt-axis"><span>{sourceDateLabel(gantt.startDate)}</span><strong>{gantt.totalDays} Kalendertage</strong><span>{sourceDateLabel(gantt.endDate)}</span></div><div className="gantt-rows">{gantt.rows.map((row) => { const phaseTickets = row.artifact.ticketRefs.map((id) => ({ id, artifact: state.artifacts.find((item) => item.id === id && isWorkArtifact(item)) })); return <article key={row.artifact.id} className="gantt-row"><div className="gantt-phase"><button className="gantt-label" onClick={() => open(row.artifact)}><code>{row.artifact.id}</code><span>{sourceText(row.artifact.title)}</span><small>{sourceDateLabel(row.startDate)} – {sourceDateLabel(row.endDate)} · {sourceEffortLabel(row.artifact)}</small></button><div className="gantt-tickets"><strong>Zugehörige Tickets</strong>{phaseTickets.length ? phaseTickets.map(({ id, artifact }) => artifact ? <button key={id} onClick={() => open(artifact)}><code>{id}</code><span>{sourceText(artifact.title)}</span></button> : <span key={id}><code>{id}</code> · Referenz nicht aufgelöst</span>) : <span>Keine Ticketreferenz belegt</span>}</div></div><div className="gantt-track" aria-hidden="true"><span style={{ marginInlineStart: `${row.offsetPercent}%`, width: `${row.widthPercent}%` }} /></div></article>; })}</div></div>}
    {tickets.total > 0 && <><h3 className="planning-table-title">Zugeordnete Vorgänge</h3><div className="source-table-wrap"><table className="source-table"><thead><tr><th>Vorgang</th><th>Phase</th><th>Beginn</th><th>Fällig</th><th>Planaufwand</th></tr></thead><tbody>{tickets.items.map((artifact) => <tr key={artifact.id}><td><button className="text-action" onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span></button></td><td><code>{sourcePhaseLabel(artifact)}</code></td><td>{sourceDateLabel(artifact.startDate)}</td><td>{sourceDateLabel(artifact.dueDate)}</td><td>{sourceEffortLabel(artifact)}</td></tr>)}</tbody></table></div></>}{tickets.limited && <p className="honest-note">Angezeigt werden die ersten {tickets.visible} von {tickets.total} belegten Planungszeilen.</p>}</section>;
}

function Delivery({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const deliverables = boundedList(state.artifacts.filter(isWorkArtifact).flatMap((artifact) => artifact.deliverables.map((deliverable) => ({ artifact, deliverable }))), renderLimits.artifacts);
  const documents = boundedList(state.artifacts.filter((artifact) => artifact.kind === 'document'), renderLimits.artifacts);
  if (!deliverables.total && !documents.total) return <SourceEmpty title="Keine Liefergegenstände belegt" text="Der normalisierte Quellenvertrag enthält weder Ticket-Liefergegenstände noch Dokumentationsartefakte." />;
  return <section className="area-view"><header><div><p>QUELLLIEFERUNG</p><h2>Liefergegenstände und Dokumentation</h2></div><span>{deliverables.total} Liefergegenstände · {documents.total} Dokumente</span></header>
    {deliverables.total > 0 && <div className="deliverable-list">{deliverables.items.map(({ artifact, deliverable }) => <article key={`${artifact.id}-${deliverable.id}`}><button className="text-action" onClick={() => open(artifact)}><code>{deliverable.id}</code><span>{displayDocumentType(deliverable.type)}</span></button><p>{deliverable.status}</p><small>Ticket <code>{artifact.id}</code> · Quelle <code>{deliverable.path}</code></small></article>)}</div>}
    {deliverables.limited && <p className="honest-note">Angezeigt werden die ersten {deliverables.visible} von {deliverables.total} belegten Liefergegenständen.</p>}
    <DocumentCards title="Dokumentationsartefakte" artifacts={documents} open={open} emptyText="Keine eigenständigen Dokumentationsartefakte belegt." />
  </section>;
}

function Billing({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const tickets = boundedList(state.artifacts.filter((artifact) => isWorkArtifact(artifact) && (artifact.billable !== null || artifact.billingWeek !== null || artifact.billingStatus !== null)), renderLimits.artifacts);
  const documents = boundedList(state.artifacts.filter((artifact) => artifact.kind === 'document' && (artifact.documentType === 'budget' || artifact.documentType === 'worklog')), renderLimits.artifacts);
  if (!tickets.total && !documents.total) return <SourceEmpty title="Keine Abrechnungsdaten belegt" text="Der normalisierte Quellenvertrag enthält keine Abrechnungskennzeichen, Budget- oder Arbeitsprotokollartefakte." />;
  return <section className="area-view"><header><div><p>QUELLABRECHNUNG</p><h2>Ticketaufwand und Abrechnungsstatus</h2></div><span>{tickets.total} Ticketzeilen</span></header>
    {tickets.total > 0 && <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Vorgang</th><th>Abrechenbar</th><th>Geplant</th><th>Erfasst</th><th>Woche</th><th>Status</th></tr></thead><tbody>{tickets.items.map((artifact) => <tr key={artifact.id}><td><button className="text-action" onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span></button></td><td>{artifact.billable === null ? 'Nicht belegt' : artifact.billable ? 'Ja' : 'Nein'}</td><td>{sourceEffortLabel(artifact)}</td><td>{sourceActualLabel(artifact)}</td><td>{artifact.billingWeek ?? 'Nicht belegt'}</td><td>{displayBillingStatus(artifact.billingStatus)}</td></tr>)}</tbody></table></div>}
    {tickets.limited && <p className="honest-note">Angezeigt werden die ersten {tickets.visible} von {tickets.total} belegten Abrechnungszeilen.</p>}
    <DocumentCards title="Budget und Arbeitsprotokolle" artifacts={documents} open={open} emptyText="Keine eigenständigen Budget- oder Arbeitsprotokollartefakte belegt." />
  </section>;
}

function DocumentCards({ title, artifacts, open, emptyText }: { title: string; artifacts: Readonly<{ items: Artifact[]; total: number; visible: number; limited: boolean }>; open: (artifact: Artifact) => void; emptyText: string }) {
  return <section className="document-section"><h3>{title}</h3>{artifacts.total ? <div className="document-grid">{artifacts.items.map((artifact) => <button key={artifact.id} onClick={() => open(artifact)}><code>{artifact.id}</code><strong>{sourceText(artifact.title)}</strong><small>{displayDocumentType(artifact.documentType)} · {displayStatus(artifact.status)}</small></button>)}</div> : <p className="honest-note">{emptyText}</p>}{artifacts.limited && <p className="honest-note">Angezeigt werden die ersten {artifacts.visible} von {artifacts.total} belegten Dokumenten.</p>}</section>;
}

type StoryTab = 'uebersicht' | 'angebot' | 'seiten' | 'tickets' | 'timeline' | 'hypercare' | 'beziehungen';

function StoryCockpit({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const [tab, setTab] = useState<StoryTab>('uebersicht');
  const story = state.story;
  if (!story) return null;
  const artifactById = (id: string) => state.artifacts.find((artifact) => artifact.id === id);
  const tabs: Array<[StoryTab, string]> = [['uebersicht', 'Übersicht'], ['angebot', 'Angebot'], ['seiten', 'Seitenbaum'], ['tickets', 'Tickets'], ['timeline', 'Timeline'], ['hypercare', 'Hypercare'], ['beziehungen', 'Beziehungen']];
  return <section className="records story-cockpit"><header><div><p>VOLLSTÄNDIGE PROJEKTSTORY</p><h2>Vom Angebot bis zum Handover</h2></div><span>{story.relations.length} belegte Beziehungen</span></header><nav className="story-tabs" aria-label="Projektstory-Ansichten">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === 'uebersicht' && <div className="story-dashboard"><div className="story-metric"><b>{story.offer?.versions.length ?? 0}</b><span>Angebotsversionen</span></div><div className="story-metric"><b>{story.pages.length}</b><span>Seiten</span></div><div className="story-metric"><b>{story.tickets.length}</b><span>Tickets</span></div><div className="story-metric"><b>{story.timeline.length}</b><span>Timeline-Ereignisse</span></div><div className="story-metric"><b>{story.hypercare.length}</b><span>Hypercare-Tage</span></div><div className="story-metric"><b>{story.controls?.openP1 ?? 0}/{story.controls?.openP2 ?? 0}</b><span>Offene P1/P2</span></div></div>}
    {tab === 'angebot' && story.offer && <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Version</th><th>Datum</th><th>Status</th><th>Änderung</th><th>Stunden</th><th>Kosten</th></tr></thead><tbody>{story.offer.versions.map((version) => <tr key={version.version}><td>{version.version}</td><td>{sourceDateLabel(version.date)}</td><td>{version.status}</td><td>{version.delta}</td><td>{version.hours ?? 'Nicht belegt'}</td><td>{version.cost === null ? 'Nicht belegt' : `${numberFormatter.format(version.cost)} EUR`}</td></tr>)}</tbody></table><p className="honest-note">Plan: {story.offer.plannedHours ?? 'Nicht belegt'} Std. / {story.offer.plannedCost ?? 'Nicht belegt'} EUR · Ist: {story.offer.actualHours ?? 'Nicht belegt'} Std. / {story.offer.actualCost ?? 'Nicht belegt'} EUR.</p></div>}
    {tab === 'seiten' && <div className="story-page-tree">{story.pages.map((page) => <article key={page.id} style={{ paddingInlineStart: `${page.parent ? 1.5 : 0}rem` }}><button className="text-action" onClick={() => artifactById(page.id) && open(artifactById(page.id) as Artifact)}><code>{page.id}</code><strong>{page.title}</strong></button><small>Version {page.version ?? '–'} · {page.status ?? 'Nicht belegt'} · Quelle <code>{page.sourcePath}</code></small><p>{page.content ? page.content.replace(/^---[\s\S]*?---\s*/, '').trim().slice(0, 800) : 'Kein Seiteninhalt belegt.'}</p></article>)}</div>}
    {tab === 'tickets' && <div className="story-ticket-board">{(['done', 'closed', 'in-progress', 'backlog'] as const).map((status) => <section key={status}><h3>{displayStatus(status)}</h3>{story.tickets.filter((ticket) => ticket.status.toLowerCase() === status).map((ticket) => <button key={ticket.id} className="story-ticket" onClick={() => artifactById(ticket.id) && open(artifactById(ticket.id) as Artifact)}><code>{ticket.id}</code><strong>{ticket.summary}</strong><span>{ticket.priority ?? 'Priorität nicht belegt'} · {ticket.worklogs.reduce((sum, log) => sum + log.hours, 0)} Std.</span></button>)}{!story.tickets.some((ticket) => ticket.status.toLowerCase() === status) && <p className="honest-note">Keine Tickets belegt.</p>}</section>)}</div>}
    {tab === 'timeline' && <div className="story-timeline">{story.timeline.map((event) => <article key={event.id}><time dateTime={event.time}>{sourceDateTimeLabel(event.time)}</time><button className="text-action" onClick={() => artifactById(event.id) && open(artifactById(event.id) as Artifact)}><code>{event.id}</code><strong>{event.phase}: {event.action}</strong></button><p>{event.result} · Entscheidung: {event.decision} · Nächster Schritt: {event.nextStep}</p><small>Tickets: <ReferenceSummary values={event.tickets} /> · Seiten: <ReferenceSummary values={event.pages} /> · Evidence: <ReferenceSummary values={event.evidence} /></small></article>)}</div>}
    {tab === 'hypercare' && <div className="story-hypercare">{story.hypercare.map((day) => <article key={day.day}><header><h3>Tag {day.day}</h3><span>{day.priority} · {day.status}</span></header><p><strong>Diagnose:</strong> {day.diagnosis}</p><p><strong>Fix:</strong> {day.fix}</p><p><strong>Retest:</strong> {day.retest} · <strong>Entscheidung:</strong> {day.decision}</p><p>Ticket <code>{day.ticket}</code> · Seite <code>{day.dailyPage}</code> · Kommentar <code>{day.comment}</code></p><p>Evidence: <ReferenceSummary values={day.evidence} /></p></article>)}</div>}
    {tab === 'beziehungen' && <div className="story-relations"><p className="honest-note">Die Darstellung bleibt auf die ersten 60 von {story.relations.length} positivgelisteten Beziehungen begrenzt.</p>{story.relations.slice(0, 60).map((relation, index) => <div key={`${relation.from}-${relation.to}-${index}`}><button className="text-action" onClick={() => artifactById(relation.from) && open(artifactById(relation.from) as Artifact)}><code>{relation.from}</code></button><span>→ {relation.kind} →</span><button className="text-action" onClick={() => artifactById(relation.to) && open(artifactById(relation.to) as Artifact)}><code>{relation.to}</code></button></div>)}</div>}
  </section>;
}

function Current({ state, context, open }: { state: ProjectState; context: ProjectContext; open: (artifact: Artifact) => void }) {
  const artifacts = boundedList(state.artifacts, renderLimits.artifacts); const evidenceItems = boundedList(state.evidenceItems, renderLimits.evidenceItems); const gaps = boundedList(state.gaps, renderLimits.gaps);
  const story = state.artifacts.filter((artifact) => artifact.sourceType?.startsWith('project-story-'));
  const spectraEvidence = boundedList(state.artifacts.filter((artifact) => artifact.sourceType?.startsWith('spectra-')), renderLimits.artifacts);
  return <>
    <section className="snapshot-intro"><div><p>{state.source.snapshot ? 'MOMENTAUFNAHME' : 'BRANCH-COMMIT-SIMULATION'}</p><h2>Aktueller Projektstand</h2><p>{state.source.snapshot ? 'Momentaufnahme des eingelesenen commitgebundenen Blueprint-Stands – keine historische Wiedergabe.' : 'Repositorybasierte Sandbox-Simulation aus dem gebundenen BC-Basic-Branch-Commit. Kein Produktivbetrieb und keine reale Kunden-, Steuer- oder BC-Transaktion.'}</p></div><dl><dt>Projekt</dt><dd>{context.projectName}</dd><dt>Projektschlüssel</dt><dd>{context.projectKey}</dd><dt>Quellen-Commit</dt><dd><code>{state.source.commit}</code></dd><dt>Eingelesen</dt><dd>{new Date(state.source.readAt).toLocaleString('de-DE')}</dd></dl></section>
    <section className="summary-grid"><div><b>{state.stats.jira}</b><span>Jira-Vorgänge</span></div><div><b>{state.stats.capabilities}</b><span>Fähigkeiten</span></div><div><b>{state.stats.changes}</b><span>OpenSpec-Änderungen</span></div><div><b>{state.stats.evidence}</b><span>Prüfnachweise</span></div></section>
    {story.length > 0 && <StoryCockpit state={state} open={open} />}
    <DocumentCards title="Spectra-Bindung und Konformität" artifacts={spectraEvidence} open={open} emptyText="Im gebundenen Commit ist keine positivgelistete Spectra-Bindungs- oder Konformitäts-Evidence vorhanden." />
    <section className="records"><header><div><p>BELEGTE ARTEFAKTE</p><h2>Aktuelle Momentaufnahme</h2></div><span>{artifacts.limited ? `${artifacts.visible} von ${artifacts.total} Datensätzen` : `${artifacts.total} Datensätze`}</span></header>{artifacts.limited && <p className="honest-note">Die Übersicht ist auf die ersten {renderLimits.artifacts} belegten Datensätze begrenzt. Die Gesamtzahl bleibt sichtbar.</p>}<div className="record-list">{artifacts.items.map((artifact) => <button key={`${artifact.kind}-${artifact.id}`} onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span><small>{displayStatus(artifact.status)} · {sourceText(artifact.workstream)}</small></button>)}</div></section>
    <section className="evidence"><header><div><p>BILDNACHWEISE</p><h2>Commitgebundene Nachweise</h2></div><span>{evidenceItems.limited ? `${evidenceItems.visible} von ${evidenceItems.total} Bildnachweisen` : `${evidenceItems.total} Bildnachweise`}</span></header>{evidenceItems.limited && <p className="honest-note">Angezeigt werden die ersten {evidenceItems.visible} von {evidenceItems.total} belegten Bildnachweisen.</p>}{evidenceItems.total ? <div className="evidence-grid">{evidenceItems.items.map((item) => <figure key={item.id}><img src={`/api/projects/${encodeURIComponent(context.projectId)}/evidence/${encodeURIComponent(item.id)}`} alt={item.title} loading="lazy" /><figcaption>{item.title}</figcaption></figure>)}</div> : <p className="honest-note">Im ausgewiesenen Commit sind keine unterstützten Bildnachweise belegt.</p>}</section>
    <section className="gaps"><header><div><p>BEKANNTE DATENLÜCKEN</p><h2>Fehlendes bleibt sichtbar</h2></div><span>{gaps.limited ? `${gaps.visible} von ${gaps.total} Datenlücken` : `${gaps.total} Datenlücken`}</span></header>{gaps.limited && <p className="honest-note">Angezeigt werden die ersten {gaps.visible} von {gaps.total} bekannten Datenlücken.</p>}<ul>{gaps.items.map((gap, index) => <li key={`${index}-${gap}`}>{gap}</li>)}</ul></section>
  </>;
}

function Sources({ state, context }: { state: ProjectState; context: ProjectContext }) {
  const paths = boundedList([...new Set(state.artifacts.map((artifact) => artifact.sourcePath))], renderLimits.sourcePaths); const warnings = boundedList(state.warnings, renderLimits.warnings);
  return <section className="sources"><p>SICHERE QUELLENINFORMATION</p><h2>{context.projectName} · {context.projectKey}</h2><dl><dt>Registrierungs-ID</dt><dd>{context.projectId}</dd><dt>Projektschlüssel</dt><dd>{context.projectKey}</dd><dt>Quellenzweig</dt><dd>{state.source.branch}</dd><dt>Vollständiger Commit</dt><dd><code>{state.source.commit}</code></dd><dt>Quellenstatus</dt><dd>{state.source.dirty ? 'Arbeitskopie mit nicht commitgebundenen Änderungen' : 'Commitgebundene Momentaufnahme'}</dd><dt>Einlesezeit</dt><dd>{new Date(state.source.readAt).toLocaleString('de-DE')}</dd></dl><h3>Sichere repository-bezogene Provenienz</h3>{paths.total ? <ul>{paths.items.map((sourcePath) => <li key={sourcePath}><code>{sourcePath}</code></li>)}</ul> : <p className="honest-note">Keine unterstützte Provenienz belegt.</p>}{paths.limited && <p className="honest-note">Angezeigt werden {paths.visible} von {paths.total} belegten Quellpfaden.</p>}<h3>Prüf- und Quellenhinweise</h3>{warnings.total ? <ul>{warnings.items.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul> : <p className="honest-note">Keine zusätzlichen Quellenhinweise.</p>}{warnings.limited && <p className="honest-note">Angezeigt werden die ersten {warnings.visible} von {warnings.total} Prüf- und Quellenhinweisen.</p>}</section>;
}

type StoryTicket = NonNullable<ProjectState['story']>['tickets'][number];

function Detail({ artifact, storyTicket, close }: { artifact: Artifact; storyTicket?: StoryTicket; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); }; addEventListener('keydown', handleKey); return () => { removeEventListener('keydown', handleKey); trigger.current?.focus(); }; }, [close]);
  const dependencies = boundedList(artifact.dependencies, renderLimits.detailReferences); const documents = boundedList(artifact.documents, renderLimits.detailReferences);
  const meetings = boundedList(artifact.meetings, renderLimits.detailReferences); const evidence = boundedList(artifact.evidence, renderLimits.detailEvidence);
  const deliverables = boundedList(artifact.deliverables, renderLimits.detailReferences); const history = boundedList(artifact.history, renderLimits.historyEvents);
  const storyEvidence = storyTicket ? boundedList(storyTicket.evidenceRefs, renderLimits.detailEvidence) : null;
  return <div className="drawer-scrim"><div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="drawer-close" onClick={close}>Schließen</button><h2 id="detail-title">{artifact.id}</h2><h3>{sourceText(artifact.title)}</h3><dl>
    <dt>Typ</dt><dd>{displayArtifactType(artifact.sourceType)}</dd><dt>Status</dt><dd>{displayStatus(artifact.status)}</dd><dt>Phase</dt><dd><code>{sourcePhaseLabel(artifact)}</code></dd><dt>Arbeitsstrom</dt><dd>{sourceText(artifact.workstream)}</dd>
    <dt>Planaufwand</dt><dd>{sourceEffortLabel(artifact)}</dd><dt>Erfasster Aufwand</dt><dd>{sourceActualLabel(artifact)}</dd><dt>Beginn</dt><dd>{sourceDateLabel(artifact.startDate)}</dd><dt>Fällig</dt><dd>{sourceDateLabel(artifact.dueDate)}</dd>
    <dt>Abrechenbar</dt><dd>{artifact.billable === null ? 'Nicht belegt' : artifact.billable ? 'Ja' : 'Nein'}</dd><dt>Abrechnungswoche</dt><dd>{artifact.billingWeek ?? 'Nicht belegt'}</dd><dt>Abrechnungsstatus</dt><dd>{displayBillingStatus(artifact.billingStatus)}</dd>
    <dt>Dokumenttyp</dt><dd>{displayDocumentType(artifact.documentType)}</dd><dt>Besprechungsdatum</dt><dd>{sourceDateLabel(artifact.meetingDate)}</dd><dt>Verantwortung</dt><dd>{sourceText(artifact.owner)}</dd><dt>Priorität</dt><dd>{sourceText(artifact.priority)}</dd><dt>Quelle</dt><dd><code>{artifact.sourcePath}</code></dd>
  </dl><h4>Begründung und Inhalt</h4><p>{artifact.rationale || 'Nicht in der Quelle erfasst.'}</p>{storyTicket && <><h4>Akzeptanzkriterien</h4><ul>{storyTicket.acceptanceCriteria.map((criterion) => <li key={criterion.text}>{criterion.fulfilled === null ? 'Nicht bewertet' : criterion.fulfilled ? 'Erfüllt' : 'Nicht erfüllt'}: {criterion.text}</li>)}</ul><h4>Typisierte Kommentare</h4><ul>{storyTicket.comments.map((comment) => <li key={comment.id}><strong>{comment.type}</strong> · {comment.time ?? 'Datum nicht belegt'} · {comment.role ?? 'Rolle nicht belegt'}: {comment.text}{comment.evidenceRef ? ` · Evidence ${comment.evidenceRef}` : ''}</li>)}</ul><h4>Einzelne Worklogs</h4><ul>{storyTicket.worklogs.map((worklog, index) => <li key={`${worklog.date}-${index}`}>{worklog.date ?? 'Datum nicht belegt'} · {worklog.role ?? 'Rolle nicht belegt'} · {worklog.hours} Std.{worklog.cost === null ? '' : ` · ${numberFormatter.format(worklog.cost)} EUR`} · {worklog.activity ?? 'Aktivität nicht belegt'} · {worklog.phase ?? 'Phase nicht belegt'}</li>)}</ul><h4>Story-Evidence</h4>{storyEvidence && <DetailReferences title="Positivgelistete Evidence" values={storyEvidence} />}</>}{artifact.activity.length > 0 && !storyTicket && <><h4>Kommentare und Arbeitsnachweise</h4><ul>{artifact.activity.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></>}
    <DetailReferences title="Abhängigkeiten" values={dependencies} /><DetailReferences title="Dokumentreferenzen" values={documents} /><DetailReferences title="Besprechungsreferenzen" values={meetings} /><DetailReferences title="Nachweisreferenzen" values={evidence} />
    {deliverables.total > 0 && <><h4>Liefergegenstände</h4><ul>{deliverables.items.map((item) => <li key={item.id}><code>{item.id}</code> · {displayDocumentType(item.type)} · {item.status}<br /><small><code>{item.path}</code></small></li>)}</ul>{deliverables.limited && <p className="honest-note">Angezeigt werden {deliverables.visible} von {deliverables.total} Liefergegenständen.</p>}</>}
    {history.total > 0 && <><h4>Statushistorie</h4>{artifact.historySynthetic === true && <p className="honest-note">Diese Historie ist in der Quelle ausdrücklich als synthetisch gekennzeichnet.</p>}<ol>{history.items.map((item, index) => <li key={`${item.at}-${index}`}><time dateTime={item.at}>{sourceDateTimeLabel(item.at)}</time>: {displayStatus(item.from)} → {displayStatus(item.to)} · <code>{item.by}</code></li>)}</ol>{history.limited && <p className="honest-note">Angezeigt werden {history.visible} von {history.total} Statusübergängen.</p>}</>}
  </div></div>;
}

function DetailReferences({ title, values }: { title: string; values: Readonly<{ items: string[]; total: number; visible: number; limited: boolean }> }) {
  if (!values.total) return null;
  return <><h4>{title}</h4><ul>{values.items.map((value) => <li key={value}><code>{value}</code></li>)}</ul>{values.limited && <p className="honest-note">Angezeigt werden {values.visible} von {values.total} Referenzen.</p>}</>;
}

type StatusProps = { title: string; text: string; busy?: boolean; embedded?: boolean };
function Status({ title, text, busy = false, embedded = false }: StatusProps) {
  const content = <><p>{busy ? 'WIRD GELADEN' : 'NICHT VERFÜGBAR'}</p><h1>{title}</h1><span>{text}</span></>;
  return embedded ? <section className="status-page embedded" aria-busy={busy || undefined}>{content}</section> : <main className="status-page" aria-busy={busy || undefined}>{content}</main>;
}

createRoot(document.getElementById('root')!).render(<App />);
