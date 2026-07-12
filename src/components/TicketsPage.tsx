import { useEffect, useMemo, useState } from 'react';
import type { Artifact, PresentationContract, PresentationTicket, ProjectState } from '../model';
import { displayStatus } from '../model';
import { TicketTypeIcon } from './TicketTypeIcon';

type StoryTicket = NonNullable<ProjectState['story']>['tickets'][number];
type JiraView = PresentationContract['jira']['views'][number];
type OpenArtifact = (artifact: Artifact) => void;

function defaultExpanded(contract: PresentationContract) {
  const values: Record<string, boolean> = {};
  for (const view of contract.jira.views) {
    values[`view:${view.id}`] = view.initialState === 'expanded';
    for (const group of view.groups) values[`group:${view.id}:${group.id}`] = group.initialState === 'expanded';
    if (view.kind === 'board') for (const column of view.columns) values[`column:${view.id}:${column.id}`] = column.initialState === 'expanded';
  }
  for (const ticket of contract.jira.tickets) values[`ticket:${ticket.ticketId}`] = ticket.initialState === 'expanded';
  return values;
}

function useSessionExpansion(projectId: string, commit: string, contract: PresentationContract) {
  const storageKey = `twin-navigation:${projectId}:${commit}`;
  const defaults = useMemo(() => defaultExpanded(contract), [contract]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaults);
  useEffect(() => {
    let restored: Record<string, boolean> | null = null;
    try { const raw = sessionStorage.getItem(storageKey); restored = raw ? JSON.parse(raw) as Record<string, boolean> : null; } catch { restored = null; }
    setExpanded({ ...defaults, ...(restored ?? {}) });
  }, [defaults, storageKey]);
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(expanded)); } catch { /* Sitzungszustand ist optional und niemals fachliche Quelle. */ } }, [expanded, storageKey]);
  const toggle = (key: string) => setExpanded((current) => ({ ...current, [key]: !current[key] }));
  return { expanded, toggle };
}

function TicketHeading({ presentation, ticket }: { presentation: PresentationTicket; ticket: StoryTicket }) {
  return <span className="ticket-heading"><TicketTypeIcon ticket={presentation} /><code>{ticket.id}</code><strong>{ticket.summary}</strong></span>;
}

function TicketCard({ ticket, presentation, view, open, artifact, phaseLabel }: { ticket: StoryTicket; presentation: PresentationTicket; view: JiraView; open: OpenArtifact; artifact?: Artifact; phaseLabel: string }) {
  const fields = new Set(view.visibleFields);
  return <button className="ticket-card" onClick={() => artifact && open(artifact)} disabled={!artifact}>
    <TicketHeading presentation={presentation} ticket={ticket} />
    <span className="ticket-card-meta">
      {fields.has('status') && <span>{displayStatus(ticket.status)}</span>}
      {fields.has('priority') && <span>{ticket.priority ?? 'Priorität nicht belegt'}</span>}
      {fields.has('phase') && <span>{phaseLabel}</span>}
      {fields.has('role') && <span>{presentation.role ?? 'Rolle nicht belegt'}</span>}
      {fields.has('worklogHours') && <span>{ticket.worklogs.reduce((sum, item) => sum + item.hours, 0)} Std.</span>}
      {presentation.type !== 'task' && <span>Schätzung {presentation.estimateHours} Std. · Task-Rollup {presentation.actualHours} Std. Ist / {presentation.remainingHours} Std. Rest</span>}
    </span>
  </button>;
}

