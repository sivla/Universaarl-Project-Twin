import { useEffect, useMemo, useState } from 'react';
import type { Artifact, PresentationContract, PresentationTicket, ProjectState } from '../model';
import { displayStatus } from '../model';
import { TicketTypeIcon } from './TicketTypeIcon';
import { directTicketChildren, ticketBoardStatusSummary, ticketHierarchyContext } from '../navigation/ticket-hierarchy';

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

function TicketCard({ ticket, presentation, view, open, artifact, phaseLabel, childTasks = [] }: { ticket: StoryTicket; presentation: PresentationTicket; view: JiraView; open: OpenArtifact; artifact?: Artifact; phaseLabel: string; childTasks?: PresentationTicket[] }) {
  const fields = new Set(view.visibleFields);
  const childRollup = childTasks.reduce((sum, item) => ({ estimate: sum.estimate + item.estimateHours, actual: sum.actual + item.actualHours, remaining: sum.remaining + item.remainingHours }), { estimate: 0, actual: 0, remaining: 0 });
  const isStoryLevel = presentation.type === 'story' || presentation.type === 'bug';
  return <article className="ticket-card">
    <TicketHeading presentation={presentation} ticket={ticket} />
    <span className="ticket-card-meta">
      {fields.has('status') && <span>{displayStatus(ticket.status)}</span>}
      {fields.has('priority') && <span>{ticket.priority ?? 'Priorität nicht belegt'}</span>}
      {fields.has('phase') && <span>{phaseLabel}</span>}
      {fields.has('role') && <span>{presentation.role && !/^P-\d+$/i.test(presentation.role) ? presentation.role : 'Person/Rolle nicht typisiert'}</span>}
      {fields.has('worklogHours') && <span>{ticket.worklogs.reduce((sum, item) => sum + item.hours, 0)} Std.</span>}
      {isStoryLevel && <span>{childTasks.length} {childTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} · {childRollup.estimate} Std. Schätzung · {childRollup.actual} Std. Ist · {childRollup.remaining} Std. Rest</span>}
      {presentation.type === 'epic' || presentation.type === 'phase' ? <span>Schätzung {presentation.estimateHours} Std. · Task-Rollup {presentation.actualHours} Std. Ist / {presentation.remainingHours} Std. Rest</span> : null}
    </span>
    <button className="ticket-detail-action" onClick={() => artifact && open(artifact)} disabled={!artifact} aria-label={`${presentation.typeLabel}-Ticket ${ticket.id} im Detail öffnen`}>Details</button>
  </article>;
}

function GroupDisclosure({ label, expanded, onClick, onOpen, presentation, prefix, rollup }: { label: string; expanded: boolean; onClick: () => void; onOpen?: () => void; presentation?: PresentationTicket; prefix: 'Phase' | 'Epic'; rollup?: { estimateHours: number; actualHours: number; remainingHours: number } }) {
  return <div className="group-disclosure-row"><button className={`group-disclosure group-disclosure-${prefix.toLowerCase()}`} aria-expanded={expanded} aria-label={`${expanded ? 'Einklappen' : 'Aufklappen'}: ${prefix} ${label}`} onClick={onClick}><span aria-hidden="true">{expanded ? '⌄' : '›'}</span>{presentation && <TicketTypeIcon ticket={presentation} />}<strong>{prefix}: {label}</strong>{rollup && <span>{rollup.estimateHours} Std. geplant · {rollup.actualHours} Std. Ist · {rollup.remainingHours} Std. Rest</span>}<small>{expanded ? 'Eingeblendet' : 'Ausgeblendet'}</small></button>{onOpen && <button className="group-detail-button" onClick={onOpen} aria-label={`${prefix}-Ticket ${presentation?.ticketId ?? label} im Detail öffnen`}>Details</button>}</div>;
}

type HierarchyProps = { ticket: StoryTicket; view: JiraView; expanded: Record<string, boolean>; toggle: (key: string) => void; open: OpenArtifact; artifactById: Map<string, Artifact>; presentationById: Map<string, PresentationTicket>; tickets: StoryTicket[]; phaseLabelFor: (ticketId: string) => string; visibleIds?: Set<string> };

