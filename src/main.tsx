import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { areas, parseRoute, projectUrl, type Area } from './navigation/routes';
import { boundedList, createProjectRequestGate, displayArtifactType, displayBillingStatus, displayDocumentType, displayPhase, displayStatus, focusMainAfterMobileMoreNavigation, mobileMoreViewportDecision, paginateList, projectListFromApiBody, projectStateSchema, projectViewKey, renderLimits, uiErrorCodeFromBody, uiErrorMessage, uiErrorTitle, type Artifact, type PresentationTicket, type ProjectContext, type ProjectDocument, type ProjectState, type UiErrorCode } from './model';
import type { PublicProject } from './projects/registry';
import { buildGanttProjection } from './planning/gantt';
import { TicketsPage } from './components/TicketsPage';
import { TicketTypeIcon } from './components/TicketTypeIcon';
import { DocumentationSpaces } from './components/DocumentationSpaces';
import { buildCurrentOverview } from './current-overview';
import { ArtifactViewer } from './components/ArtifactViewer';
import { buildProjectJournal, filterJournalEvents, groupJournalEventsByDay, journalAsOf, journalEventCountSentence, journalSince, journalVisibleText, type JournalEvent, type JournalEventType, type JournalFilters, type JournalObjectType } from './project-journal';
import './styles.css';
import './theme/responsive.css';
import './theme/contrast.css';
import './theme/gantt.css';
import './theme/documentation.css';
import './theme/tickets.css';

const labels: Record<Area, string> = {
  'aktueller-stand': 'Aktueller Stand',
  tickets: 'Tickets',
  projekttagebuch: 'Projekttagebuch',
  projektverlauf: 'Projektverlauf',
  arbeit: 'Arbeit',
  planung: 'Planung',
  lieferung: 'Lieferung',
  abrechnung: 'Abrechnung',
  projektdokumentation: 'Projektdokumentation',
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
      {visibleError ? <Status title={uiErrorTitle(visibleError)} text={uiErrorMessage(visibleError)} embedded />
          : !visibleState ? <Status title="Projektstand wird geladen" text="Die commitgebundene Quellen-Momentaufnahme wird gelesen." busy embedded />
            : <ProjectArea area={route.area} state={visibleState} context={context} open={(artifact) => setSelected({ viewKey, artifact })} />}
    </main>
    <nav className="bottom-nav" aria-label="Mobile Hauptnavigation">
      {(['aktueller-stand', 'tickets', 'projektverlauf'] as Area[]).map((area) => <button key={area} aria-current={route.area === area ? 'page' : undefined} onClick={() => navigate(context.projectId, area)}>{labels[area]}</button>)}
      <button ref={moreButton} aria-expanded={more} onClick={() => setMore(true)}>Mehr</button>
    </nav>
    {more && <MobileMore context={context} projects={projects} active={route.area} navigate={navigate} theme={theme} setTheme={setTheme} close={closeMore} />}
    {visibleSelection && <Detail artifact={visibleSelection} artifacts={visibleState?.artifacts ?? []} storyTickets={visibleState?.story?.tickets ?? []} storyTicket={visibleState?.story?.tickets.find((ticket) => ticket.id === visibleSelection.id)} presentationTicket={visibleState?.presentation?.jira.tickets.find((ticket) => ticket.ticketId === visibleSelection.id)} select={(artifact) => setSelected({ viewKey, artifact })} close={() => setSelected(undefined)} />}
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

const workKinds = new Set<Artifact['kind']>(['phase', 'epic', 'story', 'task', 'bug']);
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
  if (area === 'tickets') return <TicketsPage state={state} open={open} />;
  if (area === 'projekttagebuch') return <ProjectJournal state={state} open={open} />;
  if (area === 'arbeit') return <Work state={state} open={open} />;
  if (area === 'projektverlauf') return <ProjectHistory state={state} open={open} />;
  if (area === 'planung') return <Planning state={state} open={open} />;
  if (area === 'lieferung') return <Delivery state={state} open={open} />;
  if (area === 'abrechnung') return <Billing state={state} open={open} />;
  if (area === 'projektdokumentation') return <Documentation state={state} />;
  return <Sources state={state} context={context} />;
}

function SourceEmpty({ title, text }: { title: string; text: string }) {
  return <section className="source-empty"><p>QUELLDATEN NICHT VORHANDEN</p><h2>{title}</h2><p>{text}</p><small>Der Projekt-Twin erzeugt keine Beispieldaten oder Ersatzwerte.</small></section>;
}

function ExpandableList({ label, total, threshold = 24, children }: { label: string; total: number; threshold?: number; children: React.ReactNode }) {
  if (total <= threshold) return <>{children}</>;
  return <details className="complete-list"><summary>{label} ({total})</summary>{children}</details>;
}

function ReferenceSummary({ values }: { values: readonly string[] }) {
  const references = boundedList(values, renderLimits.rowReferences);
  if (!references.total) return <>Keine</>;
  return <span className="reference-summary">{references.items.map((value) => <code key={value}>{value}</code>)}{references.limited && <small>+{references.total - references.visible}</small>}</span>;
}

const journalTypeLabels: Record<JournalEventType, string> = {
  status: 'Statusänderung',
  comment: 'Kommentar',
  worklog: 'Arbeitsnachweis',
  meeting: 'Besprechung',
  decision: 'Entscheidung',
  deliverable: 'Lieferobjekt',
  document: 'Dokumentstand',
  timeline: 'Projektmeilenstein',
};

const journalObjectLabels: Record<JournalObjectType, string> = {
  ticket: 'Ticket',
  meeting: 'Besprechung',
  decision: 'Entscheidung',
  deliverable: 'Lieferobjekt',
  document: 'Dokument',
  project: 'Projekt',
};

function journalDocumentUrl(state: ProjectState, documentId: string) {
  for (const space of state.presentation?.spaces ?? []) {
    const node = space.nodes.find((item) => item.documentId === documentId);
    if (node) return `${projectUrl(state.source.projectId, 'projektdokumentation')}?space=${encodeURIComponent(space.id)}&node=${encodeURIComponent(node.id)}`;
  }
  return projectUrl(state.source.projectId, 'projektdokumentation');
}

function artifactReferenceMap(artifacts: readonly Artifact[]) {
  const references = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const sourcePathCounts = new Map<string, number>();
  for (const artifact of artifacts) sourcePathCounts.set(artifact.sourcePath, (sourcePathCounts.get(artifact.sourcePath) ?? 0) + 1);
  for (const artifact of artifacts) if (sourcePathCounts.get(artifact.sourcePath) === 1 && !references.has(artifact.sourcePath)) references.set(artifact.sourcePath, artifact);
  return references;
}

function JournalReference({ reference, state, artifactById, open }: { reference: string; state: ProjectState; artifactById: ReadonlyMap<string, Artifact>; open: (artifact: Artifact) => void }) {
  const artifact = artifactById.get(reference);
  if (artifact) return <button className="journal-reference" onClick={() => open(artifact)}><code>{reference}</code><span>Detail öffnen</span></button>;
  if (state.documents.some((document) => document.id === reference)) return <a className="journal-reference" href={journalDocumentUrl(state, reference)}><code>{reference}</code><span>Dokument öffnen</span></a>;
  const evidence = state.evidenceItems.find((item) => item.id === reference);
  if (evidence) return <a className="journal-reference" href={`/api/projects/${encodeURIComponent(state.source.projectId)}/evidence/${encodeURIComponent(reference)}`}><code>{reference}</code><span>Evidence öffnen</span></a>;
  return <span className="journal-reference unresolved"><code>{reference}</code><span>Referenz im Zeitpunktstand nicht auflösbar</span></span>;
}

