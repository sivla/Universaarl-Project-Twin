import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { phases, type Artifact, type ProjectState } from './model';
import './styles.css';

const kindOrder: Record<Artifact['kind'], number> = { milestone: 0, change: 1, epic: 2, story: 3, task: 4, architecture: 5, capability: 6, document: 7, evidence: 8 };
const phaseLabels = { Strategize: 'Strategie', Initiate: 'Initiierung', Implement: 'Umsetzung', Prepare: 'Vorbereitung', Operate: 'Betrieb' } as const;
const kindLabels: Record<Artifact['kind'], string> = { milestone: 'Meilenstein', epic: 'Epic', story: 'Story', task: 'Aufgabe', change: 'Änderung', capability: 'Fähigkeit', architecture: 'Architektur', document: 'Dokument', evidence: 'Nachweis' };
const workstreamLabels: Record<string, string> = { Finance: 'Finanzen', Reporting: 'Berichtswesen', 'Delivery Readiness Testing and Adoption': 'Lieferbereitschaft, Tests und Einführung', 'Project Governance': 'Projektsteuerung' };
const statusLabels: Record<string, string> = { planned: 'Geplant', deferred: 'Zurückgestellt', proposed: 'Vorgeschlagen', active: 'Aktiv', archived: 'Archiviert', approved: 'Freigegeben', passed: 'Bestanden', done: 'Erledigt', 'in review': 'In Prüfung', documented: 'Dokumentiert', unknown: 'Unbekannt', explicit: 'Explizit', 'w0 complete': 'W0 abgeschlossen', 'w0 passed': 'W0 bestanden' };
const germanStatus = (status: string) => statusLabels[status.toLowerCase()] ?? status;
const germanWorkstream = (workstream: string) => workstreamLabels[workstream] ?? workstream;
const germanGap = (gap: string) => gap
  .replace('Architecture baseline unknown:', 'Architektur-Baseline unbekannt:')
  .replace('company experience', 'Unternehmenserfahrung')
  .replace('complete German localization app inventory', 'vollständiges Inventar deutscher Lokalisierungs-Apps')
  .replace('complete installed extension inventory', 'vollständiges Inventar installierter Erweiterungen')
  .replace('complete feature inventory', 'vollständiges Funktionsinventar')
  .replace('Project calendar and milestone dates are not normalized by the approved source contract.', 'Projektkalender und Meilensteintermine sind im freigegebenen Quellenvertrag nicht normalisiert.')
  .replace('Meetings and decision chronology beyond evidenced Jira transitions are not normalized.', 'Meetings und Entscheidungsverläufe jenseits belegter Jira-Übergänge sind nicht normalisiert.')
  .replace('Worklogs, rates, invoices and T&M data are intentionally outside the MVP source contract.', 'Arbeitsprotokolle, Verrechnungssätze, Rechnungen und T&M-Daten liegen bewusst außerhalb des MVP-Quellenvertrags.');
const germanWarning = (warning: string) => warning.replace('Unresolved source references:', 'Nicht aufgelöste Quellreferenzen:').replace('Duplicate normalized artifact IDs:', 'Doppelte normalisierte Artefakt-IDs:');

