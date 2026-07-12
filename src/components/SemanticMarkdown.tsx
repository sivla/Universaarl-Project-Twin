import React from 'react';
import type { ProjectDocument } from '../model';

export function markdownHeadingId(text: string, index: number) {
  const normalized = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `abschnitt-${normalized || index + 1}-${index + 1}`;
}

export function markdownHeadings(content: string) {
  return content.split(/\r?\n/).flatMap((line, index) => { const match = line.match(/^(#{1,3})\s+(.+)$/); return match ? [{ level: match[1].length, text: match[2].trim(), id: markdownHeadingId(match[2].trim(), index) }] : []; });
}

function resolveRelativePath(sourcePath: string, target: string) {
  const clean = target.split('#', 1)[0]; const segments = [...sourcePath.split('/').slice(0, -1), ...clean.split('/')]; const resolved: string[] = [];
  for (const segment of segments) { if (!segment || segment === '.') continue; if (segment === '..') resolved.pop(); else resolved.push(segment); }
  return resolved.join('/');
}

function InlineMarkdown({ text, sourcePath, documents, onOpenDocument }: { text: string; sourcePath: string; documents: readonly ProjectDocument[]; onOpenDocument: (id: string) => void }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/); if (link) {
      const [target, fragment] = link[2].split('#', 2); if (!target) return <a key={index} href={`#${fragment ?? ''}`}>{link[1]}</a>;
      const resolved = resolveRelativePath(sourcePath, target); const document = documents.find((item) => item.sourcePath === resolved);
      return document ? <button key={index} className="documentation-inline-link" onClick={() => onOpenDocument(document.id)}>{link[1]}</button> : <span key={index} className="documentation-broken-link" title="Dokumentziel nicht auflösbar">{link[1]}</span>;
    }
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  })}</>;
}

type ListEntry = { text: string; ordered: boolean; checked: boolean | null; children: ListEntry[] };
function parseList(lines: string[]) {
  const roots: ListEntry[] = []; const stack: Array<{ depth: number; children: ListEntry[] }> = [{ depth: -1, children: roots }];
  for (const line of lines) {
    const match = line.match(/^(\s*)([-*]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.+)$/); if (!match) continue;
    const depth = Math.floor(match[1].replace(/\t/g, '  ').length / 2); while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const entry: ListEntry = { text: match[4], ordered: /\d+\./.test(match[2]), checked: match[3] === undefined ? null : match[3].toLowerCase() === 'x', children: [] };
    stack[stack.length - 1].children.push(entry); stack.push({ depth, children: entry.children });
  }
  return roots;
}

function MarkdownList({ entries, sourcePath, documents, onOpenDocument }: { entries: ListEntry[]; sourcePath: string; documents: readonly ProjectDocument[]; onOpenDocument: (id: string) => void }) {
  const ordered = entries[0]?.ordered ?? false; const List = ordered ? 'ol' : 'ul';
  return <List>{entries.map((entry, index) => <li key={index} className={entry.checked === null ? undefined : 'documentation-check-item'}>{entry.checked !== null && <input type="checkbox" checked={entry.checked} readOnly aria-label={entry.checked ? 'Erledigt' : 'Offen'} />}<InlineMarkdown text={entry.text} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} />{entry.children.length > 0 && <MarkdownList entries={entry.children} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} />}</li>)}</List>;
}

export function SemanticMarkdown({ content, sourcePath, documents, onOpenDocument }: { content: string; sourcePath: string; documents: readonly ProjectDocument[]; onOpenDocument: (id: string) => void }) {
  const lines = content.split(/\r?\n/); const nodes: React.ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]; if (!line.trim()) continue;
    if (line.startsWith('```')) { const language = line.slice(3).trim(); const code: string[] = []; index += 1; while (index < lines.length && !lines[index].startsWith('```')) { code.push(lines[index]); index += 1; } nodes.push(<figure className="documentation-code" key={`code-${index}`}><figcaption>{language || 'Code- oder Evidenceblock'}</figcaption><pre><code>{code.join('\n')}</code></pre></figure>); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/); if (heading) { const id = markdownHeadingId(heading[2].trim(), index); const value = <InlineMarkdown text={heading[2].trim()} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} />; nodes.push(heading[1].length === 1 ? <h2 id={id} key={id}>{value}</h2> : heading[1].length === 2 ? <h3 id={id} key={id}>{value}</h3> : <h4 id={id} key={id}>{value}</h4>); continue; }
    if (/^\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1])) { const tableLines = [line]; index += 2; while (index < lines.length && /^\|.*\|\s*$/.test(lines[index])) { tableLines.push(lines[index]); index += 1; } index -= 1; const rows = tableLines.map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim())); nodes.push(<div className="documentation-table-wrap" key={`table-${index}`}><table><thead><tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex}><InlineMarkdown text={cell} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} /></th>)}</tr></thead><tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineMarkdown text={cell} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} /></td>)}</tr>)}</tbody></table></div>); continue; }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) { const listLines = [line]; while (index + 1 < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[index + 1])) listLines.push(lines[++index]); nodes.push(<MarkdownList key={`list-${index}`} entries={parseList(listLines)} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} />); continue; }
    if (/^>\s?/.test(line)) { const quote: string[] = [line.replace(/^>\s?/, '')]; while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1])) quote.push(lines[++index].replace(/^>\s?/, '')); nodes.push(<aside className="documentation-note" key={`note-${index}`}><InlineMarkdown text={quote.join(' ')} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} /></aside>); continue; }
    nodes.push(<p key={`paragraph-${index}`}><InlineMarkdown text={line} sourcePath={sourcePath} documents={documents} onOpenDocument={onOpenDocument} /></p>);
  }
  return <div className="documentation-markdown semantic-markdown">{nodes}</div>;
}