function GroupDisclosure({ label, expanded, onClick, onOpen, presentation, prefix, rollup }: { label: string; expanded: boolean; onClick: () => void; onOpen?: () => void; presentation?: PresentationTicket; prefix: 'Phase' | 'Epic'; rollup?: { estimateHours: number; actualHours: number; remainingHours: number } }) {
  return <div className="group-disclosure-row"><button className={`group-disclosure group-disclosure-${prefix.toLowerCase()}`} aria-expanded={expanded} aria-label={`${expanded ? 'Einklappen' : 'Aufklappen'}: ${prefix} ${label}`} onClick={onClick}><span aria-hidden="true">{expanded ? '⌄' : '›'}</span>{presentation && <TicketTypeIcon ticket={presentation} />}<strong>{prefix}: {label}</strong>{rollup && <span>{rollup.estimateHours} Std. geplant · {rollup.actualHours} Std. Ist · {rollup.remainingHours} Std. Rest</span>}<small>{expanded ? 'Eingeblendet' : 'Ausgeblendet'}</small></button>{onOpen && <button className="group-detail-button" onClick={onOpen} aria-label={`${prefix}-Ticket ${presentation?.ticketId ?? label} im Detail öffnen`}>Details</button>}</div>;
}

function HierarchyItem({ ticket, presentation, children, view, expanded, toggle, open, artifactById, presentationById, tickets, phaseLabelFor }: { ticket: StoryTicket; presentation: PresentationTicket; children: StoryTicket[]; view: JiraView; expanded: Record<string, boolean>; toggle: (key: string) => void; open: OpenArtifact; artifactById: Map<string, Artifact>; presentationById: Map<string, PresentationTicket>; tickets: StoryTicket[]; phaseLabelFor: (ticketId: string) => string }) {
  const key = `ticket:${ticket.id}`; const isOpen = expanded[key] ?? false;
  const hatUntergeordneteTickets = children.length > 0;
  const untergeordneteEinträge = children.map((child) => <HierarchyBranch
    key={child.id}
    ticket={child}
    view={view}
    expanded={expanded}
    toggle={toggle}
    open={open}
    artifactById={artifactById}
    presentationById={presentationById}
    tickets={tickets}
    phaseLabelFor={phaseLabelFor}
  />);
  return <li className="ticket-tree-item">
    <div className="ticket-tree-line">
      {hatUntergeordneteTickets ? <button className="collapse-button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Einklappen' : 'Aufklappen'}: ${ticket.id}`} onClick={() => toggle(key)}>{isOpen ? '−' : '+'}</button> : <span className="collapse-placeholder" aria-hidden="true" />}
      <TicketCard ticket={ticket} presentation={presentation} view={view} open={open} artifact={artifactById.get(ticket.id)} phaseLabel={phaseLabelFor(ticket.id)} />
    </div>
    {hatUntergeordneteTickets && isOpen && <ul>{untergeordneteEinträge}</ul>}
  </li>;
}

function HierarchyBranch({ ticket, tickets, view, expanded, toggle, open, artifactById, presentationById, phaseLabelFor }: { ticket: StoryTicket; tickets: StoryTicket[]; view: JiraView; expanded: Record<string, boolean>; toggle: (key: string) => void; open: OpenArtifact; artifactById: Map<string, Artifact>; presentationById: Map<string, PresentationTicket>; phaseLabelFor: (ticketId: string) => string }) {
  const presentation = presentationById.get(ticket.id);
  if (!presentation) return null;
  const children = tickets.filter((item) => item.parent === ticket.id);
  return <HierarchyItem ticket={ticket} presentation={presentation} children={children} view={view} expanded={expanded} toggle={toggle} open={open} artifactById={artifactById} presentationById={presentationById} tickets={tickets} phaseLabelFor={phaseLabelFor} />;
}

export function TicketsPage({ state, open }: { state: ProjectState; open: OpenArtifact }) {
  const contract = state.presentation; const story = state.story;
  if (!contract || !story) return <section className="source-empty"><p>QUELLDATEN NICHT VORHANDEN</p><h2>Keine kanonische Ticketansicht belegt</h2><p>Der Producervertrag enthält noch keine validierte kundenlesbare Jira-Präsentation.</p></section>;
  const views = [...contract.jira.views].sort((left, right) => left.order - right.order);
  const [viewId, setViewId] = useState(views[0].id); const activeView = views.find((view) => view.id === viewId) ?? views[0];
  const [query, setQuery] = useState(''); const [filters, setFilters] = useState<Record<string, string>>({});
  const { expanded, toggle } = useSessionExpansion(state.source.projectId, state.source.commit, contract);
  const storyById = new Map(story.tickets.map((ticket) => [ticket.id, ticket]));
  const presentationById = new Map(contract.jira.tickets.map((ticket) => [ticket.ticketId, ticket]));
  const artifactById = new Map(state.artifacts.map((artifact) => [artifact.id, artifact]));
  const phaseLabelById = new Map(contract.jira.tickets.filter((ticket) => ticket.type === 'phase').map((ticket) => [ticket.ticketId, storyById.get(ticket.ticketId)?.summary ?? ticket.ticketId]));
  const phaseLabelFor = (ticketId: string) => { const ticket = presentationById.get(ticketId); if (!ticket) return 'Phase nicht belegt'; if (ticket.type === 'phase') return phaseLabelById.get(ticket.ticketId) ?? ticket.ticketId; if (ticket.type === 'epic') return ticket.phaseRefs.map((id) => phaseLabelById.get(id) ?? id).join(', '); return ticket.phaseId ? phaseLabelById.get(ticket.phaseId) ?? ticket.phaseId : 'Phase nicht belegt'; };
  const descendantsFor = (rootId: string) => { const result: string[] = []; const queue = contract.jira.tickets.filter((ticket) => ticket.parentId === rootId).map((ticket) => ticket.ticketId); while (queue.length) { const id = queue.shift()!; result.push(id); queue.push(...contract.jira.tickets.filter((ticket) => ticket.parentId === id).map((ticket) => ticket.ticketId)); } return result; };
  const valueFor = (ticket: StoryTicket, presentation: PresentationTicket, field: string) => field === 'type' ? presentation.type : field === 'status' ? ticket.status : field === 'priority' ? ticket.priority : field === 'phase' ? presentation.phaseId : field === 'role' ? presentation.role : null;
  const visibleTickets = contract.jira.tickets.flatMap((presentation) => { const ticket = storyById.get(presentation.ticketId); if (!ticket) return []; const haystack = `${ticket.id} ${ticket.summary} ${presentation.typeLabel}`.toLocaleLowerCase('de'); const matchesSearch = !query.trim() || haystack.includes(query.trim().toLocaleLowerCase('de')); const matchesFilters = activeView.filters.every((filter) => !filters[filter.id] || valueFor(ticket, presentation, filter.field) === filters[filter.id]); return matchesSearch && matchesFilters ? [ticket] : []; });
  const visibleIds = new Set(visibleTickets.map((ticket) => ticket.id));
  const taskHours = contract.jira.tickets.filter((ticket) => ticket.type === 'task' && ticket.billable).reduce((sum, ticket) => sum + ticket.actualHours, 0);

  return <section className="tickets-page">
    <header><div><p>KANONISCHE PROJEKTSTORY</p><h2>Kanonischer Projekt-Backlog</h2><p>Board, Liste und Summen verwenden ausschließlich {contract.jira.canonicalTicketCount} producerdefinierte kundenlesbare Tickets.</p></div><span>Taskbasis: {taskHours} Std. · keine historischen Traceability-Issues</span></header>
    <div className="ticket-controls"><label>Tickets durchsuchen<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Key, Titel oder Typ" /></label>{activeView.filters.map((filter) => <label key={filter.id}>{filter.label}<select value={filters[filter.id] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [filter.id]: event.target.value }))}><option value="">Alle</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div>
    <nav className="ticket-view-switcher" aria-label="Ticketansicht">{views.map((view) => <button key={view.id} aria-pressed={view.id === activeView.id} onClick={() => setViewId(view.id)}>{view.label}</button>)}</nav>
    {query.trim() && <section className="ticket-search-results"><h3>Suchergebnisse</h3>{visibleTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} presentation={presentationById.get(ticket.id)!} view={activeView} open={open} artifact={artifactById.get(ticket.id)} phaseLabel={phaseLabelFor(ticket.id)} />)}</section>}
    <p className="honest-note">{visibleTickets.length} von {contract.jira.canonicalTicketCount} kanonischen Tickets sichtbar.</p>
    {activeView.kind === 'board' ? <div className="producer-board">{activeView.groups.map((group) => { const phase = presentationById.get(group.phaseTicketId)!; const groupKey = `group:${activeView.id}:${group.id}`; const phaseOpen = expanded[groupKey] ?? group.initialState === 'expanded'; return <section key={group.id} className="producer-ticket-group producer-phase-group"><header><GroupDisclosure prefix="Phase" label={group.label} expanded={phaseOpen} onClick={() => toggle(groupKey)} onOpen={() => { const artifact = artifactById.get(phase.ticketId); if (artifact) open(artifact); }} presentation={phase} rollup={phase} /></header>{phaseOpen && group.epicIds.map((epicId) => { const epic = presentationById.get(epicId)!; const epicStory = storyById.get(epicId)!; const epicKey = `epic:${activeView.id}:${group.id}:${epicId}`; const epicOpen = expanded[epicKey] ?? epic.initialState === 'expanded'; const descendantIds = descendantsFor(epicId).filter((id) => group.ticketIds.includes(id)); return <section key={epicId} className="producer-epic-group"><header><GroupDisclosure prefix="Epic" label={epicStory.summary} expanded={epicOpen} onClick={() => toggle(epicKey)} onOpen={() => { const artifact = artifactById.get(epicId); if (artifact) open(artifact); }} presentation={epic} rollup={epic} /></header>{epicOpen && <div className="producer-board-columns">{[...activeView.columns].sort((a, b) => a.order - b.order).map((column) => { const columnKey = `column:${activeView.id}:${column.id}`; const columnOpen = expanded[columnKey] ?? false; const tickets = descendantIds.flatMap((id) => { const item = storyById.get(id); return item && visibleIds.has(id) && column.statuses.includes(item.status) ? [item] : []; }); return <section key={column.id} className="producer-board-column"><button className="column-toggle" aria-expanded={columnOpen} onClick={() => toggle(columnKey)}><strong>{column.label}</strong><span>{tickets.length}</span></button>{columnOpen && tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} presentation={presentationById.get(ticket.id)!} view={activeView} open={open} artifact={artifactById.get(ticket.id)} phaseLabel={group.label} />)}</section>; })}</div>}</section>; })}</section>; })}</div>
      : <div className="producer-ticket-list">{activeView.groups.map((group) => { const phase = presentationById.get(group.phaseTicketId)!; const groupKey = `group:${activeView.id}:${group.id}`; const phaseOpen = expanded[groupKey] ?? group.initialState === 'expanded'; return <section key={group.id} className="producer-ticket-group producer-phase-group"><header><GroupDisclosure prefix="Phase" label={group.label} expanded={phaseOpen} onClick={() => toggle(groupKey)} onOpen={() => { const artifact = artifactById.get(phase.ticketId); if (artifact) open(artifact); }} presentation={phase} rollup={phase} /></header>{phaseOpen && group.epicIds.map((epicId) => { const epicStory = storyById.get(epicId)!; const hierarchy = [epicStory, ...descendantsFor(epicId).filter((id) => group.ticketIds.includes(id)).map((id) => storyById.get(id)!).filter(Boolean)]; return <ul key={epicId} className="ticket-tree"><HierarchyBranch ticket={epicStory} tickets={hierarchy} view={activeView} expanded={expanded} toggle={toggle} open={open} artifactById={artifactById} presentationById={presentationById} phaseLabelFor={phaseLabelFor} /></ul>; })}</section>; })}</div>}
  </section>;
}