function App() {
  const [state, setState] = useState<ProjectState>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Artifact>();
  const [selectedImage, setSelectedImage] = useState<ProjectState['evidenceImages'][number]>();
  const [stream, setStream] = useState('All');
  const worldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/project-state').then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unknown source error');
      return body;
    }).then(setState).catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(undefined); setSelectedImage(undefined); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);

  const artifactIndex = useMemo(() => new Map(state?.artifacts.map((artifact) => [artifact.id, artifact]) ?? []), [state]);
  const visibleStreams = stream === 'All' ? state?.workstreams ?? [] : [stream];
  const jump = (phase: string) => worldRef.current?.querySelector<HTMLElement>(`[data-phase="${phase}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  const nudge = (direction: number) => worldRef.current?.scrollBy({ left: direction * Math.min(window.innerWidth * .75, 720), behavior: 'smooth' });

  if (error) return <main className="state-screen error" role="alert"><p>UABC / QUELLE NICHT VERFÜGBAR</p><h1>Blueprint konnte nicht gelesen werden.</h1><code>{error}</code><small>Konfiguration und Quelldaten prüfen. Es wird kein Ersatzstatus erzeugt.</small></main>;
  if (!state) return <main className="state-screen loading"><span /><p>PROJEKT-ZWILLING</p><h1>SCHREIBGESCHÜTZTE QUELLE WIRD GELESEN</h1></main>;

  const ReferenceList = ({ ids }: { ids: string[] }) => ids.length ? <div className="reference-list">{ids.map((id) => artifactIndex.has(id)
    ? <button key={id} onClick={() => setSelected(artifactIndex.get(id))}>{id} ↗</button>
    : <span key={id}>{id}</span>)}</div> : <p className="empty-value">Nicht erfasst</p>;

  return <div className="shell">
    <header>
      <div className="brand"><b>UNIVERSAARL</b><span>PROJEKT / ZWILLING</span></div>
      <div className="source" aria-label="Herkunft der Blueprint-Quelle"><i className={state.source.dirty ? 'dirty' : 'clean'} /><span>{state.source.pathLabel}</span><strong>{state.source.branch}</strong><code>{state.source.commit}</code><small>{state.source.dirty ? 'QUELLE MIT ÄNDERUNGEN' : 'SAUBERE QUELLE'} · NUR LESEN · {new Date(state.source.readAt).toLocaleString('de-DE')}</small></div>
    </header>

    <main>
      <section className="world-intro">
        <div><p>PROJEKTWELT / BELEGTES W0—W1</p><h1>NUR LESEN<br /><em>PROJEKTKARTE</em></h1></div>
        <div className="metrics"><span><b>{state.stats.jira}</b> Jira-Vorgänge</span><span><b>{state.stats.capabilities}</b> Fähigkeiten</span><span><b>{state.stats.changes}</b> Änderungen</span><span><b>{state.stats.evidence}</b> Nachweise</span></div>
      </section>

      <section className="world-tools" aria-label="Navigation der Projektwelt">
        <div className="phase-jumps">{phases.map((phase, index) => <button key={phase} onClick={() => jump(phase)}><span>0{index + 1}</span>{phaseLabels[phase]}</button>)}</div>
        <div className="nudges"><button aria-label="Projektwelt nach links bewegen" onClick={() => nudge(-1)}>←</button><button aria-label="Projektwelt nach rechts bewegen" onClick={() => nudge(1)}>→</button></div>
      </section>

      <nav className="streams" aria-label="Filter für Arbeitsströme"><button className={stream === 'All' ? 'active' : ''} onClick={() => setStream('All')}>ALLE ARBEITSSTRÖME</button>{state.workstreams.map((name) => <button className={stream === name ? 'active' : ''} onClick={() => setStream(name)} key={name}>{germanWorkstream(name)}</button>)}</nav>

      <section className="world" ref={worldRef} aria-label="Horizontale Projektwelt">
        <div className="phase-row"><div className="corner">ARBEITSSTROM / PHASE</div>{phases.map((phase, index) => <div className="phase-head" data-phase={phase} key={phase}><span>0{index + 1}</span><h2>{phaseLabels[phase]}</h2></div>)}</div>
        {visibleStreams.map((workstream) => <div className="lane" key={workstream}>
          <button className="lane-name" onClick={() => setStream(workstream)}><span>ARBEITSSTROM</span>{germanWorkstream(workstream)}<small>{state.artifacts.filter((item) => item.workstream === workstream).length} Datensätze</small></button>
          {phases.map((phase) => {
            const matches = state.artifacts.filter((item) => item.workstream === workstream && item.phase === phase).sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
            const shown = stream === 'All' ? matches.slice(0, 5) : matches;
            return <div className="cell" key={phase}>{shown.map((artifact) => <button className={`node kind-${artifact.kind} status-${artifact.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} onClick={() => setSelected(artifact)} key={`${artifact.kind}-${artifact.id}`}>
              <small>{kindLabels[artifact.kind]}{artifact.wave ? ` / ${artifact.wave}` : ''}</small><strong>{artifact.id}</strong><span>{artifact.title}</span><i title={`Quellstatus: ${artifact.status}`}>{germanStatus(artifact.status)}</i>
            </button>)}{matches.length === 0 && <span className="no-record">—</span>}{matches.length > shown.length && <button className="more" onClick={() => setStream(workstream)}>+ {matches.length - shown.length} WEITERE</button>}</div>;
          })}
        </div>)}
      </section>

      <section className="chronology">
        <div className="section-title"><p>QUELLENBELEGTE CHRONOLOGIE</p><h2>W0- / W1-EREIGNISSE</h2><span>{state.stats.history} Jira-Übergänge · keine abgeleiteten Daten</span></div>
        <div className="event-strip">{state.history.map((event) => <button key={event.id} onClick={() => setSelected(artifactIndex.get(event.artifactId))}><time>{new Date(event.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</time><b>{event.wave} / {event.artifactId}</b><span>{germanStatus(event.from)} → {germanStatus(event.to)}</span></button>)}</div>
      </section>

      <section className="evidence-section">
        <div className="section-title"><p>GEPRÜFTER VISUELLER NACHWEIS</p><h2>NACHWEISE,<br />KEINE DEKORATION.</h2><span>Identitätsmaskierte Screenshots der Quelle</span></div>
        <div className="evidence-strip">{state.evidenceImages.map((item) => <button key={item.path} onClick={() => setSelectedImage(item)}><img src={`/api/evidence/${encodeURIComponent(item.path)}`} alt={`${item.title}, visueller Nachweis`} loading="lazy" /><span>{item.title}</span><small>{item.evidenceIds[0]}</small></button>)}</div>
      </section>

      <section className="gaps" id="data-gaps"><div><p>BEKANNTE LÜCKEN</p><h2>UNBEKANNT<br />BLEIBT UNBEKANNT.</h2></div><ol>{state.gaps.map((gap) => <li key={gap}>{germanGap(gap)}</li>)}</ol>{state.warnings.length > 0 && <div className="warnings"><b>HINWEISE ZUR QUELLE</b>{state.warnings.map((warning) => <span key={warning}>{germanWarning(warning)}</span>)}</div>}</section>
    </main>

    <footer><span>KEIN ZURÜCKSCHREIBEN / KEINE ERFUNDENEN STATUSWERTE / KEINE SPIELENTSCHEIDUNGEN</span><a href="#data-gaps">DATENLÜCKEN ANZEIGEN ↑</a></footer>

    {selected && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(undefined); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label="Artefaktdetails">
      <button className="close" onClick={() => setSelected(undefined)}>SCHLIESSEN ×</button><p>{kindLabels[selected.kind]} / {phaseLabels[selected.phase]} {selected.wave && `/ ${selected.wave}`}</p><h2>{selected.id}</h2><h3>{selected.title}</h3><span className="status" title={`Quellstatus: ${selected.status}`}>{germanStatus(selected.status)}</span>
      <h4>BEGRÜNDUNG / BASIS</h4><p className="rationale">{selected.rationale || 'In der normalisierten Quelle ist keine Begründung erfasst.'}</p>
      <h4>ABHÄNGIGKEITEN</h4><ReferenceList ids={selected.dependencies} /><h4>DOKUMENTE</h4><ReferenceList ids={selected.documents} /><h4>NACHWEISE</h4><ReferenceList ids={selected.evidence} />
      <div className="source-path"><span>QUELLE</span><code>{selected.sourcePath}</code></div>
    </aside></div>}
    {selectedImage && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Vorschau des Nachweises" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedImage(undefined); }}><button onClick={() => setSelectedImage(undefined)}>SCHLIESSEN ×</button><img src={`/api/evidence/${encodeURIComponent(selectedImage.path)}`} alt={`${selectedImage.title}, vollständiger Nachweis`} /><div><b>{selectedImage.title}</b><span>{selectedImage.evidenceIds.join(' · ')}</span></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
