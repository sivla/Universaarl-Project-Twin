import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AdapterSourceError, redactDocumentationHostPaths, validateDocumentationMarkdown } from '../src/server/adapter';
import { areas, parseRoute } from '../src/navigation/routes';

describe('commitgebundene Projektdokumentation', () => {
  it('stellt den nachrangigen Dokumentationsbereich als stabile Projektroute bereit', () => {
    expect(areas).toContain('projektdokumentation');
    expect(parseRoute('/projekte/bc-basic/projektdokumentation', ['bc-basic'])).toEqual({ kind: 'project', projectId: 'bc-basic', area: 'projektdokumentation' });
  });

  it('entfernt Metadatenkommentare und lässt technische Platzhalter nur als passiven Text zu', () => {
    const paths = new Set(['docs/a.md', 'docs/b.md']);
    expect(validateDocumentationMarkdown('<!-- Metadaten -->\n# Vertrag <SemVer>\n[Weiter](b.md)', 'docs/a.md', paths)).toEqual({ content: '# Vertrag <SemVer>\n[Weiter](b.md)', targets: ['docs/b.md'] });
  });

  it('blockiert aktive Inhalte und nicht freigegebene Linkziele fail-closed', () => {
    const paths = new Set(['docs/a.md', 'docs/b.md']);
    for (const content of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[Angriff](javascript:alert(1))', '[Extern](https://example.invalid)', '[Datei](file:///secret)', '[Traversal](../secret.md)', '[Fehlt](missing.md)']) {
      expect(() => validateDocumentationMarkdown(content, 'docs/a.md', paths)).toThrow(AdapterSourceError);
    }
  });

  it('rendert Dokumenttext ausschließlich über React und nie als aktives HTML', () => {
    const ui = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    const adapter = fs.readFileSync(path.resolve('src/server/adapter.ts'), 'utf8');
    expect(ui).toContain('function SafeMarkdown');
    expect(ui).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=/);
    expect(adapter).toContain('Keine kanonische Confluence-URL im Projektindex belegt.');
  });

  it('bewahrt Fachtext und redigiert ausschließlich lokale Hostpfade', () => {
    expect(redactDocumentationHostPaths('V1_STANDARDPRODUCT_READY · C:\\Users\\kunde\\secret.md')).toBe('V1_STANDARDPRODUCT_READY · [lokaler Pfad redigiert]');
  });
});
