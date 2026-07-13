import { useEffect, useState } from 'react';
import type { ProjectDocument, ProjectResource } from '../model';
import { SemanticMarkdown } from './SemanticMarkdown';

const typeLabels: Record<ProjectResource['artifactType'], string> = { deliverable: 'Lieferobjekt', evidence: 'Nachweis', screenshot: 'Screenshot', 'click-guide': 'Klickanleitung', training: 'Schulungsunterlage', 'customer-handbook': 'Kundenhandbuch', transcript: 'Transkript' };
const endpoint = (projectId: string, resource: ProjectResource, action: 'preview' | 'download') => `/api/projects/${encodeURIComponent(projectId)}/resources/${encodeURIComponent(resource.id)}/${action}`;

function TextPreview({ projectId, resource, documents }: { projectId: string; resource: ProjectResource; documents: readonly ProjectDocument[] }) {
  const [content, setContent] = useState<string>(); const [failed, setFailed] = useState(false);
  useEffect(() => { const controller = new AbortController(); setContent(undefined); setFailed(false); void fetch(endpoint(projectId, resource, 'preview'), { signal: controller.signal }).then((response) => response.ok ? response.text() : Promise.reject()).then(setContent).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, [projectId, resource]);
  if (failed) return <p className="honest-note">Die commitgebundene Vorschau ist nicht verfügbar.</p>;
  if (content === undefined) return <p role="status">Vorschau wird geladen.</p>;
  return resource.previewMode === 'markdown' ? <SemanticMarkdown content={content} sourcePath="ressource.md" documents={documents} onOpenDocument={() => undefined} /> : <pre className="resource-text"><code>{content}</code></pre>;
}

export function ArtifactViewer({ projectId, resources, documents }: { projectId: string; resources: readonly ProjectResource[]; documents: readonly ProjectDocument[] }) {
  const [selectedId, setSelectedId] = useState(resources[0]?.id ?? ''); const selected = resources.find((item) => item.id === selectedId) ?? resources[0];
  if (!resources.length) return null;
  return <section className="resource-viewer"><header><div><p>VALIDIERTE RESSOURCEN</p><h2>Lieferdateien und Nachweise</h2></div><span>{resources.length} katalogisierte Ressourcen</span></header>
    <div className="resource-layout"><nav aria-label="Ressourcen auswählen">{resources.map((resource) => <button key={resource.id} aria-current={selected?.id === resource.id ? 'page' : undefined} onClick={() => setSelectedId(resource.id)}><strong>{resource.title}</strong><small>{typeLabels[resource.artifactType]} · {resource.sizeBytes.toLocaleString('de-DE')} Bytes</small></button>)}</nav>{selected && <article><header><div><p>{typeLabels[selected.artifactType]}</p><h3>{selected.title}</h3></div><span>{selected.status}</span></header>
      {selected.caption && <p>{selected.caption}</p>}<dl>{selected.processStep && <><dt>Prozessschritt</dt><dd>{selected.processStep}</dd></>}{selected.precondition && <><dt>Vorbedingung</dt><dd>{selected.precondition}</dd></>}{selected.postcondition && <><dt>Nachbedingung</dt><dd>{selected.postcondition}</dd></>}<dt>Integrität</dt><dd>Commitgebundener Blob · SHA-256 geprüft</dd></dl>
      {(selected.previewMode === 'markdown' || selected.previewMode === 'text') && <TextPreview projectId={projectId} resource={selected} documents={documents} />}
      {selected.previewMode === 'image' && <figure><img src={endpoint(projectId, selected, 'preview')} alt={selected.caption ?? selected.title} /><figcaption>{selected.caption ?? selected.title}</figcaption></figure>}
      {selected.previewMode === 'pdf' && <iframe title={`PDF-Vorschau: ${selected.title}`} src={endpoint(projectId, selected, 'preview')} />}
      {selected.downloadable && <a className="primary-action" href={endpoint(projectId, selected, 'download')}>Commitgebundene Datei herunterladen</a>}
      <section><h4>Verknüpfungen</h4><p>Jira: {selected.jiraRefs.join(', ') || 'Keine'} · Dokumentation: {selected.confluenceRefs.join(', ') || 'Keine'} · Lieferobjekte: {selected.deliverableRefs.join(', ') || 'Keine'}</p></section>
    </article>}</div>
  </section>;
}