function JournalEventCard({ event, state, artifactById, open }: { event: JournalEvent; state: ProjectState; artifactById: ReadonlyMap<string, Artifact>; open: (artifact: Artifact) => void }) {
  const actorText = event.actor.displayName
    ? `${event.actor.displayName}${event.actor.role ? ` · ${event.actor.role}` : ''}`
    : event.actor.role ? `Rolle: ${event.actor.role} · Person nicht typisiert` : 'Akteur und Rolle nicht typisiert';
  const actorTypeLabels = { human: 'Mensch', 'spectra-codex': 'Spectra/Codex', playwright: 'Playwright', 'system-automation': 'Systemautomation', 'unconfirmed-customer': 'Kundenteilnahme zu bestätigen', unknown: 'Quellseitig unvollständig' } as const;
  return <article className="journal-event" data-event-id={event.id}>
    <header><time dateTime={event.occurredAt}>{sourceDateTimeLabel(event.occurredAt)}</time><span>{journalTypeLabels[event.type]}</span></header>
    <h4>{journalVisibleText(event.title)}</h4>
    {event.detail && <p>{event.detail}</p>}
    <dl><dt>Gegenstand</dt><dd>{journalObjectLabels[event.objectType]} · <code>{event.objectId}</code></dd><dt>Akteur</dt><dd>{actorText} · {actorTypeLabels[event.actor.type]}</dd><dt>Evidence</dt><dd>{event.evidenceStatus === 'belegt' ? 'Commitgebunden belegt' : 'Keine zugeordnete Evidence belegt'}</dd></dl>
    {(event.before !== null || event.after !== null) && <p className="journal-change"><strong>Explizit belegte Änderung:</strong> {event.before ?? 'Kein Vorwert belegt'} → {event.after ?? 'Kein Nachwert belegt'}</p>}
    {event.approvalStatus === 'systemische-aussage' && <p className="journal-warning">Eine Systemautomation ist kein Beleg für eine menschliche Freigabe.</p>}
    {event.references.length > 0 && <div className="journal-references" aria-label={`Referenzen für ${event.objectId}`}>{event.references.map((reference) => <JournalReference key={reference} reference={reference} state={state} artifactById={artifactById} open={open} />)}</div>}
  </article>;
}

