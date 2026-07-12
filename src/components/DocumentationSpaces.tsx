import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PresentationContract, ProjectDocument, ProjectState } from '../model';
import { displayDocumentType, displayStatus } from '../model';
import { markdownHeadings, SemanticMarkdown } from './SemanticMarkdown';

type Space = PresentationContract['spaces'][number];
type SpaceNode = Space['nodes'][number];

function defaultExpansion(contract: PresentationContract) {
  const result: Record<string, boolean> = {};
  for (const space of contract.spaces) { result[`space:${space.id}`] = space.initialState === 'expanded'; for (const node of space.nodes) result[`node:${space.id}:${node.id}`] = node.initialState === 'expanded'; }
  return result;
}

function useSpaceSession(state: ProjectState, contract: PresentationContract) {
  const key = `twin-spaces:${state.source.projectId}:${state.source.commit}`; const defaults = useMemo(() => defaultExpansion(contract), [contract]); const [expanded, setExpanded] = useState(defaults);
  useEffect(() => { let stored: Record<string, boolean> | null = null; try { const raw = sessionStorage.getItem(key); stored = raw ? JSON.parse(raw) as Record<string, boolean> : null; } catch { stored = null; } setExpanded({ ...defaults, ...(stored ?? {}) }); }, [defaults, key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(expanded)); } catch { /* Optionaler UI-Zustand bleibt lokal. */ } }, [expanded, key]);
  return { expanded, setExpanded };
}

function firstPage(space: Space) { return [...space.nodes].sort((a, b) => a.order - b.order).find((node) => node.kind === 'page')?.id ?? ''; }