function HierarchyBranch(props: HierarchyProps) {
  const { ticket, tickets, presentationById, visibleIds } = props;
  const presentation = presentationById.get(ticket.id);
  if (!presentation) return null;
  const children = directTicketChildren(tickets, ticket.id).filter((item) => !visibleIds || visibleIds.has(item.id));
  const selfVisible = !visibleIds || visibleIds.has(ticket.id);
  if (!selfVisible && children.length === 0) return null;
  const key = `ticket:${ticket.id}`;
  const isOpen = props.expanded[key] ?? presentation.initialState === 'expanded';
  const zeigtUntergeordneteTickets = children.length > 0 && isOpen;
  const childPresentations = children.flatMap((child) => { const item = presentationById.get(child.id); return item?.type === 'task' ? [item] : []; });
  return <li className={`ticket-tree-item ticket-tree-${presentation.type}`}>
    <div className="ticket-tree-line">
      {children.length > 0 ? <button className="collapse-button" aria-expanded={isOpen} aria-label={`${isOpen ? 'Einklappen' : 'Aufklappen'}: ${presentation.typeLabel} ${ticket.id}`} onClick={() => props.toggle(key)}>{isOpen ? '−' : '+'}</button> : <span className="collapse-placeholder" aria-hidden="true" />}
      <TicketCard ticket={ticket} presentation={presentation} view={props.view} open={props.open} artifact={props.artifactById.get(ticket.id)} phaseLabel={props.phaseLabelFor(ticket.id)} childTasks={childPresentations} />
    </div>
    {zeigtUntergeordneteTickets && <ul>
      {children.map((child) => <HierarchyBranch
        key={child.id}
        {...props}
        ticket={child}
      />)}
    </ul>}
  </li>;
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
  const ancestorsFor = (ticketId: string) => { const result: PresentationTicket[] = []; let current = presentationById.get(ticketId)?.parentId; while (current) { const parent = presentationById.get(current); if (!parent) break; result.unshift(parent); current = parent.parentId; } return result; };
  const contextFor = (ticketId: string) => ticketHierarchyContext(story.tickets, contract.jira.tickets, ticketId);
  const valueFor = (ticket: StoryTicket, presentation: PresentationTicket, field: string) => field === 'type' ? presentation.type : field === 'status' ? ticket.status : field === 'priority' ? ticket.priority : field === 'phase' ? presentation.phaseId : field === 'role' ? presentation.role : null;
  const matchingTickets = contract.jira.tickets.flatMap((presentation) => { const ticket = storyById.get(presentation.ticketId); if (!ticket) return []; const haystack = `${ticket.id} ${ticket.summary} ${presentation.typeLabel}`.toLocaleLowerCase('de'); const matchesSearch = !query.trim() || haystack.includes(query.trim().toLocaleLowerCase('de')); const matchesFilters = activeView.filters.every((filter) => !filters[filter.id] || valueFor(ticket, presentation, filter.field) === filters[filter.id]); return matchesSearch && matchesFilters ? [ticket] : []; });
  const visibleIds = new Set(matchingTickets.map((ticket) => ticket.id));
  for (const ticket of matchingTickets) for (const ancestor of ancestorsFor(ticket.id)) visibleIds.add(ancestor.ticketId);
  const taskHours = contract.jira.tickets.filter((ticket) => ticket.type === 'task' && ticket.billable).reduce((sum, ticket) => sum + ticket.actualHours, 0);
  const statusSummary = ticketBoardStatusSummary(contract, story.tickets);
  const hierarchyProps = { view: activeView, expanded, toggle, open, artifactById, presentationById, tickets: story.tickets, phaseLabelFor, visibleIds };

  return <section className="tickets-page">
    <header><div><p>KANONISCHE PROJEKTSTORY</p><h2>Kanonischer Projekt-Backlog</h2><p>Board, Liste und Summen verwenden ausschließlich {contract.jira.canonicalTicketCount} producerdefinierte kundenlesbare Tickets.</p></div><span>Taskbasis: {taskHours} Std. · keine historischen Traceability-Issues</span></header>
    <div className="ticket-controls"><label>Tickets durchsuchen<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Key, Titel oder Typ" /></label>{activeView.filters.map((filter) => <label key={filter.id}>{filter.label}<select value={filters[filter.id] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [filter.id]: event.target.value }))}><option value="">Alle</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div>
    <nav className="ticket-view-switcher" aria-label="Ticketansicht">{views.map((view) => <button key={view.id} aria-pressed={view.id === activeView.id} onClick={() => setViewId(view.id)}>{view.label}</button>)}</nav>
    <dl className="ticket-status-summary" aria-label="Statuspartition des Projekt-Backlogs">{statusSummary.map((item) => <div key={item.id}><dt>{item.label}</dt><dd>{item.count}{item.blockedCount > 0 && <small>davon {item.blockedCount} fachlich blockiert</small>}</dd></div>)}</dl>
    {query.trim() ? <section className="ticket-search-results"><h3>Suchergebnisse</h3>{matchingTickets.length ? matchingTickets.map((ticket) => <article className="ticket-search-result" key={ticket.id}><p>{contextFor(ticket.id) || 'Oberste Hierarchieebene'}</p><TicketCard ticket={ticket} presentation={presentationById.get(ticket.id)!} view={activeView} open={open} artifact={artifactById.get(ticket.id)} phaseLabel={phaseLabelFor(ticket.id)} /></article>) : <p>Kein kanonisches Ticket entspricht der Suche.</p>}</section> : <>
      <p className="honest-note">{matchingTickets.length} von {contract.jira.canonicalTicketCount} kanonischen Tickets sichtbar.</p>
      {activeView.kind === 'board' ? <div className="producer-board">{activeView.groups.map((group) => { const phase = presentationById.get(group.phaseTicketId)!; const groupKey = `group:${activeView.id}:${group.id}`; const phaseOpen = expanded[groupKey] ?? group.initialState === 'expanded'; return <section key={group.id} className="producer-ticket-group producer-phase-group"><header><GroupDisclosure prefix="Phase" label={group.label} expanded={phaseOpen} onClick={() => toggle(groupKey)} onOpen={() => { const artifact = artifactById.get(phase.ticketId); if (artifact) open(artifact); }} presentation={phase} rollup={phase} /></header>{phaseOpen && group.epicIds.map((epicId) => { const epic = presentationById.get(epicId)!; const epicStory = storyById.get(epicId)!; const epicKey = `epic:${activeView.id}:${group.id}:${epicId}`; const epicOpen = expanded[epicKey] ?? epic.initialState === 'expanded'; const descendants = descendantsFor(epicId).filter((id) => group.ticketIds.includes(id)); return <section key={epicId} className="producer-epic-group"><header><GroupDisclosure prefix="Epic" label={epicStory.summary} expanded={epicOpen} onClick={() => toggle(epicKey)} onOpen={() => { const artifact = artifactById.get(epicId); if (artifact) open(artifact); }} presentation={epic} rollup={epic} /></header>{epicOpen && <div className="producer-board-columns">{[...activeView.columns].sort((a, b) => a.order - b.order).map((column) => { const columnKey = `column:${activeView.id}:${column.id}`; const columnOpen = expanded[columnKey] ?? column.initialState === 'expanded'; const branchRoots = descendants.flatMap((id) => { const item = storyById.get(id); const type = presentationById.get(id)?.type; return item && (type === 'story' || type === 'bug') && column.statuses.includes(item.status) && visibleIds.has(id) ? [item] : []; }); return <section key={column.id} className="producer-board-column"><button className="column-toggle" aria-expanded={columnOpen} onClick={() => toggle(columnKey)}><strong>{column.label}</strong><span>{branchRoots.length}</span></button>{columnOpen && <ul className="ticket-tree">{branchRoots.map((ticket) => <HierarchyBranch key={ticket.id} {...hierarchyProps} ticket={ticket} />)}</ul>}</section>; })}</div>}</section>; })}</section>; })}</div>
        : <div className="producer-ticket-list">{activeView.groups.map((group) => { const phase = presentationById.get(group.phaseTicketId)!; const groupKey = `group:${activeView.id}:${group.id}`; const phaseOpen = expanded[groupKey] ?? group.initialState === 'expanded'; return <section key={group.id} className="producer-ticket-group producer-phase-group"><header><GroupDisclosure prefix="Phase" label={group.label} expanded={phaseOpen} onClick={() => toggle(groupKey)} onOpen={() => { const artifact = artifactById.get(phase.ticketId); if (artifact) open(artifact); }} presentation={phase} rollup={phase} /></header>{phaseOpen && group.epicIds.map((epicId) => { const epicStory = storyById.get(epicId)!; return <ul key={epicId} className="ticket-tree"><HierarchyBranch {...hierarchyProps} ticket={epicStory} /></ul>; })}</section>; })}</div>}
    </>}
  </section>;
}