function ProjectJournal({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const journal = buildProjectJournal(state);
  const [filters, setFilters] = useState<JournalFilters>({ from: '', to: '', type: '', actor: '', objectType: '' });
  const [page, setPage] = useState(1);
  const [since, setSince] = useState(() => journal.events.at(-1)?.occurredAt.slice(0, 10) ?? '');
  const [asOf, setAsOf] = useState(() => journal.events.at(-1)?.occurredAt.slice(0, 10) ?? '');
  const updateFilter = <Key extends keyof JournalFilters>(key: Key, value: JournalFilters[Key]) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const filtered = filterJournalEvents(journal.events, filters);
  const pageData = paginateList(filtered, page, 20);
  const dayGroups = groupJournalEventsByDay(pageData.items);
  const sinceEvents = journalSince(journal.events, since);
  const sinceGroups = new Map<JournalEventType, JournalEvent[]>();
  for (const event of sinceEvents) sinceGroups.set(event.type, [...(sinceGroups.get(event.type) ?? []), event]);
  const sinceByType = [...sinceGroups.entries()].sort(([left], [right]) => left.localeCompare(right, 'de'));
  const asOfState = journalAsOf(journal.events, asOf);
  const artifactById = artifactReferenceMap(state.artifacts);
  return <section className="area-view project-journal">
    <header><div><p>COMMITGEBUNDENE PROJEKTCHRONIK</p><h2>Projekttagebuch</h2></div><span>{journal.events.length} belegte Ereignisse · {journal.diagnostics.length} Quellenhinweise</span></header>
    <p className="honest-note">Das Tagebuch ordnet ausschließlich belegte fachliche Ereignisse des validierten Projektstands. Git-Änderungen werden nicht als Projektarbeit ausgegeben.</p>
    <section className="journal-summary" aria-labelledby="journal-since-title"><div><h3 id="journal-since-title">Seit … passiert</h3><label>Auswertungsbeginn<input type="date" value={since} onChange={(event) => setSince(event.target.value)} /></label></div><strong>{sinceEvents.length} Ereignisse</strong>{sinceByType.length ? <ul>{sinceByType.map(([type, values]) => <li key={type}>{journalTypeLabels[type]}: {values.length}</li>)}</ul> : <p>Seit diesem Zeitpunkt ist kein belegtes Ereignis vorhanden.</p>}</section>
    <section className="journal-as-of" aria-labelledby="journal-as-of-title"><div><h3 id="journal-as-of-title">Stand am …</h3><label>Stichtag<input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label></div>{asOfState.eventCount === 0 ? <p>Zum gewählten Zeitpunkt ist noch kein belegtes Ereignis vorhanden.</p> : <><p>{journalEventCountSentence(asOfState.eventCount)}</p>{asOfState.statuses.length ? <ul>{asOfState.statuses.map((status) => <li key={status.objectId}><code>{status.objectId}</code>: {displayStatus(status.status)}</li>)}</ul> : <p>Bis zu diesem Zeitpunkt ist kein expliziter Statusübergang belegt.</p>}</>}<p className="honest-note">Dokument- und Seiteninhalte werden ohne versionierte Inhaltshistorie nicht rückwirkend rekonstruiert. Vorher/Nachher erscheint nur bei ausdrücklich gelieferten Quellwerten.</p></section>
    <div className="journal-filters" aria-label="Tagebuch filtern">
      <label>Von<input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
      <label>Bis<input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
      <label>Ereignistyp<select value={filters.type} onChange={(event) => updateFilter('type', event.target.value as JournalEventType | '')}><option value="">Alle Ereignistypen</option>{Object.entries(journalTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Person oder Rolle<input value={filters.actor} onChange={(event) => updateFilter('actor', event.target.value)} placeholder="Name oder Rolle" /></label>
      <label>Objektart<select value={filters.objectType} onChange={(event) => updateFilter('objectType', event.target.value as JournalObjectType | '')}><option value="">Alle Objektarten</option>{Object.entries(journalObjectLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="journal-results-heading"><h3>Tagesansicht</h3><span>{filtered.length} Treffer · Seite {pageData.page} von {pageData.totalPages}</span></div>
    {!filtered.length ? <p className="honest-note">Für die gewählten Filter ist kein belegtes Ereignis vorhanden.</p> : dayGroups.map((group) => <section className="journal-day" key={group.day}><h3>{sourceDateLabel(group.day)}</h3><div>{group.events.map((event) => <JournalEventCard key={event.id} event={event} state={state} artifactById={artifactById} open={open} />)}</div></section>)}
    {pageData.totalPages > 1 && <nav className="journal-pagination" aria-label="Tagebuchseiten"><button disabled={pageData.page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Vorherige Seite</button><span>Seite {pageData.page} von {pageData.totalPages} · {pageData.total} Ereignisse</span><button disabled={pageData.page === pageData.totalPages} onClick={() => setPage((current) => Math.min(pageData.totalPages, current + 1))}>Nächste Seite</button></nav>}
    {journal.diagnostics.length > 0 && <details className="journal-diagnostics"><summary>Quellseitig unvollständige Ereignisse ({journal.diagnostics.length})</summary><ul>{journal.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${diagnostic.objectId}-${index}`}><code>{diagnostic.objectId}</code> · {diagnostic.message}</li>)}</ul></details>}
  </section>;
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
  const executionEvidence = boundedList(state.artifacts.filter((artifact) => artifact.sourceType === 'country-company-information-execution-evidence' && artifact.currentAuthority === true), renderLimits.artifacts);
  if (!state.resources.length) return <section className="area-view"><header><div><p>QUELLLIEFERUNG</p><h2>Lieferregister</h2></div><span>{deliverables.total} registrierte Lieferobjekte</span></header><SourceEmpty title="Sichere Lieferdateien noch nicht verfügbar" text="Der gebundene Producerstand enthält keinen kanonischen Ressourcenkatalog. Für Vorschau und Download werden typisierte Metadaten, positivgelistete Git-Blobs, Größen, Dateitypen und SHA-256-Prüfsummen benötigt." /><DocumentCards title="Commitgebundene Umsetzungsevidence" artifacts={executionEvidence} open={open} emptyText="Keine gesonderte Umsetzungsevidence belegt." />{deliverables.total > 0 && <div className="deliverable-list">{deliverables.items.map(({ artifact, deliverable }) => <article key={`${artifact.id}-${deliverable.id}`}><code>{deliverable.id}</code><strong>{displayDocumentType(deliverable.type)}</strong><p>{deliverable.status}</p><small>Kontext: Ticket <code>{artifact.id}</code> · Ergebnisdatei nicht katalogisiert</small></article>)}</div>}</section>;
  return <section className="area-view"><ArtifactViewer projectId={state.source.projectId} resources={state.resources} documents={state.documents} />
    <DocumentCards title="Commitgebundene Umsetzungsevidence" artifacts={executionEvidence} open={open} emptyText="Keine gesonderte Umsetzungsevidence belegt." />
    {deliverables.limited && <p className="honest-note">Angezeigt werden die ersten {deliverables.visible} von {deliverables.total} belegten Liefergegenständen.</p>}
  </section>;
}

function Billing({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const tickets = boundedList(state.artifacts.filter((artifact) => isWorkArtifact(artifact) && (artifact.billable !== null || artifact.billingWeek !== null || artifact.billingStatus !== null)), renderLimits.artifacts);
  const documents = boundedList(state.artifacts.filter((artifact) => artifact.kind === 'document' && (artifact.documentType === 'budget' || artifact.documentType === 'worklog')), renderLimits.artifacts);
  const presentationById = new Map(state.presentation?.jira.tickets.map((ticket) => [ticket.ticketId, ticket]) ?? []);
  const plannedCost = state.story?.offer?.plannedCost ?? null;
  const actualCost = state.story?.controls?.worklogCost ?? null;
  if (!tickets.total && !documents.total) return <SourceEmpty title="Keine Abrechnungsdaten belegt" text="Der normalisierte Quellenvertrag enthält keine Abrechnungskennzeichen, Budget- oder Arbeitsprotokollartefakte." />;
  return <section className="area-view"><header><div><p>QUELLABRECHNUNG</p><h2>Ticketaufwand und Abrechnungsstatus</h2></div><span>{tickets.total} Ticketzeilen</span></header>
    <dl className="billing-summary"><dt>Geplantes Budget</dt><dd>{plannedCost === null ? 'Nicht belegt' : `${numberFormatter.format(plannedCost)} EUR`}</dd><dt>Erfasster Betrag</dt><dd>{actualCost === null ? 'Nicht belegt' : `${numberFormatter.format(actualCost)} EUR`}</dd></dl>
    {tickets.total > 0 && <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Vorgang</th><th>Abrechenbar</th><th>Geplant</th><th>Erfasst</th><th>Betrag</th><th>Woche</th><th>Status</th></tr></thead><tbody>{tickets.items.map((artifact) => { const financial = presentationById.get(artifact.id); return <tr key={artifact.id}><td><button className="text-action" onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span></button></td><td>{artifact.billable === null ? 'Nicht belegt' : artifact.billable ? 'Ja' : 'Nein'}</td><td>{sourceEffortLabel(artifact)}</td><td>{sourceActualLabel(artifact)}</td><td>{financial ? <>{numberFormatter.format(financial.amountEur)} EUR{financial.billable ? '' : ' · Rollup'}</> : 'Nicht belegt'}</td><td>{artifact.billingWeek ?? 'Nicht belegt'}</td><td>{displayBillingStatus(artifact.billingStatus)}</td></tr>; })}</tbody></table></div>}
    {tickets.limited && <p className="honest-note">Angezeigt werden die ersten {tickets.visible} von {tickets.total} belegten Abrechnungszeilen.</p>}
    <DocumentCards title="Budget und Arbeitsprotokolle" artifacts={documents} open={open} emptyText="Keine eigenständigen Budget- oder Arbeitsprotokollartefakte belegt." />
  </section>;
}

function DocumentCards({ title, artifacts, open, emptyText }: { title: string; artifacts: Readonly<{ items: Artifact[]; total: number; visible: number; limited: boolean; disclosureThreshold?: number }>; open: (artifact: Artifact) => void; emptyText: string }) {
  return <section className="document-section"><h3>{title}</h3>{artifacts.total ? <ExpandableList label={`Alle ${title}`} total={artifacts.total} threshold={artifacts.disclosureThreshold ?? 24}><div className="document-grid">{artifacts.items.map((artifact) => <button key={artifact.id} onClick={() => open(artifact)}><code>{artifact.id}</code><strong>{sourceText(artifact.title)}</strong><small>{displayDocumentType(artifact.documentType)} · {displayStatus(artifact.status)}</small></button>)}</div></ExpandableList> : <p className="honest-note">{emptyText}</p>}</section>;
}

type StoryTab = 'uebersicht' | 'angebot' | 'seiten' | 'tickets' | 'timeline' | 'hypercare' | 'beziehungen';

function TicketReferenceList({ state, ids }: { state: ProjectState; ids: readonly string[] }) {
  const presentationById = new Map(state.presentation?.jira.tickets.map((ticket) => [ticket.ticketId, ticket]) ?? []);
  return <span className="ticket-reference-list">{ids.map((id) => { const ticket = presentationById.get(id); return <span key={id}>{ticket && <TicketTypeIcon ticket={ticket} compact />}<code>{id}</code></span>; })}</span>;
}

function StoryCockpit({ state, open }: { state: ProjectState; open: (artifact: Artifact) => void }) {
  const [tab, setTab] = useState<StoryTab>('uebersicht');
  const story = state.story;
  if (!story) return null;
  const artifactById = (id: string) => state.artifacts.find((artifact) => artifact.id === id);
  const tabs: Array<[StoryTab, string]> = [['uebersicht', 'Übersicht'], ['angebot', 'Angebot'], ['seiten', 'Seitenbaum'], ['tickets', 'Tickets'], ['timeline', 'Timeline'], ['hypercare', 'Hypercare'], ['beziehungen', 'Beziehungen']];
  return <section className="records story-cockpit"><header><div><p>VOLLSTÄNDIGE PROJEKTSTORY</p><h2>Vom Angebot bis zum Handover</h2></div><span>{story.relations.length} belegte Beziehungen</span></header><nav className="story-tabs" aria-label="Projektstory-Ansichten">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === 'uebersicht' && <div className="story-dashboard"><div className="story-metric"><b>{story.offer?.versions.length ?? 0}</b><span>Angebotsversionen</span></div><div className="story-metric"><b>{story.pages.length}</b><span>Seiten</span></div><div className="story-metric"><b>{story.tickets.length}</b><span>Tickets</span></div><div className="story-metric"><b>{story.timeline.length}</b><span>Timeline-Ereignisse</span></div><div className="story-metric"><b>{story.hypercare.length}</b><span>Hypercare-Tage</span></div><div className="story-metric"><b>{story.controls?.openP1 ?? 0}/{story.controls?.openP2 ?? 0}</b><span>P1/P2 der Simulation</span></div></div>}
    {tab === 'angebot' && story.offer && <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Version</th><th>Datum</th><th>Status</th><th>Änderung</th><th>Stunden</th><th>Kosten</th></tr></thead><tbody>{story.offer.versions.map((version) => <tr key={version.version}><td>{version.version}</td><td>{sourceDateLabel(version.date)}</td><td>{version.status}</td><td>{version.delta}</td><td>{version.hours ?? 'Nicht belegt'}</td><td>{version.cost === null ? 'Nicht belegt' : `${numberFormatter.format(version.cost)} EUR`}</td></tr>)}</tbody></table><p className="honest-note">Plan: {story.offer.plannedHours ?? 'Nicht belegt'} Std. / {story.offer.plannedCost ?? 'Nicht belegt'} EUR · Ist: {story.offer.actualHours ?? 'Nicht belegt'} Std. / {story.offer.actualCost ?? 'Nicht belegt'} EUR.</p></div>}
    {tab === 'seiten' && <div className="story-page-tree">{story.pages.map((page) => <article key={page.id} style={{ paddingInlineStart: `${page.parent ? 1.5 : 0}rem` }}><button className="text-action" onClick={() => artifactById(page.id) && open(artifactById(page.id) as Artifact)}><code>{page.id}</code><strong>{page.title}</strong></button><small>Version {page.version ?? '–'} · {page.status ?? 'Nicht belegt'} · Quelle <code>{page.sourcePath}</code></small><p>{page.content ? page.content.replace(/^---[\s\S]*?---\s*/, '').trim().slice(0, 800) : 'Kein Seiteninhalt belegt.'}</p></article>)}</div>}
    {tab === 'tickets' && <div className="story-ticket-board">{(['done', 'closed', 'in-progress', 'backlog'] as const).map((status) => <section key={status}><h3>{displayStatus(status)}</h3>{story.tickets.filter((ticket) => ticket.status.toLowerCase() === status).map((ticket) => <button key={ticket.id} className="story-ticket" onClick={() => artifactById(ticket.id) && open(artifactById(ticket.id) as Artifact)}><code>{ticket.id}</code><strong>{ticket.summary}</strong><span>{ticket.priority ?? 'Priorität nicht belegt'} · {ticket.worklogs.reduce((sum, log) => sum + log.hours, 0)} Std.</span></button>)}{!story.tickets.some((ticket) => ticket.status.toLowerCase() === status) && <p className="honest-note">Keine Tickets belegt.</p>}</section>)}</div>}
    {tab === 'timeline' && <div className="story-timeline">{story.timeline.map((event) => <article key={event.id}><time dateTime={event.time}>{sourceDateTimeLabel(event.time)}</time><button className="text-action" onClick={() => artifactById(event.id) && open(artifactById(event.id) as Artifact)}><code>{event.id}</code><strong>{event.phase}: {event.action}</strong></button><p>{event.result} · Entscheidung: {event.decision} · Nächster Schritt: {event.nextStep}</p><small>Tickets: <TicketReferenceList state={state} ids={event.tickets} /> · Seiten: <ReferenceSummary values={event.pages} /> · Evidence: <ReferenceSummary values={event.evidence} /></small></article>)}</div>}
    {tab === 'hypercare' && <div className="story-hypercare">{story.hypercare.map((day) => <article key={day.day}><header><h3>Tag {day.day}</h3><span>{day.priority} · {day.status}</span></header><p><strong>Diagnose:</strong> {day.diagnosis}</p><p><strong>Fix:</strong> {day.fix}</p><p><strong>Retest:</strong> {day.retest} · <strong>Entscheidung:</strong> {day.decision}</p><p>Ticket <code>{day.ticket}</code> · Seite <code>{day.dailyPage}</code> · Kommentar <code>{day.comment}</code></p><p>Evidence: <ReferenceSummary values={day.evidence} /></p></article>)}</div>}
    {tab === 'beziehungen' && <ExpandableList label="Alle belegten Beziehungen" total={story.relations.length} threshold={60}><div className="story-relations">{story.relations.map((relation, index) => <div key={`${relation.from}-${relation.to}-${index}`}><button className="text-action" onClick={() => artifactById(relation.from) && open(artifactById(relation.from) as Artifact)}><code>{relation.from}</code></button><span>→ {relation.kind} →</span><button className="text-action" onClick={() => artifactById(relation.to) && open(artifactById(relation.to) as Artifact)}><code>{relation.to}</code></button></div>)}</div></ExpandableList>}
  </section>;
}

function SpectraPanel({ artifacts, open }: { artifacts: Artifact[]; open: (artifact: Artifact) => void }) {
  if (!artifacts.length) return null;
  return <section className="area-view spectra09-panel"><header><div><p>COMMITGEBUNDENER PROJEKTABGLEICH</p><h2>Spectra-Bindung und Twin-Export</h2></div><span>Kundeninstanz bleibt die fachlich führende Quelle · Twin liest ausschließlich</span></header><div className="spectra09-grid">{artifacts.map((artifact) => <article key={artifact.id}><button className="text-action" onClick={() => open(artifact)}><code>{artifact.id}</code><strong>{sourceText(artifact.title)}</strong></button><p>{artifact.rationale || 'Nicht in der Quelle erfasst.'}</p>{artifact.activity.length > 0 && <ul>{artifact.activity.map((line) => <li key={line}>{line}</li>)}</ul>}<small>{displayStatus(artifact.status)} · Quelle <code>{artifact.sourcePath}</code></small></article>)}</div><p className="honest-note">Alle Angaben stammen aus positivgelisteten Git-Blobs des gebundenen BC-Basic-Commits. Es werden keine Rechnung, Buchung, Zahlung oder produktive Leistung behauptet.</p></section>;
}

function BusinessOverview({ state, context }: { state: ProjectState; context: ProjectContext }) {
  const overview = buildCurrentOverview(state);
  const latest = overview.latestMilestone;
  const unknown = 'Unbekannt · im aktuellen Quellvertrag nicht typisiert';
  const ticketSummary = (ticket: (typeof overview.completedTickets)[number]) => <span key={ticket.id}><code>{ticket.id}</code> · {ticket.summary} · {ticket.assignee ?? 'Verantwortung nicht typisiert'}</span>;
  const ticketDetails = (title: string, tickets: typeof overview.completedTickets) => tickets.length ? <details><summary>{title} ({tickets.length})</summary><ul>{tickets.map(ticketSummary)}</ul></details> : <p>{unknown}</p>;
  return <section className="business-overview"><header><div><p>FACHLICHER PROJEKTÜBERBLICK</p><h2>Aktueller Projektstand</h2></div><span>Playthru-Sandbox · validierter Pilotstand</span></header>
    <div className="management-grid">
      <article><h3>Was ist der aktuelle Scope?</h3><p>Der aktuelle Vertrag liefert keinen typisierten Projektumfang. Angebotsversionen ersetzen keinen bestätigten aktuellen Umfang.</p><dl><dt>Im Umfang</dt><dd>{unknown}</dd><dt>Nicht im Umfang</dt><dd>{unknown}</dd><dt>Annahmen</dt><dd>{unknown}</dd><dt>Umfangsänderungen</dt><dd>{unknown}</dd></dl></article>
      <article><h3>Fortschritt und Readiness</h3>{latest ? <p><strong>Letzter belegter Meilenstein:</strong> {latest.phase} · {latest.action}<br /><span>{latest.result} · Verantwortung nicht typisiert · {sourceDateTimeLabel(latest.time)}</span></p> : <p>{unknown}</p>}<ul>{overview.readinessPhases.map((event) => <li key={event.id}><strong>{event.phase}:</strong> {event.result}</li>)}</ul><p>{overview.acceptedDeliverables.length ? `${overview.acceptedDeliverables.length} Lieferobjekte sind abgeschlossen belegt.` : 'Abgeschlossene Lieferobjekte sind noch nicht typisiert.'}</p><a href={projectUrl(context.projectId, 'projektverlauf')}>Projektverlauf öffnen</a>{' · '}<a href={projectUrl(context.projectId, 'lieferung')}>Lieferobjekte öffnen</a></article>
      <article><h3>Was ist fertig?</h3>{ticketDetails('Alle abgeschlossenen Vorgänge', overview.completedTickets)}</article>
      <article><h3>Was ist in Arbeit?</h3>{ticketDetails('Alle Vorgänge in Arbeit', overview.inProgressTickets)}</article>
      <article><h3>Offene Steuerung</h3><dl><dt>P1/P2 der Simulation</dt><dd>{overview.simulationControls ? `${overview.simulationControls.openP1}/${overview.simulationControls.openP2}` : unknown}</dd><dt>Risiken</dt><dd>{unknown}</dd><dt>Entscheidungen</dt><dd>{unknown}</dd><dt>Datenlücken</dt><dd>{unknown}</dd></dl><details><summary>Blockierte Tickets ({overview.blockedTickets.length})</summary>{overview.blockedTickets.length ? <ul>{overview.blockedTickets.map((ticket) => <li key={ticket.id}><code>{ticket.id}</code> · {ticket.summary} · {ticket.statusReason?.trim() || 'Blockiergrund noch nicht dokumentiert'} · Parent {ticket.parent ?? 'nicht belegt'}</li>)}</ul> : <p>{unknown}</p>}</details>{overview.pendingHumanApprovals.length > 0 && <p className="honest-note">{overview.pendingHumanApprovals.length} ausstehende Freigabeartefakte sind nicht als Simulation oder reale Kundenfreigabe klassifiziert. Dafür wird eine Producerklassifikation benötigt.</p>}</article>
      <article><h3>Was ist als Nächstes?</h3>{overview.nextTickets.length ? ticketDetails('Priorisierte nächste Handlungen', overview.nextTickets) : <><p className="honest-note">Keine priorisierte nächste Handlung ist im validierten Quellenvertrag typisiert. Der Twin erfindet keine Reihenfolge.</p><details><summary>Arbeitsvorrat ({overview.workInventory.length})</summary>{overview.workInventory.length ? <ul>{overview.workInventory.map(ticketSummary)}</ul> : <p>{unknown}</p>}</details></>}</article>
      <article><h3>Budgetsteuerung</h3><p>Budget, Aufwand, Forecast und Abweichungen werden ausschließlich in der separaten Abrechnung belegt.</p><a href={projectUrl(context.projectId, 'abrechnung')}>Abrechnung und Budgetdetails öffnen</a></article>
    </div>
  </section>;
}

function SetupWaveOverview({ state }: { state: ProjectState }) {
  const setup = state.setupWave;
  if (!setup) return null;
  const statusLabel = (value: string) => ({ 'prepared-for-controlled-live-run': 'Für einen kontrollierten Lauf vorbereitet', 'prepared-not-executed': 'Vorbereitet, nicht ausgeführt', 'designed-not-executed': 'Entworfen, nicht ausgeführt', 'beobachtet-nur-lesend': 'Nur-lesend beobachtet', 'required-not-executed': 'Erforderlich, noch nicht ausgeführt', 'blocked-before-dom-readback': 'Vor DOM, Screenshot und BC-Feldreadback blockiert', 'unbekannt-bis-wave0-readback': 'Bis zum W0-Readback unbekannt', 'nutzerhinweis-unbestaetigt': 'Nutzerhinweis, noch nicht bestätigt', 'blockiert-bis-dom-readback-und-zielkonfiguration': 'Bis DOM-Readback und Zielkonfiguration blockiert', 'missing-blocker': 'Fehlt und blockiert weitere Schritte', 'pending-wave-0-evidence': 'Zielstrategie offen', 'pending-resetpoint-evidence': 'Resetentscheidung offen', 'W0-01-read-company-identity': 'W0-01 · Firmenidentität nur-lesend prüfen', pending: 'Ausstehend' }[value] ?? value);
  return <section className="area-view setup-wave-overview"><header><div><p>VORBEREITUNGSSTAND</p><h2>Business Central Einrichtung</h2></div><span>Standard-CRONUS-Demobasis · Pilot noch nicht eingerichtet</span></header>
    <div className="management-grid">
      <article><h3>Ausgangsbasis und Ziel</h3><dl><dt>Aktueller Stand</dt><dd>Standard-CRONUS-Demobasis laut bereitgestellter Projektinformation</dd><dt>Entstehungsweg</dt><dd>{statusLabel(setup.configurationState.originMechanismStatus)}</dd><dt>Kopie oder Umbenennung</dt><dd>{statusLabel(setup.configurationState.copyRenameHypothesis)}</dd><dt>Einrichtungsstatus</dt><dd>{statusLabel(setup.configurationState.setupStatus)}</dd><dt>Kundenziel realisiert</dt><dd>{setup.configurationState.customerTargetRealized ? 'Ja' : 'Nein'}</dd><dt>Firmenname aus BC</dt><dd>{setup.configurationState.wave0ReadbackAttempt.bcReadbackAuthority ? setup.configurationState.observedDisplayName : 'Nicht verifiziert'}</dd><dt>Übernommener Repositorywert</dt><dd>{setup.configurationState.observedDisplayName} · nicht als BC-Feldwert bestätigt</dd><dt>Technischer Mandant</dt><dd><code>{setup.configurationState.technicalCompanyName}</code></dd><dt>Interne Company-ID</dt><dd>{setup.configurationState.internalCompanyId ?? 'Noch nicht belegt'}</dd><dt>Pilot-Soll</dt><dd>{setup.configurationState.targetDisplayName}</dd><dt>Pilot eingerichtet</dt><dd>{setup.configurationState.pilotConfigured ? 'Ja' : 'Nein'}</dd><dt>Änderungen angewendet</dt><dd>{setup.configurationState.writesApplied ? 'Ja' : 'Nein'}</dd><dt>Readback</dt><dd>{statusLabel(setup.configurationState.readbackStatus)}</dd></dl></article>
      <article><h3>Read-only Preflight</h3><dl><dt>Umgebung und Mandant</dt><dd>{setup.target.environment} · <code>{setup.target.companyId}</code></dd><dt>Anwendung</dt><dd>{setup.target.application}</dd><dt>Plattform</dt><dd>{setup.target.platform}</dd><dt>Status</dt><dd>{statusLabel(setup.preflight.status)}</dd><dt>Wave 0</dt><dd>{statusLabel(setup.preflight.wave0Status)}</dd><dt>BC-Readback-Autorität</dt><dd>{setup.configurationState.wave0ReadbackAttempt.bcReadbackAuthority ? 'Ja' : 'Nein'}</dd><dt>BC-Feldwerte gelesen</dt><dd>{setup.configurationState.wave0ReadbackAttempt.bcFieldValuesRead ? 'Ja' : 'Nein'}</dd><dt>Screenshot erfasst</dt><dd>{setup.configurationState.wave0ReadbackAttempt.screenshotCaptured ? 'Ja' : 'Nein'}</dd><dt>BC-Writes</dt><dd>{setup.configurationState.wave0ReadbackAttempt.writesPerformed ? 'Ausgeführt' : 'Nicht ausgeführt'}</dd><dt>Arbeitsdatum</dt><dd>{sourceDateLabel(setup.preflight.workingDate)}</dd><dt>Beobachtete Rolle</dt><dd>{setup.preflight.operator.permissionSet} · {setup.preflight.operator.userId}</dd></dl></article>
      <article><h3>Datenpakete</h3><ul>{setup.packages.map((item) => <li key={item.packageId}><strong><code>{item.packageId}</code></strong><br />{statusLabel(item.status)} · {item.tables}/{item.records}/{item.errors} Tabellen/Datensätze/Fehler</li>)}</ul></article>
      <article><h3>Offene Entscheidungen und nächster Schritt</h3><dl><dt>Zielentscheidung</dt><dd>{statusLabel(setup.configurationState.targetDecision)}</dd><dt>Resetentscheidung</dt><dd>{statusLabel(setup.configurationState.resetDecision)}</dd><dt>Schreibzugriff</dt><dd>Nicht autorisiert</dd><dt>Gesperrte Schritte</dt><dd><code>{setup.writeGate.noGoSteps[0]}</code> bis <code>{setup.writeGate.noGoSteps.at(-1)}</code></dd><dt>Resetpunkt</dt><dd>{statusLabel(setup.preflight.resetPoint.status)}</dd><dt>Nächster zulässiger Schritt</dt><dd>{statusLabel(setup.writeGate.nextAllowedStep)}</dd></dl><p className="honest-note">Die Projektion beschreibt ausschließlich den Soll- und Vorbereitungsstand. Sie behauptet keine Umbenennung oder Ausführung in einer realen BC-Instanz.</p></article>
    </div>
  </section>;
}

function Current({ state, context, open }: { state: ProjectState; context: ProjectContext; open: (artifact: Artifact) => void }) {
  const artifacts = boundedList(state.artifacts, renderLimits.artifacts); const evidenceItems = boundedList(state.evidenceItems, renderLimits.evidenceItems); const gaps = boundedList(state.gaps, renderLimits.gaps);
  const story = state.artifacts.filter((artifact) => artifact.sourceType?.startsWith('project-story-'));
  const spectraEvidence = boundedList(state.artifacts.filter((artifact) => artifact.sourceType?.startsWith('spectra-')), renderLimits.artifacts);
  const spectra09 = state.artifacts.filter((artifact) => ['spectra-project-reconciliation', 'spectra-adapter-provenance', 'twin-export-map'].includes(artifact.sourceType ?? ''));
  const executionEvidence = boundedList(state.artifacts.filter((artifact) => artifact.sourceType === 'country-company-information-execution-evidence' && artifact.currentAuthority === true), renderLimits.artifacts);
  const readbackAttempt = boundedList(state.artifacts.filter((artifact) => artifact.sourceType === 'current-read-only-attempt' && artifact.currentAuthority === true), renderLimits.artifacts);
  const currentPhase = state.story?.tickets.find((ticket) => ticket.type === 'phase' && ['in-progress', 'in progress', 'in arbeit', 'in bearbeitung'].includes(ticket.status.toLowerCase())) ?? null;
  const responsibleRole = currentPhase?.assigneeRole ?? state.story?.tickets.find((ticket) => ticket.assigneeRole)?.assigneeRole ?? null;
  const setupState = state.setupWave?.configurationState;
  return <>
    <section className="snapshot-intro"><div><p>PROJEKTCOCKPIT</p><h2>{context.projectName}</h2><span className="simulation-badge">Playthru-Sandbox · validierter Pilotstand</span><p>{setupState ? 'Standard-CRONUS-Ausgangsbasis; Pilotaufbau, Zielentscheidung und belastbarer Readback stehen noch aus.' : 'Der validierte Projektstand wird ausschließlich aus dem gebundenen Producercommit gelesen.'}</p>{state.source.channel?.notice && <p className="honest-note">{state.source.channel.notice}</p>}</div><dl><dt>Projektstatus</dt><dd>{state.story?.status ? displayStatus(state.story.status) : 'Unbekannt'}</dd><dt>Aktuelle Phase</dt><dd>{currentPhase ? `${currentPhase.id} · ${currentPhase.summary}` : 'Noch nicht dokumentiert'}</dd><dt>Nächstes Gate</dt><dd>{state.setupWave?.writeGate.nextAllowedStep ?? 'Noch nicht dokumentiert'}</dd><dt>Verantwortung</dt><dd>{responsibleRole ?? 'Noch nicht dokumentiert'}</dd><dt>Snapshotstand</dt><dd>{state.source.channel?.status === 'stale' ? 'Veraltet · letzter gültiger Stand' : `Validiert · ${new Date(state.source.channel?.lastValidatedAt ?? state.source.readAt).toLocaleString('de-DE')}`}</dd></dl></section>
    <BusinessOverview state={state} context={context} />
    <SetupWaveOverview state={state} />
    <DocumentCards title="Aktueller W0-01-Nur-Lese-Versuch" artifacts={readbackAttempt} open={open} emptyText="Kein aktueller W0-01-Readbackversuch belegt." />
    <DocumentCards title="Neueste validierte Umsetzungsevidence" artifacts={executionEvidence} open={open} emptyText="Keine gesonderte Umsetzungsevidence belegt." />
    {story.length > 0 && <StoryCockpit state={state} open={open} />}
    <details className="secondary-evidence"><summary>Bildnachweise und technisch gemeldete Datenlücken</summary><section className="evidence"><header><div><p>BILDNACHWEISE</p><h2>Commitgebundene Nachweise</h2></div><span>{evidenceItems.limited ? `${evidenceItems.visible} von ${evidenceItems.total} Bildnachweisen` : `${evidenceItems.total} Bildnachweise`}</span></header>{evidenceItems.limited && <p className="honest-note">Angezeigt werden die ersten {evidenceItems.visible} von {evidenceItems.total} belegten Bildnachweisen.</p>}{evidenceItems.total ? <div className="evidence-grid">{evidenceItems.items.map((item) => <figure key={item.id}><img src={`/api/projects/${encodeURIComponent(context.projectId)}/evidence/${encodeURIComponent(item.id)}`} alt={item.title} loading="lazy" /><figcaption>{item.title}</figcaption></figure>)}</div> : <p className="honest-note">Im ausgewiesenen Commit sind keine unterstützten Bildnachweise belegt.</p>}</section><section className="gaps"><header><div><p>TECHNISCH GEMELDETE DATENLÜCKEN</p><h2>Quellhinweise</h2></div><span>{gaps.limited ? `${gaps.visible} von ${gaps.total} Quellhinweisen` : `${gaps.total} Quellhinweise`}</span></header><p className="honest-note">Diese Liste ist keine bestätigte fachliche Vollständigkeitsabdeckung.</p>{gaps.limited && <p className="honest-note">Angezeigt werden die ersten {gaps.visible} von {gaps.total} Quellhinweisen.</p>}<ul>{gaps.items.map((gap, index) => <li key={`${index}-${gap}`}>{gap}</li>)}</ul></section></details>
    <details className="technical-proof"><summary>Technische Prüfung, Herkunft und Artefaktverzeichnis</summary><dl><dt>Projekt</dt><dd>{context.projectName} · {context.projectKey}</dd><dt>Freigabebranch</dt><dd><code>{state.source.channel?.branch ?? state.source.branch}</code></dd><dt>Gepinnter Commit</dt><dd><code>{state.source.commit}</code></dd><dt>Zuletzt validiert</dt><dd>{new Date(state.source.channel?.lastValidatedAt ?? state.source.readAt).toLocaleString('de-DE')}</dd><dt>Quellenstatus</dt><dd>{state.source.channel?.status === 'stale' ? 'Letzter gültiger Stand · Aktualisierung fehlgeschlagen oder ausstehend' : 'Commitgebundene Git-Blobs geprüft'}</dd></dl><p>Index, Allowlist, Referenzen und Digests werden vor der Anzeige fail-closed geprüft.</p><SpectraPanel artifacts={spectra09} open={open} /><DocumentCards title="Spectra-Bindung und Konformität" artifacts={spectraEvidence} open={open} emptyText="Im gebundenen Commit ist keine positivgelistete Spectra-Bindungs- oder Konformitäts-Evidence vorhanden." /><section className="records"><header><div><p>BELEGTE ARTEFAKTE</p><h2>Technisches Artefaktverzeichnis</h2></div><span>{artifacts.limited ? `${artifacts.visible} von ${artifacts.total} Datensätzen` : `${artifacts.total} Datensätze`}</span></header>{artifacts.limited && <p className="honest-note">Angezeigt werden die ersten {renderLimits.artifacts} belegten Datensätze.</p>}<div className="record-list">{artifacts.items.map((artifact) => <button key={`${artifact.kind}-${artifact.id}`} onClick={() => open(artifact)}><code>{artifact.id}</code><span>{sourceText(artifact.title)}</span><small>{displayStatus(artifact.status)} · {sourceText(artifact.workstream)}</small></button>)}</div></section></details>
  </>;
}

function documentationHeadingId(text: string, index: number) {
  const normalized = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `abschnitt-${normalized || index + 1}-${index + 1}`;
}

function documentationHeadings(content: string) {
  return content.split(/\r?\n/).flatMap((line, index) => { const match = line.match(/^(#{1,3})\s+(.+)$/); return match ? [{ level: match[1].length, text: match[2].trim(), id: documentationHeadingId(match[2].trim(), index) }] : []; });
}

function InlineDocumentText({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}

function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/); const nodes: React.ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]; if (!line.trim()) continue;
    if (line.startsWith('```')) { const code: string[] = []; index += 1; while (index < lines.length && !lines[index].startsWith('```')) { code.push(lines[index]); index += 1; } nodes.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/); if (heading) { const id = documentationHeadingId(heading[2].trim(), index); const value = <InlineDocumentText text={heading[2].trim()} />; nodes.push(heading[1].length === 1 ? <h2 id={id} key={id}>{value}</h2> : heading[1].length === 2 ? <h3 id={id} key={id}>{value}</h3> : <h4 id={id} key={id}>{value}</h4>); continue; }
    if (/^\|.*\|\s*$/.test(line)) { const cells = line.split('|').slice(1, -1).map((cell) => cell.trim()); if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue; nodes.push(<div className="documentation-table-line" key={`table-${index}`}>{cells.map((cell, cellIndex) => <span key={cellIndex}><InlineDocumentText text={cell} /></span>)}</div>); continue; }
    const list = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/); if (list) { nodes.push(<p className="documentation-list-line" key={`list-${index}`}><span aria-hidden="true">•</span><InlineDocumentText text={list[1]} /></p>); continue; }
    nodes.push(<p key={`paragraph-${index}`}><InlineDocumentText text={line.replace(/^>\s?/, '')} /></p>);
  }
  return <div className="documentation-markdown">{nodes}</div>;
}

function Documentation({ state }: { state: ProjectState }) {
  return state.presentation ? <DocumentationSpaces state={state} /> : <LegacyDocumentation state={state} />;
}

function LegacyDocumentation({ state }: { state: ProjectState }) {
  const [query, setQuery] = useState(''); const [type, setType] = useState('alle'); const [status, setStatus] = useState('alle'); const [phase, setPhase] = useState('alle'); const [process, setProcess] = useState('alle');
  const [selectedId, setSelectedId] = useState(state.documents[0]?.id ?? ''); const byId = new Map(state.documents.map((document) => [document.id, document]));
  const values = (field: 'documentType' | 'status' | 'phase' | 'process') => [...new Set(state.documents.map((document) => document[field] ?? 'Nicht belegt'))].sort((left, right) => left.localeCompare(right, 'de'));
  const filtered = state.documents.filter((document) => { const search = `${document.id} ${document.title} ${document.content} ${document.references.join(' ')}`.toLocaleLowerCase('de'); return (!query.trim() || search.includes(query.trim().toLocaleLowerCase('de'))) && (type === 'alle' || document.documentType === type) && (status === 'alle' || (document.status ?? 'Nicht belegt') === status) && (phase === 'alle' || (document.phase ?? 'Nicht belegt') === phase) && (process === 'alle' || (document.process ?? 'Nicht belegt') === process); });
  useEffect(() => { if (!filtered.some((document) => document.id === selectedId)) setSelectedId(filtered[0]?.id ?? ''); }, [filtered, selectedId]);
  if (!state.documents.length) return <SourceEmpty title="Keine Projektdokumentation belegt" text="Der gebundene Projektindex enthält keine unterstützten Markdown-Dokumente." />;
  const selected = byId.get(selectedId) ?? filtered[0];
  const depth = (document: ProjectDocument) => { let current = document; let value = 0; const seen = new Set<string>(); while (current.parentId && byId.has(current.parentId) && !seen.has(current.parentId)) { seen.add(current.parentId); current = byId.get(current.parentId)!; value += 1; } return value; };
  const breadcrumb: ProjectDocument[] = []; if (selected) { let current: ProjectDocument | undefined = selected; const seen = new Set<string>(); while (current && !seen.has(current.id)) { breadcrumb.unshift(current); seen.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined; } }
  const headings = selected ? documentationHeadings(selected.content) : [];
  return <section className="documentation-view"><header><div><p>COMMITGEBUNDENE PROJEKTDOKUMENTATION</p><h2>Freigegebene Dokumente direkt lesen</h2></div><span>{state.documents.length} positivgelistete Markdown-Dokumente · keine lokale Kopie</span></header>
    <div className="documentation-filters"><label>Dokumente durchsuchen<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, Inhalt oder ID" /></label><label>Dokumenttyp<select value={type} onChange={(event) => setType(event.target.value)}><option value="alle">Alle Typen</option>{values('documentType').map((value) => <option key={value} value={value}>{displayDocumentType(value)}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="alle">Alle Status</option>{values('status').map((value) => <option key={value} value={value}>{displayStatus(value === 'Nicht belegt' ? null : value)}</option>)}</select></label><label>Phase<select value={phase} onChange={(event) => setPhase(event.target.value)}><option value="alle">Alle Phasen</option>{values('phase').map((value) => <option key={value}>{value}</option>)}</select></label><label>Prozess<select value={process} onChange={(event) => setProcess(event.target.value)}><option value="alle">Alle Prozesse</option>{values('process').map((value) => <option key={value}>{value}</option>)}</select></label></div>
    {!filtered.length ? <SourceEmpty title="Keine passenden Dokumente" text="Für die gewählten Such- und Filterwerte ist im gebundenen Commit kein Dokument belegt." /> : <div className="documentation-layout"><nav className="documentation-tree" aria-label="Dokumentnavigation"><p>{filtered.length} von {state.documents.length} Dokumenten</p>{filtered.map((document) => <button key={document.id} aria-current={selected?.id === document.id ? 'page' : undefined} onClick={() => setSelectedId(document.id)} style={{ paddingInlineStart: `${14 + depth(document) * 14}px` }}><strong>{document.title}</strong><small>{displayDocumentType(document.documentType)} · {displayStatus(document.status)}</small></button>)}</nav>{selected && <article className="documentation-page"><nav className="documentation-breadcrumb" aria-label="Brotkrümelnavigation">{breadcrumb.map((document, index) => <React.Fragment key={document.id}>{index > 0 && <span aria-hidden="true">›</span>}<button onClick={() => setSelectedId(document.id)}>{document.title}</button></React.Fragment>)}</nav><header><div><p>{displayDocumentType(selected.documentType)}</p><h2>{selected.title}</h2><span>{displayStatus(selected.status)} · Aktualisiert: {selected.updatedAt ? sourceDateLabel(selected.updatedAt) : 'Nicht belegt'}</span></div><button disabled={!selected.externalUrl} title={selected.externalLinkReason}>In Confluence öffnen</button></header>{headings.length > 1 && <nav className="documentation-toc" aria-label="Inhaltsverzeichnis"><strong>Auf dieser Seite</strong>{headings.slice(1).map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.text}</a>)}</nav>}<SafeMarkdown content={selected.content} />
      <section className="documentation-references"><h3>Querverweise</h3>{selected.references.length ? <div>{selected.references.map((reference) => byId.has(reference) ? <button key={reference} onClick={() => setSelectedId(reference)}>{reference} · Dokument öffnen</button> : <span key={reference}><code>{reference}</code> · Fachreferenz</span>)}</div> : <p className="honest-note">Keine strukturierten Querverweise belegt.</p>}</section>
      <details className="documentation-provenance"><summary>Provenienz und Validierungsstand</summary><dl><dt>Commit</dt><dd><code>{state.source.commit}</code></dd><dt>Quelldatei</dt><dd><code>{selected.sourcePath}</code></dd><dt>Validierung</dt><dd>Index, Allowlist und Git-Blob commitgebunden geprüft</dd><dt>Phase</dt><dd>{selected.phase ?? 'Nicht belegt'}</dd><dt>Prozess</dt><dd>{selected.process ?? 'Nicht belegt'}</dd></dl></details></article>}</div>}
    <p className="honest-note">Eine kanonische Confluence-URL, unveränderliche Page-ID und erlaubte HTTPS-Origin sind im gebundenen Projektindex nicht belegt. Der externe Link bleibt deshalb sicher deaktiviert.</p>
  </section>;
}

function Sources({ state, context }: { state: ProjectState; context: ProjectContext }) {
  const paths = boundedList([...new Set(state.artifacts.map((artifact) => artifact.sourcePath))], renderLimits.sourcePaths); const warnings = boundedList(state.warnings, renderLimits.warnings);
  return <section className="sources"><p>SICHERE QUELLENINFORMATION</p><h2>{context.projectName} · {context.projectKey}</h2><dl><dt>Registrierungs-ID</dt><dd>{context.projectId}</dd><dt>Projektschlüssel</dt><dd>{context.projectKey}</dd><dt>Quellenzweig</dt><dd>{state.source.branch}</dd><dt>Vollständiger Commit</dt><dd><code>{state.source.commit}</code></dd><dt>Quellenstatus</dt><dd>{state.source.dirty ? 'Arbeitskopie mit nicht commitgebundenen Änderungen' : 'Commitgebundene Momentaufnahme'}</dd><dt>Einlesezeit</dt><dd>{new Date(state.source.readAt).toLocaleString('de-DE')}</dd></dl><h3>Sichere repository-bezogene Provenienz</h3>{paths.total ? <ul>{paths.items.map((sourcePath) => <li key={sourcePath}><code>{sourcePath}</code></li>)}</ul> : <p className="honest-note">Keine unterstützte Provenienz belegt.</p>}{paths.limited && <p className="honest-note">Angezeigt werden {paths.visible} von {paths.total} belegten Quellpfaden.</p>}<h3>Prüf- und Quellenhinweise</h3>{warnings.total ? <ul>{warnings.items.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul> : <p className="honest-note">Keine zusätzlichen Quellenhinweise.</p>}{warnings.limited && <p className="honest-note">Angezeigt werden die ersten {warnings.visible} von {warnings.total} Prüf- und Quellenhinweisen.</p>}</section>;
}

type StoryTicket = NonNullable<ProjectState['story']>['tickets'][number];
type StoryActor = NonNullable<StoryTicket['comments'][number]['actor']>;
function safeTicketText(value: string | null | undefined) {
  return value?.replace(/\bEUR\b/gi, 'Finanzdetails in Abrechnung') ?? value;
}

function ActorBadge({ actor, fallbackRole, time }: { actor: StoryActor | null; fallbackRole?: string | null; time?: string | null }) {
  const safeFallbackRole = fallbackRole && !/^P-\d+$/i.test(fallbackRole) ? fallbackRole : null;
  if (!actor) return <span className="actor-badge actor-unknown">Person nicht typisiert{safeFallbackRole ? ` · Rolle: ${safeFallbackRole}` : ' · Rolle nicht typisiert'}{time ? ` · ${time}` : ''}</span>;
  const typeLabels: Record<StoryActor['type'], string> = { human: 'Mensch', 'spectra-codex': 'Spectra/Codex', playwright: 'Playwright', 'system-automation': 'Systemautomation', 'unconfirmed-customer': 'Kundenteilnahme zu bestätigen' };
  return <span className={`actor-badge actor-${actor.type}`}>{actor.displayName} · {actor.role} · {typeLabels[actor.type]}{time ? ` · ${time}` : ''}</span>;
}

function Detail({ artifact, artifacts, storyTickets, storyTicket, presentationTicket, select, close }: { artifact: Artifact; artifacts: Artifact[]; storyTickets: StoryTicket[]; storyTicket?: StoryTicket; presentationTicket?: PresentationTicket; select: (artifact: Artifact) => void; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); }; addEventListener('keydown', handleKey); return () => { removeEventListener('keydown', handleKey); trigger.current?.focus(); }; }, [close]);
  const dependencies = boundedList(artifact.dependencies, renderLimits.detailReferences); const documents = boundedList(artifact.documents, renderLimits.detailReferences);
  const meetings = boundedList(artifact.meetings, renderLimits.detailReferences); const evidence = boundedList(artifact.evidence, renderLimits.detailEvidence);
  const deliverables = boundedList(artifact.deliverables, renderLimits.detailReferences); const history = boundedList(artifact.history, renderLimits.historyEvents);
  const storyEvidence = storyTicket ? boundedList(storyTicket.evidenceRefs, renderLimits.detailEvidence) : null;
  const artifactById = artifactReferenceMap(artifacts);
  const childTickets = storyTicket ? storyTickets.filter((item) => item.parent === storyTicket.id) : [];
  const ticketType = presentationTicket?.type;
  const isStoryLevel = ticketType === 'story' || ticketType === 'bug';
  const isTask = ticketType === 'task';
  const actorLabel = (value: string | null | undefined) => value && !/^P-\d+$/i.test(value) ? value : 'Person/Rolle nicht typisiert';
  const linkedReferences = { artifactById, select };
  return <div className="drawer-scrim"><div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="drawer-close" onClick={close}>Schließen</button>{presentationTicket && <TicketTypeIcon ticket={presentationTicket} />}<h2 id="detail-title">{artifact.id}</h2><h3>{sourceText(artifact.title)}</h3><dl>
    <dt>Typ</dt><dd>{presentationTicket?.typeLabel ?? displayArtifactType(artifact.sourceType)}</dd><dt>Status</dt><dd>{displayStatus(artifact.status)}</dd>
    {storyTicket && <><dt>Priorität</dt><dd>{sourceText(storyTicket.priority)}</dd><dt>Ersteller</dt><dd>{actorLabel(storyTicket.reporter)}{storyTicket.reporterRole ? ` · ${storyTicket.reporterRole}` : ''}</dd><dt>Verantwortung</dt><dd>{actorLabel(storyTicket.assignee)}{storyTicket.assigneeRole ? ` · ${storyTicket.assigneeRole}` : ''}</dd>{storyTicket.createdAt && <><dt>Erstellt</dt><dd>{sourceDateLabel(storyTicket.createdAt)}</dd></>}{storyTicket.closedAt && <><dt>Abgeschlossen</dt><dd>{sourceDateLabel(storyTicket.closedAt)}</dd></>}{storyTicket.phaseId && <><dt>Phase</dt><dd><LinkedReference value={storyTicket.phaseId} {...linkedReferences} /></dd></>}<dt>Schätzung</dt><dd>{storyTicket.estimateHours === null ? 'Nicht belegt' : `${numberFormatter.format(storyTicket.estimateHours)} Std.`}</dd><dt>Ist</dt><dd>{sourceActualLabel(artifact)}</dd><dt>Rest</dt><dd>{storyTicket.remainingHours === null ? 'Nicht belegt' : `${numberFormatter.format(storyTicket.remainingHours)} Std.`}</dd>{isTask && <><dt>Abrechenbar</dt><dd>{storyTicket.billable ? 'Ja, ausschließlich als Aufgabe' : 'Quellvertrag widersprüchlich'}</dd></>}</>}
    {!storyTicket && artifact.kind === 'document' && <><dt>Ergebnisart</dt><dd>{displayDocumentType(artifact.documentType)}</dd><dt>Verantwortung</dt><dd>{actorLabel(artifact.owner)}</dd></>}
  </dl>
  {storyTicket && storyTicket.parent && <section className="ticket-detail-relations"><h4>Übergeordnetes Ticket</h4><LinkedReference value={storyTicket.parent} {...linkedReferences} /></section>}
  {storyTicket && <><h4>{ticketType === 'phase' ? 'Phasenziel und Gates' : ticketType === 'epic' ? 'Fachlicher Umfang und Definition of Done' : 'Beschreibung'}</h4><p>{safeTicketText(storyTicket.description || artifact.rationale) || 'Für diesen Inhalt besteht ein kompakter Quellenbedarf.'}</p></>}
  {storyTicket && (isStoryLevel || isTask) && <><h4>Akzeptanzkriterien</h4>{storyTicket.acceptanceCriteria.length ? <ul>{storyTicket.acceptanceCriteria.map((criterion) => <li key={criterion.text}>{criterion.fulfilled === null ? 'Nicht bewertet' : criterion.fulfilled ? 'Erfüllt' : 'Nicht erfüllt'}: {criterion.text}</li>)}</ul> : <p className="honest-note">Akzeptanzkriterien sind in der Quelle nicht typisiert.</p>}</>}
  {storyTicket && childTickets.length > 0 && <section className="ticket-detail-children"><h4>{ticketType === 'phase' ? 'Epics' : ticketType === 'epic' ? 'Stories und Fehler' : 'Aufgaben'}</h4><ul>{childTickets.map((child) => <li key={child.id}><LinkedReference value={child.id} {...linkedReferences} /> · {sourceText(child.summary)}</li>)}</ul></section>}
  {storyTicket && storyTicket.comments.length > 0 && <><h4>Typisierte Kommentare</h4><ul>{storyTicket.comments.map((comment) => <li key={comment.id}><strong>{comment.type}</strong><br /><ActorBadge actor={comment.actor} fallbackRole={comment.role} time={comment.time} /><br />{safeTicketText(comment.text)}{comment.evidenceRef && <>{' · '}<LinkedReference value={comment.evidenceRef} {...linkedReferences} /></>}</li>)}</ul></>}
  {storyTicket && isTask && <><h4>Einzelne Worklogs</h4>{storyTicket.worklogs.length ? <ul>{storyTicket.worklogs.map((worklog, index) => <li key={`${worklog.date}-${index}`}><ActorBadge actor={worklog.actor} fallbackRole={worklog.role} time={worklog.date} /> · {worklog.hours} Std. · {safeTicketText(worklog.activity) ?? 'Aktivität nicht belegt'} · {worklog.phase ?? 'Phase nicht belegt'}</li>)}</ul> : <p className="honest-note">Worklogs sind in der Quelle nicht belegt.</p>}</>}
  {storyTicket && storyTicket.statusHistory.length > 0 && <><h4>Statushistorie</h4><ol>{storyTicket.statusHistory.map((item, index) => <li key={`${item.time}-${index}`}><ActorBadge actor={item.actor} time={sourceDateLabel(item.time)} /> · {displayStatus(item.status)}</li>)}</ol></>}
  {storyEvidence && <DetailReferences title="Positivgelistete Evidence" values={storyEvidence} {...linkedReferences} />}
  {!storyTicket && artifact.kind === 'document' && <section className="deliverable-detail"><h4>Ergebnis und Dokumentation</h4><p>{artifact.rationale || 'Für dieses Lieferergebnis ist kein lesbarer Inhalt typisiert.'}</p>{artifact.documents.length > 0 && <DetailReferences title="Lesbare Dokumente" values={documents} {...linkedReferences} />}</section>}
  {artifact.activity.length > 0 && !storyTicket && artifact.kind !== 'document' && <><h4>Kommentare und Arbeitsnachweise</h4><ul>{artifact.activity.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></>}
    <DetailReferences title="Abhängigkeiten" values={dependencies} {...linkedReferences} /><DetailReferences title="Dokumentreferenzen" values={documents} {...linkedReferences} /><DetailReferences title="Besprechungsreferenzen" values={meetings} {...linkedReferences} /><DetailReferences title="Nachweisreferenzen" values={evidence} {...linkedReferences} />
    {deliverables.total > 0 && <><h4>Liefergegenstände</h4><ul>{deliverables.items.map((item) => <li key={item.id}><LinkedReference value={item.id} {...linkedReferences} /> · {displayDocumentType(item.type)} · {item.status}</li>)}</ul>{deliverables.limited && <p className="honest-note">Angezeigt werden {deliverables.visible} von {deliverables.total} Liefergegenständen.</p>}</>}
    {history.total > 0 && !storyTicket && <><h4>Statushistorie</h4>{artifact.historySynthetic === true && <p className="honest-note">Diese Historie ist in der Quelle ausdrücklich als synthetisch gekennzeichnet.</p>}<ol>{history.items.map((item, index) => <li key={`${item.at}-${index}`}><time dateTime={item.at}>{sourceDateTimeLabel(item.at)}</time>: {displayStatus(item.from)} → {displayStatus(item.to)} · <code>{item.by}</code></li>)}</ol>{history.limited && <p className="honest-note">Angezeigt werden {history.visible} von {history.total} Statusübergängen.</p>}</>}
    <details className="ticket-provenance"><summary>Technische Provenienz</summary><dl><dt>Quellpfad</dt><dd><code>{artifact.sourcePath}</code></dd>{storyTicket?.assignee && <><dt>Quellkennung der Verantwortung</dt><dd><code>{storyTicket.assignee}</code></dd></>}{[...artifact.dependencies, ...artifact.documents, ...artifact.evidence].length > 0 && <><dt>Quellreferenzen</dt><dd>{[...artifact.dependencies, ...artifact.documents, ...artifact.evidence].map((value) => <code key={value}>{value} </code>)}</dd></>}</dl></details>
  </div></div>;
}

function LinkedReference({ value, artifactById, select }: { value: string; artifactById: ReadonlyMap<string, Artifact>; select: (artifact: Artifact) => void }) {
  const target = artifactById.get(value);
  return target ? <button className="detail-reference-button" onClick={() => select(target)}><code>{value}</code> · öffnen</button> : <span className="honest-note">Verknüpftes Objekt nicht lesbar typisiert</span>;
}

function DetailReferences({ title, values, artifactById, select }: { title: string; values: Readonly<{ items: string[]; total: number; visible: number; limited: boolean; disclosureThreshold?: number }>; artifactById: ReadonlyMap<string, Artifact>; select: (artifact: Artifact) => void }) {
  if (!values.total) return null;
  return <><h4>{title}</h4><ExpandableList label={`Alle ${title}`} total={values.total} threshold={values.disclosureThreshold ?? 24}><ul>{values.items.map((value) => <li key={value}><LinkedReference value={value} artifactById={artifactById} select={select} /></li>)}</ul></ExpandableList></>;
}

type StatusProps = { title: string; text: string; busy?: boolean; embedded?: boolean };
function Status({ title, text, busy = false, embedded = false }: StatusProps) {
  const content = <><p>{busy ? 'WIRD GELADEN' : 'NICHT VERFÜGBAR'}</p><h1>{title}</h1><span>{text}</span></>;
  return embedded ? <section className="status-page embedded" aria-busy={busy || undefined}>{content}</section> : <main className="status-page" aria-busy={busy || undefined}>{content}</main>;
}

createRoot(document.getElementById('root')!).render(<App />);