export function DocumentationSpaces({ state }: { state: ProjectState }) {
  const contract = state.presentation; if (!contract) return null;
  const spaces = [...contract.spaces].sort((a, b) => a.order - b.order); const params = new URL(location.href).searchParams;
  const requestedSpace = spaces.find((space) => space.id === params.get('space')); const initialSpace = requestedSpace ?? spaces[0];
  const requestedNode = initialSpace.nodes.find((node) => node.id === params.get('node') && node.kind === 'page');
  const [spaceId, setSpaceId] = useState(initialSpace.id); const [selectedNodeId, setSelectedNodeId] = useState(requestedNode?.id ?? firstPage(initialSpace));
  const [query, setQuery] = useState(''); const [type, setType] = useState('alle'); const [status, setStatus] = useState('alle');
  const { expanded, setExpanded } = useSpaceSession(state, contract); const activeSpace = spaces.find((space) => space.id === spaceId) ?? spaces[0];
  const nodesById = new Map(activeSpace.nodes.map((node) => [node.id, node])); const documentsById = new Map(state.documents.map((document) => [document.id, document]));
  const selectedNode = nodesById.get(selectedNodeId); const selected = selectedNode?.documentId ? documentsById.get(selectedNode.documentId) : undefined;
  const activeDocumentIds = new Set(activeSpace.nodes.flatMap((node) => node.documentId ? [node.documentId] : [])); const activeDocuments = state.documents.filter((document) => activeDocumentIds.has(document.id));
  const typeValues = [...new Set(activeDocuments.map((document) => document.documentType))].sort(); const statusValues = [...new Set(activeDocuments.map((document) => document.status ?? 'Nicht belegt'))].sort();
  const visibleDocumentIds = new Set(activeDocuments.filter((document) => (!query.trim() || `${document.id} ${document.title} ${document.content}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'))) && (type === 'alle' || document.documentType === type) && (status === 'alle' || (document.status ?? 'Nicht belegt') === status)).map((document) => document.id));

  const ancestors = (space: Space, nodeId: string) => { const byId = new Map(space.nodes.map((node) => [node.id, node])); const path: SpaceNode[] = []; let current = byId.get(nodeId); const seen = new Set<string>(); while (current && !seen.has(current.id)) { path.unshift(current); seen.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined; } return path; };
  useEffect(() => {
    if (!requestedNode) return;
    const openedPath = Object.fromEntries(ancestors(initialSpace, requestedNode.id).map((node) => [`node:${initialSpace.id}:${node.id}`, true]));
    setExpanded((current) => ({ ...current, ...openedPath }));
  }, [initialSpace.id, requestedNode?.id, setExpanded]);
  const openNode = (nextSpace: Space, nodeId: string) => {
    const path = ancestors(nextSpace, nodeId); setExpanded((current) => ({ ...current, ...Object.fromEntries(path.map((node) => [`node:${nextSpace.id}:${node.id}`, true])) })); setSpaceId(nextSpace.id); setSelectedNodeId(nodeId);
    const url = new URL(location.href); url.searchParams.set('space', nextSpace.id); url.searchParams.set('node', nodeId); history.replaceState(null, '', `${url.pathname}${url.search}`);
  };
  const openDocument = (documentId: string) => { for (const space of spaces) { const node = space.nodes.find((item) => item.documentId === documentId); if (node) { openNode(space, node.id); return; } } };
  const toggle = (key: string) => setExpanded((current) => ({ ...current, [key]: !current[key] }));
  const setAll = (value: boolean) => setExpanded((current) => ({ ...current, ...Object.fromEntries(activeSpace.nodes.filter((node) => node.kind !== 'page').map((node) => [`node:${activeSpace.id}:${node.id}`, value])) }));
  const children = (parentId: string | null) => [...activeSpace.nodes].filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order);
  const renderNode = (node: SpaceNode): ReactNode => {
    const descendants = children(node.id); const key = `node:${activeSpace.id}:${node.id}`; const isOpen = expanded[key] ?? false;
    const meta = [node.purpose, node.audience].filter((value): value is string => Boolean(value)).join(' · ');
    if (node.kind === 'page') { if (node.documentId && !visibleDocumentIds.has(node.documentId)) return null; return <li key={node.id}><button className="space-page-link" aria-current={selectedNodeId === node.id ? 'page' : undefined} onClick={() => openNode(activeSpace, node.id)}><strong>{node.title}</strong>{meta && <small>{meta}</small>}</button></li>; }
    return <li key={node.id} className={`space-node space-node-${node.kind}`}><button className="space-node-toggle" aria-expanded={isOpen} onClick={() => toggle(key)}><span>{isOpen ? '−' : '+'}</span><strong>{node.title}</strong>{meta && <small>{meta}</small>}</button>{isOpen && descendants.length > 0 && <ul>{descendants.map(renderNode)}</ul>}</li>;
  };
  const breadcrumb = selectedNode ? ancestors(activeSpace, selectedNode.id) : []; const headings = selected ? markdownHeadings(selected.content) : [];

  return <section className="documentation-view presentation-documentation">
    <header><div><p>PRODUCERDEFINIERTE WISSENSRÄUME</p><h2>Drei Wissensräume</h2></div><span>Kundenprojekt, Standardprodukt und Durchführungshilfe · strikt nur lesend</span></header>
    <nav className="space-selector" aria-label="Wissensraum auswählen">{spaces.map((space) => <button key={space.id} aria-pressed={space.id === activeSpace.id} onClick={() => openNode(space, firstPage(space))}><strong>{space.title}</strong><small>{space.purpose} · {space.audience}</small></button>)}</nav>
    <div className="documentation-filters"><label>Seiten durchsuchen<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, Inhalt oder ID" /></label><label>Dokumenttyp<select value={type} onChange={(event) => setType(event.target.value)}><option value="alle">Alle Typen</option>{typeValues.map((value) => <option key={value} value={value}>{displayDocumentType(value)}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="alle">Alle Status</option>{statusValues.map((value) => <option key={value} value={value}>{displayStatus(value === 'Nicht belegt' ? null : value)}</option>)}</select></label></div>
    <div className="space-actions"><button onClick={() => setAll(true)}>Aktiven Raum vollständig aufklappen</button><button onClick={() => setAll(false)}>Aktiven Raum vollständig einklappen</button></div>
    <div className="documentation-layout"><nav className="documentation-tree space-tree" aria-label={`Seitenbaum ${activeSpace.title}`}><header><strong>{activeSpace.title}</strong><small>{activeSpace.purpose}</small></header><ul>{children(null).map(renderNode)}</ul></nav>{selected ? <article className={`documentation-page document-kind-${selected.documentType}`}><nav className="documentation-breadcrumb" aria-label="Brotkrümelnavigation"><button onClick={() => openNode(activeSpace, firstPage(activeSpace))}>{activeSpace.title}</button>{breadcrumb.map((node) => <span key={node.id}><span aria-hidden="true">›</span><button onClick={() => node.kind === 'page' ? openNode(activeSpace, node.id) : toggle(`node:${activeSpace.id}:${node.id}`)}>{node.title}</button></span>)}</nav><header><div><p>{displayDocumentType(selected.documentType)}</p><h2>{selected.title}</h2><span>{displayStatus(selected.status)} · Zielgruppe: {selectedNode?.audience ?? 'Nicht belegt'}</span></div><button disabled={!selected.externalUrl} title={selected.externalLinkReason}>In Confluence öffnen</button></header>{headings.length > 1 && <nav className="documentation-toc" aria-label="Inhaltsverzeichnis"><strong>Auf dieser Seite</strong>{headings.slice(1).map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.text}</a>)}</nav>}<SemanticMarkdown content={selected.content} sourcePath={selected.sourcePath} documents={state.documents} onOpenDocument={openDocument} /><details className="documentation-provenance"><summary>Provenienz und Validierungsstand</summary><dl><dt>Commit</dt><dd><code>{state.source.commit}</code></dd><dt>Quelldatei</dt><dd><code>{selected.sourcePath}</code></dd><dt>Validierung</dt><dd>Fixturevertrag und Dokumentreferenz geprüft</dd></dl></details></article> : <section className="source-empty"><h2>Keine passende Seite</h2><p>Für die gewählten Filter ist in diesem Raum keine Seite sichtbar.</p></section>}</div>
  </section>;
}
