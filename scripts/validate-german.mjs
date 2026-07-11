import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseDocument } from 'yaml';

const projectId = 'project-twin';
const generatedLockfile = 'package-lock.json';
const maxTextBytes = 1024 * 1024;
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const markdownExtensions = new Set(['.md', '.mdx']);
const jsonExtensions = new Set(['.json']);
const yamlExtensions = new Set(['.yaml', '.yml']);
const htmlExtensions = new Set(['.html', '.htm', '.svg']);
const binaryExtensions = new Set(['.png', '.ico']);

const exactTechnicalPhrases = [
  'AJV', 'API', 'Business Central', 'CLI', 'CSS', 'DOM', 'FFmpeg', 'FFprobe', 'Git', 'GitHub', 'HTML', 'HTTP', 'HTTPS',
  'JavaScript', 'Jira', 'JSON', 'Microsoft Dynamics 365 Business Central', 'MVP', 'Node.js', 'Node', 'npm', 'OpenSpec', 'Playwright', 'PNG',
  'ProjectContext', 'ProjectTimeContext', 'React', 'SHA', 'SourceSnapshot', 'SVG', 'TypeScript', 'UABC', 'URI', 'URL', 'Vite',
  'Vitest', 'WebM', 'YAML', 'Zod',
];

const avoidableEnglish = new Set([
  'active', 'add', 'added', 'app', 'apps', 'approval', 'approved', 'assertion', 'assertions', 'assertionwerte', 'auth', 'authoritative', 'awaiting', 'back', 'baseline',
  'billing', 'bottom', 'branch', 'branchbezeichnungen', 'build', 'caption', 'change', 'changes', 'closed', 'completed', 'configure', 'connected',
  'consultant', 'content', 'copying', 'dark', 'dedicated', 'description', 'design', 'detail', 'difficult', 'dirty', 'display',
  'desktop', 'domain', 'done', 'endpoint', 'error', 'errors', 'event', 'events', 'every', 'evidence', 'experience', 'explore', 'fail', 'fingerprint', 'fingerprints', 'frontmatter',
  'families', 'feature', 'featurezustand', 'goals', 'history', 'human', 'identifiers', 'image', 'implement', 'implemented',
  'initiate', 'invalid', 'label', 'leak', 'leakfreie', 'light', 'manifest', 'mappt', 'meetings', 'message', 'mismatch', 'missing', 'mutation', 'never', 'normalized',
  'offline', 'only', 'operate', 'pane', 'parse', 'passed', 'paths', 'planned', 'policy', 'post', 'prepare', 'project',
  'projection', 'proposal', 'proposed', 'purpose', 'put', 'query', 'read', 'ready', 'receives', 'references', 'registry', 'render', 'renderliste', 'replay', 'repository',
  'rail', 'reset', 'resetstrategie', 'root', 'runbook', 'safe', 'scope', 'secrets', 'setup', 'shell', 'sidebar', 'snapshot', 'source',
  'state', 'statistics', 'strategize', 'summary', 'system', 'task', 'tasks', 'tests', 'title', 'trace', 'traces', 'traversal',
  'truth', 'validate', 'views', 'visualize', 'without', 'worklogs', 'world', 'worktree', 'writing', 'quellroot',
]);

const englishWords = new Set([
  ...avoidableEnglish,
  'a', 'about', 'across', 'all', 'allows', 'and', 'are', 'as', 'at', 'be', 'before', 'between', 'brown', 'by', 'can',
  'brisk', 'configured', 'customer', 'data', 'dogs', 'each', 'fast', 'for', 'from', 'fox', 'generated', 'has', 'have', 'ignore', 'into', 'is', 'it', 'journey', 'jumps', 'lazy',
  'dashboard', 'load', 'loads', 'must', 'new', 'no', 'not', 'now', 'of', 'on', 'open', 'operations', 'or', 'other', 'our', 'please', 'response', 'returned',
  'output', 'portal', 'should', 'stays', 'the', 'their', 'this', 'to', 'unexpected', 'unable', 'use', 'uses', 'using', 'was', 'we', 'with',
]);

const germanWords = new Set([
  'aber', 'alle', 'als', 'an', 'auch', 'auf', 'aus', 'bei', 'beim', 'bereits', 'bis', 'bleibt', 'das', 'dass', 'dem', 'den',
  'der', 'des', 'die', 'dies', 'diese', 'dieser', 'durch', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'er', 'erst',
  'es', 'für', 'gegen', 'hat', 'hier', 'im', 'in', 'ist', 'jede', 'jeder', 'kein', 'keine', 'mit', 'muss', 'müssen', 'nach',
  'nicht', 'noch', 'nur', 'oder', 'ohne', 'sich', 'sind', 'sowie', 'und', 'unter', 'von', 'vor', 'wird', 'werden', 'zu',
  'zum', 'zur', 'über', 'ausgewählt', 'belegt', 'bereich', 'deutsch', 'deutsche', 'einlesezeit', 'eltern', 'erlaubt', 'fehlt', 'geprüft', 'navigation', 'prosa', 'provenienz', 'quelle', 'quelleninformation', 'quellenstatus', 'projekt', 'registrierungs', 'sein', 'streng', 'system', 'tablet', 'universaarl', 'unternehmens',
]);

const narrativeKeys = new Set([
  'alt', 'arialabel', 'ariadescription', 'body', 'caption', 'context', 'description', 'detail', 'details', 'displayname', 'error',
  'heading', 'help', 'hint', 'innertext', 'label', 'message', 'name', 'note', 'notes', 'objective', 'outcome', 'outertext', 'placeholder', 'problem',
  'purpose', 'rationale', 'reason', 'recommendation', 'statement', 'summary', 'text', 'textcontent', 'title', 'value', 'warning',
]);

const technicalKeys = new Set([
  '$schema', 'branch', 'checksum', 'commit', 'commitsha', 'contenttype', 'enum', 'hash', 'id', 'key', 'kind', 'method',
  'mode', 'path', 'pattern', 'projectid', 'ref', 'sha', 'status', 'type', 'uri', 'url', 'version', 'wave',
]);

function fail(message) {
  throw new Error(message.startsWith('Das Deutschgate') ? message : `Das Deutschgate: ${message}`);
}

function git(root, args, encoding = 'utf8') {
  try {
    return execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {
      encoding,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return fail('Das Deutschgate konnte den Git-Versionsstand nicht sicher lesen.');
  }
}

function gitList(root, args) {
  const output = git(root, args, 'buffer');
  const bounded = output.subarray(0, output.at(-1) === 0 ? output.length - 1 : output.length);
  return bounded.length === 0 ? [] : bounded.toString('utf8').split('\0').filter(Boolean);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function indexHash(root) {
  const indexName = git(root, ['rev-parse', '--git-path', 'index']).trim();
  const indexPath = path.isAbsolute(indexName) ? indexName : path.resolve(root, indexName);
  return sha256(fs.readFileSync(indexPath));
}

function repositorySnapshot(root) {
  return {
    head: git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim(),
    status: sha256(git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 'buffer')),
    index: indexHash(root),
  };
}

function assertUnchanged(before, after) {
  if (before.head !== after.head || before.status !== after.status || before.index !== after.index) {
    fail('Das Deutschgate hat während der Prüfung eine Änderung an HEAD, Arbeitsbaum oder Index erkannt.');
  }
}

function assertRelativeFile(relative) {
  const normalized = relative.replaceAll('\\', '/');
  if (!relative || normalized !== relative || path.posix.isAbsolute(relative) || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('Das Deutschgate hat einen unzulässigen Pfad im Versionsspeicher erkannt.');
  }
  return normalized;
}

function candidateFiles(root) {
  const tracked = gitList(root, ['ls-files', '-z']);
  const untracked = gitList(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return [...new Set([...tracked, ...untracked].map(assertRelativeFile))].filter((file) => fs.existsSync(path.resolve(root, ...file.split('/')))).sort((left, right) => left.localeCompare(right, 'de'));
}

function trackedModes(root) {
  const result = new Map();
  for (const entry of gitList(root, ['ls-files', '-s', '-z'])) {
    const match = entry.match(/^([0-9]{6}) [a-f0-9]{40} [0-3]\t([\s\S]+)$/);
    if (!match) fail('Das Deutschgate konnte einen Indexeintrag nicht eindeutig auswerten.');
    result.set(assertRelativeFile(match[2]), match[1]);
  }
  return result;
}

function assertRegularPath(root, file) {
  let cursor = root;
  for (const part of file.split('/')) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(`Die geprüfte Datei ${file} liegt an einem symbolischen Verweis.`);
  }
  const relativeBack = path.relative(root, cursor);
  if (!relativeBack || relativeBack === '..' || relativeBack.startsWith(`..${path.sep}`) || path.isAbsolute(relativeBack)) {
    fail('Das Deutschgate hat eine Pfadüberschreitung erkannt.');
  }
  const stat = fs.lstatSync(cursor);
  if (!stat.isFile()) fail(`Die geprüfte Datei ${file} ist kein regulärer Blob.`);
  if (stat.size > maxTextBytes) fail(`Die geprüfte Datei ${file} überschreitet die zulässige Größe.`);
  return { absolute: cursor, stat };
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function cleanSegmentText(text) {
  return text.replace(/\\[nrt]/g, ' ').replace(/\\(["'`])/g, '$1').replace(/\s+/g, ' ').trim();
}

function segment(file, line, text, context = 'prose') {
  return { file, line, text: cleanSegmentText(text), context };
}

function keyName(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function isNarrativeKey(value) {
  const normalized = keyName(value);
  return narrativeKeys.has(normalized) || /(?:caption|description|error|heading|help|hint|label|message|name|note|problem|purpose|rationale|reason|summary|text|title|warning)$/.test(normalized);
}

function isTechnicalKey(value) {
  return technicalKeys.has(keyName(value));
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const exactPhrasePattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${exactTechnicalPhrases.sort((a, b) => b.length - a.length).map(regexEscape).join('|')})(?![\\p{L}\\p{N}_])`, 'gu');

function stripTechnicalSpans(text) {
  return text
    .replace(/\bChange-ID\b/g, ' ')
    .replace(/(?<=Jira )Sub-task\b/g, ' ')
    .replace(/(?<=beobachtete )Root-Eltern null\b/g, ' ')
    .replace(/(?<=beobachtete )Root(?=-Eltern\b)/g, ' ')
    .replace(exactPhrasePattern, ' ')
    .replace(/https?:\/\/[^\s<>()]+/g, ' ')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\|\.{0,2}\/|\/)[^\s,;:!?"'`()\]}]+/g, ' ')
    .replace(/\b[a-f0-9]{40,64}\b/g, ' ')
    .replace(/\bUABC-[A-Z0-9-]+\b/g, ' ')
    .replace(/\b(?=[A-Z0-9_]*[_0-9])[A-Z][A-Z0-9_]{2,}\b/g, ' ')
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+\b/g, ' ')
    .replace(/\b(?:project-twin|codex\/[a-z0-9._/-]+)\b/g, ' ')
    .replace(/\bv?\d+(?:\.\d+){1,3}\b/g, ' ');
}

function wordsWithOriginal(text) {
  const expanded = stripTechnicalSpans(text.normalize('NFC'))
    .replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return [...expanded.matchAll(/[A-Za-zÄÖÜäöüß]+/g)].map((match) => ({ original: match[0], lower: match[0].toLowerCase() }));
}

function germanSignal(word) {
  if (germanWords.has(word) || /[äöüß]/.test(word)) return true;
  if (englishWords.has(word)) return false;
  return /(?:ung|ungen|heit|keiten?|lich|ische|ischer|isches|iert|ieren|bar|schaft|weise|schutz|prüfung|quelle|daten|projekt|ansicht|pfad|zustand|schritt|vertrag|grenze|verzeichnis|datei|inhalt|ergebnis|meldung|wert|belegt|umfang|explizit|zentrum|zielbild)(?:e|en|er|es|em)?$/.test(word)
    || /^[a-zäöüß]{3,}(?:e|en|er|es|em|t|te|ten|ter|tes|tem)$/.test(word);
}

function technicalForm(value, context = 'inline-code') {
  const text = value.trim();
  if (!text || /[\r\n]/.test(text)) return false;
  if (exactTechnicalPhrases.includes(text)) return true;
  if (/^(?:REVIEW\.md in HEAD: leer|Deutschgate: bestanden)$/.test(text)) return true;
  if (/^[A-Z][A-Z0-9_]*=(?:[A-Za-z0-9._/-]+|<[^>]+>)$/.test(text)) return true;
  if (/^<[-A-Za-zÄÖÜäöüß0-9_.]+>$/.test(text)) return true;
  if (/^[A-Za-z]:[\\/][^\r\n]+$/.test(text) || /^\\\\[^\r\n]+$/.test(text)) return true;
  if (/^(?:\.{0,2}\/|\/)[^\s]+$/.test(text)) return true;
  if (/^(?=[^\s]*[/.])[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.:<>{}-]*)*\/?$/.test(text)) return true;
  if (/^https?:\/\/[^\s]+$/.test(text)) return true;
  if (/^[a-f0-9]{40,64}$/.test(text) || /^UABC-[A-Z0-9-]+$/.test(text) || /^(?=[A-Z0-9_]*[_0-9])[A-Z][A-Z0-9_]{2,}$/.test(text)) return true;
  if (/^(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_./:{}?&=-]+$/.test(text)) return true;
  if (/^(?:npm|npx|node|git|pwsh|powershell|tsc|vite|vitest)(?:\s+[-A-Za-z0-9_./:=@{}]+)+$/.test(text)) return true;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(text)) return context === 'inline-code' || context === 'technical-value';
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(text)) return context === 'inline-code' || context === 'technical-value';
  if (/^v?\d+(?:\.\d+){1,3}$/.test(text)) return true;
  return false;
}

function strongTechnicalValue(value) {
  const text = value.trim();
  if (technicalForm(text, 'technical-value') && !/^[A-Za-zÄÖÜäöüß]+$/.test(text)) return true;
  if (/^[a-z-]+:\s*var\(--[a-z-]+\);?$/.test(text) || /^--[a-z-]+:\s*[-A-Za-z0-9().%]+$/.test(text)) return true;
  if (/^(?:@media\s*\([^\r\n]+\)|html\[[^\r\n]+\]|\.[a-z-]+\s*\{[^\r\n]+\})$/.test(text)) return true;
  if (/^matchMedia\(["']\([^"']+\)["']\)$/.test(text)) return true;
  const sourceCall = text.match(/^(?:if\s*\([^)]*\)\s*)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\(([^\r\n]*)\);?$/);
  if (sourceCall) {
    const quoted = [...sourceCall[1].matchAll(/(["'])(.*?)\1/g)].map((match) => match[2]);
    if (quoted.every((part) => technicalForm(part, 'technical-value'))) return true;
  }
  if (/^(?:addEventListener|removeEventListener|close|closeMore|setMore|focusMainAfterMobileMoreNavigation)\([^\r\n]*\);?$/.test(text)) return true;
  if (/^import\s+["'][./][^"']+["']$/.test(text) || /^[A-Za-z_$][A-Za-z0-9_$]*\.(?:message|name|slice)\(?$/.test(text)) return true;
  return false;
}

function languageViolation(item) {
  if (!item.text) return null;
  if (item.context === 'raw-fixture') return null;
  if ((item.context === 'inline-code' || item.context === 'technical-value') && (technicalForm(item.text, item.context) || strongTechnicalValue(item.text))) return null;
  const words = wordsWithOriginal(item.text);
  const lexical = words.filter((word) => word.lower.length > 1);
  const englishCount = lexical.filter((word) => englishWords.has(word.lower)).length;
  const germanCount = lexical.filter((word) => germanSignal(word.lower)).length;
  if (lexical.length >= 2 && germanCount === 0 && englishCount >= 2) return 'englischer Satz oder englische Überschrift';
  if (lexical.length >= 5 && englishCount >= 3 && englishCount > germanCount * 2) return 'überwiegend englischer Satz';
  return null;
}

function addFinding(findings, item, explicitReason) {
  const reason = explicitReason ?? languageViolation(item);
  if (reason) findings.push(`${item.file}:${item.line}: ${reason}`);
}

function addSegments(findings, items) {
  for (const item of items) addFinding(findings, item);
}

function validateStructuredValue(file, value, findings, inheritedNarrative = false, line = 1) {
  if (Array.isArray(value)) {
    for (const child of value) validateStructuredValue(file, child, findings, inheritedNarrative, line);
    return;
  }
  if (!value || typeof value !== 'object') {
    if (inheritedNarrative && typeof value === 'string') addFinding(findings, segment(file, line, value));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const narrative = isNarrativeKey(key);
    if (narrative && typeof child === 'string') addFinding(findings, segment(file, line, child));
    else if (!isTechnicalKey(key)) validateStructuredValue(file, child, findings, narrative || inheritedNarrative, line);
  }
}

function validateJson(file, text, findings, line = 1) {
  let value;
  try { value = JSON.parse(text); } catch { return fail(`Die JSON-Datei ${file} ist nicht gültig.`); }
  validateStructuredValue(file, value, findings, false, line);
}

function inlineHashComment(rawLine) {
  let quote = null;
  for (let index = 0; index < rawLine.length; index += 1) {
    const char = rawLine[index];
    if (quote) {
      if (char === '\\' && quote === '"') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '#' && (index === 0 || /\s/.test(rawLine[index - 1]))) return rawLine.slice(index + 1).trim();
  }
  return '';
}

function validateYaml(file, text, findings, line = 1) {
  const document = parseDocument(text, { strict: true, uniqueKeys: true });
  if (document.errors.length) fail(`Die YAML-Datei ${file} ist nicht gültig.`);
  validateStructuredValue(file, document.toJS({ maxAliasCount: 20 }), findings, false, line);
  for (const [index, rawLine] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const comment = rawLine.match(/^\s*#\s*(.+)$/)?.[1];
    if (comment) addFinding(findings, segment(file, line + index, comment));
    else {
      const inline = inlineHashComment(rawLine); if (inline) addFinding(findings, segment(file, line + index, inline));
    }
  }
}

function validateInlineCode(file, line, rawLine, findings) {
  let output = ''; let cursor = 0;
  while (cursor < rawLine.length) {
    const start = rawLine.indexOf('`', cursor);
    if (start < 0) { output += rawLine.slice(cursor); break; }
    output += rawLine.slice(cursor, start);
    let length = 1; while (rawLine[start + length] === '`') length += 1;
    const marker = '`'.repeat(length); const end = rawLine.indexOf(marker, start + length);
    if (end < 0) { addFinding(findings, segment(file, line, rawLine.slice(start)), 'nicht geschlossener Markdown-Inlinecode'); return output; }
    const content = rawLine.slice(start + length, end).trim();
    if (!technicalForm(content, 'inline-code')) addFinding(findings, segment(file, line, content), 'Markdown-Inlinecode ist keine eng formgebundene technische Angabe');
    output += ' '; cursor = end + length;
  }
  return output;
}

function stripMarkdownSyntax(line) {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*(?:#{1,6}|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .replace(/^\s*(?:ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*:*/g, '')
    .replace(/^\s*(?:Requirement|Scenario)\s*:\s*/g, '')
    .replace(/^\s*\*\*(?:GIVEN|WHEN|THEN|AND)\*\*\s*/g, '')
    .replace(/[*~]/g, ' ')
    .replace(/<!--([\s\S]*?)-->/g, '$1')
    .trim();
}

function validateShell(file, text, findings, firstLine) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let heredoc = null; let powershellHere = null; let braces = 0;
  for (const [offset, rawLine] of lines.entries()) {
    const line = firstLine + offset;
    if (heredoc) {
      if (rawLine.trim() === heredoc) heredoc = null;
      else addFinding(findings, segment(file, line, rawLine));
      continue;
    }
    if (powershellHere) {
      if (rawLine.trim() === powershellHere) powershellHere = null;
      else addFinding(findings, segment(file, line, rawLine));
      continue;
    }
    const bashStart = rawLine.match(/<<-?\s*["']?([A-Z][A-Z0-9_]*)["']?/); if (bashStart) heredoc = bashStart[1];
    if (/=\s*@["']\s*$/.test(rawLine)) powershellHere = rawLine.trim().endsWith('@"') ? '"@' : "'@";
    const comment = rawLine.match(/^\s*#(?!\!)(.*)$/)?.[1]; if (comment?.trim()) addFinding(findings, segment(file, line, comment));
    if (!comment) { const inline = inlineHashComment(rawLine); if (inline) addFinding(findings, segment(file, line, inline)); }
    const output = rawLine.match(/^\s*(?:echo|printf|Write-(?:Warning|Error|Output|Host))\b\s*(.*)$/i)?.[1];
    if (output?.trim()) {
      const value = output.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').replace(/^['"]%s\\n['"]\s+/, '');
      if (!/^\$\{?[A-Za-z_][A-Za-z0-9_]*}?$/.test(value) && !technicalForm(value, 'technical-value')) addFinding(findings, segment(file, line, value));
    }
    const code = rawLine.replace(/(['"])(?:\\.|(?!\1).)*\1/g, '');
    braces += (code.match(/[({[]/g)?.length ?? 0) - (code.match(/[)}\]]/g)?.length ?? 0);
    if ((rawLine.match(/(?<!\\)["']/g)?.length ?? 0) % 2 !== 0 && !bashStart && !powershellHere) fail(`Der Befehlsblock in ${file}:${line} enthält nicht geschlossene Anführungszeichen.`);
  }
  if (heredoc || powershellHere || braces !== 0) fail(`Der Befehlsblock in ${file} ist syntaktisch nicht geschlossen.`);
}

function rawFixtureName(name) {
  return /^(?:raw|rawFixture|rawPayload|rawSourceValue|syntheticRawFixture|rohwert|rohdaten|rohPayload|synthetischerRohwert)[A-Za-z0-9]*$/.test(name);
}

function sourceLex(file, text) {
  const tokens = []; const comments = []; const mask = [...text]; const stack = []; const pairs = new Map([[')', '('], [']', '['], ['}', '{']]);
  const blank = (start, end) => { for (let cursor = start; cursor < end; cursor += 1) if (mask[cursor] !== '\n' && mask[cursor] !== '\r') mask[cursor] = ' '; };
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] === '/' && text[cursor + 1] === '/') {
      const start = cursor; cursor += 2; while (cursor < text.length && text[cursor] !== '\n') cursor += 1;
      comments.push({ start, text: text.slice(start + 2, cursor) }); blank(start, cursor); continue;
    }
    if (text[cursor] === '/' && text[cursor + 1] === '*') {
      const start = cursor; const end = text.indexOf('*/', cursor + 2); if (end < 0) fail(`Die Quelldatei ${file} enthält einen nicht geschlossenen Kommentar.`);
      cursor = end + 2; comments.push({ start, text: text.slice(start + 2, end) }); blank(start, cursor); continue;
    }
    if (text[cursor] === '/') {
      let previous = cursor - 1; while (previous >= 0 && /\s/.test(text[previous])) previous -= 1;
      const prefix = text.slice(Math.max(0, previous - 12), previous + 1);
      if (previous < 0 || /[([{=:;,!?&|+*%^~>-]/.test(text[previous]) || /(?:return|case|throw|=>)\s*$/.test(prefix)) {
        const start = cursor; cursor += 1; let characterClass = false; let closed = false;
        while (cursor < text.length) {
          if (text[cursor] === '\\') { cursor += 2; continue; }
          if (text[cursor] === '[') characterClass = true;
          else if (text[cursor] === ']') characterClass = false;
          else if (text[cursor] === '/' && !characterClass) { cursor += 1; while (/[a-z]/i.test(text[cursor] ?? '')) cursor += 1; closed = true; break; }
          if (text[cursor] === '\n' || text[cursor] === '\r') break;
          cursor += 1;
        }
        if (!closed) fail(`Die Quelldatei ${file} enthält einen nicht geschlossenen regulären Ausdruck.`);
        blank(start, cursor); mask[start] = '0'; continue;
      }
    }
    if (text[cursor] === '"' || text[cursor] === "'" || text[cursor] === '`') {
      const quote = text[cursor]; const start = cursor; cursor += 1; let closed = false;
      while (cursor < text.length) {
        if (text[cursor] === '\\') { cursor += 2; continue; }
        if (text[cursor] === quote) { cursor += 1; closed = true; break; }
        if (quote !== '`' && (text[cursor] === '\n' || text[cursor] === '\r')) break;
        cursor += 1;
      }
      if (!closed) fail(`Die Quelldatei ${file} enthält eine nicht geschlossene Zeichenkette.`);
      const raw = text.slice(start + 1, cursor - 1);
      const value = raw.replace(/\$\{[\s\S]*?\}/g, '<wert>').replace(/\\(?:n|r|t)/g, ' ').replace(/\\([\\"'`])/g, '$1');
      tokens.push({ start, end: cursor, value }); blank(start, cursor); continue;
    }
    const char = text[cursor];
    if (char === '(' || char === '[' || char === '{') stack.push({ char, cursor });
    else if (pairs.has(char)) { const opening = stack.pop(); if (!opening || opening.char !== pairs.get(char)) fail(`Die Quelldatei ${file} enthält nicht geschachtelte Klammern.`); }
    cursor += 1;
  }
  if (stack.length) fail(`Die Quelldatei ${file} enthält nicht geschlossene Klammern.`);
  const masked = mask.join(''); const syntaxMask = [...masked]; for (const token of tokens) syntaxMask[token.start] = '0'; const syntax = syntaxMask.join('');
  if (/\b(?:const|let|var)\s+=/.test(syntax)
    || /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*;/.test(syntax)
    || /\bfunction\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(\s*,/.test(syntax)
    || /=>\s*[;}]/.test(syntax)) fail(`Die Quelldatei ${file} enthält nicht auswertbare Deklarationssyntax.`);
  return { tokens, comments, masked };
}

function validateSource(file, text, findings, firstLine = 1) {
  const { tokens, comments, masked } = sourceLex(file, text); const rawFixtures = new Map(); const seen = new Set(); const testFile = /(?:^|\/)tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
  const add = (token, context = 'prose') => {
    const line = firstLine + lineAt(text, token.start) - 1; const key = `${line}\0${token.value}\0${context}`;
    if (!seen.has(key)) { seen.add(key); addFinding(findings, segment(file, line, token.value, context)); }
  };
  for (const comment of comments) {
    const content = comment.text.trim();
    if (content && !/^\/\s*<reference\s+(?:types|path)=["'][^"']+["']\s*\/>$/.test(content)) addFinding(findings, segment(file, firstLine + lineAt(text, comment.start) - 1, content));
  }
  for (const [index, token] of tokens.entries()) {
    const prefix = masked.slice(Math.max(0, token.start - 600), token.start); const fullPrefix = masked.slice(0, token.start); const suffix = masked.slice(token.end, token.end + 200); const previous = tokens[index - 1];
    const declarations = [...fullPrefix.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=|\bof\b)/g)];
    const declaration = declarations.at(-1); const afterDeclaration = declaration ? fullPrefix.slice((declaration.index ?? 0) + declaration[0].length) : '';
    const inRawFixture = Boolean(declaration && rawFixtureName(declaration[1]) && !afterDeclaration.includes(';'));
    if (declaration && rawFixtureName(declaration[1]) && /^\s*$/.test(afterDeclaration)) rawFixtures.set(declaration[1], token.value);
    if (inRawFixture) continue;
    let context = 'prose'; let human = false; let rawTestFixture = false;
    if (/\b(?:describe|it|test)(?:\.(?:each|skip|only|todo))?\s*\(\s*$/.test(prefix)) human = true;
    if (/(?:new\s+(?:[A-Za-z_$]*Error|Message|DOMException)|\b(?:fail|sourceError|warn|warning|message)|(?:warnings|errors|messages)\.push|console\.(?:warn|error)|process\.stderr\.write)\s*\(\s*$/.test(prefix)) {
      human = true;
      if (testFile && /(?:mockRejectedValue|[A-Za-z_$][A-Za-z0-9_$]*\.reject)\s*\(\s*new\s+(?:[A-Za-z_$]*Error|Message|DOMException)\s*\(\s*$/.test(prefix)) rawTestFixture = true;
    }
    if (/\bexpect(?:\.soft)?\s*\([^;()]{0,400},\s*$/.test(prefix)
      || /\bassert(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?\s*\([^;]{0,500},\s*$/.test(prefix)) human = true;
    if (/\.(?:toBe|toEqual|toContain|toMatch|toThrow|toThrowError|includes|equal|strictEqual)\s*\(\s*$/.test(prefix)) {
      human = true;
      if (testFile && /expect\s*\(\s*fs\.readFileSync\s*\([\s\S]*\)\s*\)\.(?:toBe|toEqual)\s*\(\s*$/.test(prefix)) context = 'raw-fixture';
      else if (/\.not\.(?:toContain|toMatch|toThrow|toThrowError)\s*\(\s*$/.test(prefix)) context = 'raw-fixture';
      else if (/expect[\s\S]*\.(?:id|key|kind|type|status|mode|method|path|url|uri|sha|commit|branch|version)\b[\s\S]*\.(?:toBe|toEqual|toContain|toMatch)\s*\(\s*$/.test(prefix)
        || strongTechnicalValue(token.value)) context = 'technical-value';
    }
    if (/(?:aria-label|aria-description|alt|title|placeholder|value)\s*=\s*{?\s*$/.test(prefix)) {
      human = true; if (/<option\b[^>]*\bvalue\s*=\s*$/.test(prefix)) context = 'technical-value';
    }
    if (/(?:\.|\b)(?:title|description|detail|details|label|name|summary|message|caption|purpose|problem|rationale|text|textContent|innerText|outerText|value|warning|error)\s*(?::|=)\s*$/.test(prefix)) {
      human = true;
      if (/this\.name\s*=\s*$/.test(prefix) || (/\bname\s*:\s*$/.test(prefix) && strongTechnicalValue(token.value))) context = 'technical-value';
      if (testFile && /(?:uiErrorCodeFromBody|uiErrorMessage)\s*\([\s\S]*\{[\s\S]*(?:error|message)\s*:\s*$/.test(prefix)) rawTestFixture = true;
    }
    if (/\b(?:const|let|var)\s+(?:title|description|detail|details|label|name|summary|message|caption|purpose|problem|rationale|text|textContent|innerText|outerText|value|warning|error)\s*=\s*$/.test(prefix)) human = true;
    if (previous && /^(?:aria-label|aria-description|alt|title|placeholder|value)$/.test(previous.value)
      && /^\s*,\s*$/.test(masked.slice(previous.end, token.start))
      && /\.setAttribute\s*\(\s*$/.test(masked.slice(Math.max(0, previous.start - 200), previous.start))) human = true;
    if (/[>]\s*\{\s*$/.test(prefix) && /^\s*}\s*<\//.test(suffix)) human = true;
    if (previous && isNarrativeKey(previous.value) && /^\s*:\s*$/.test(masked.slice(previous.end, token.start))) human = true;
    if (human && !rawTestFixture) add(token, context);
  }
  for (const [name, value] of rawFixtures) {
    const sink = new RegExp(`(?:new\\s+(?:[A-Za-z_$]*Error|Message|DOMException)|\\b(?:fail|sourceError|warn|warning|message)|(?:warnings|errors|messages)\\.push|console\\.(?:warn|error)|process\\.stderr\\.write)\\s*\\(\\s*${regexEscape(name)}\\b`);
    if (sink.test(masked)) addFinding(findings, segment(file, firstLine, value));
  }
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
    for (const match of masked.matchAll(/>([^<>{}\r\n]*[A-Za-zÄÖÜäöüß][^<>{}\r\n]*)</g)) {
      if (!/[;=()]/.test(match[1])) addFinding(findings, segment(file, firstLine + lineAt(masked, match.index ?? 0) - 1, match[1]));
    }
  }
}

function validateCss(file, text, findings, firstLine = 1) {
  let braces = 0; let quote = null; let comment = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (comment) { if (char === '*' && next === '/') { comment = false; index += 1; } continue; }
    if (quote) { if (char === '\\') index += 1; else if (char === quote) quote = null; continue; }
    if (char === '/' && next === '*') { comment = true; index += 1; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') braces += 1;
    else if (char === '}') braces -= 1;
    if (braces < 0) fail(`Die CSS-Datei ${file} enthält nicht auswertbare Syntax.`);
  }
  if (comment || quote || braces !== 0) fail(`Die CSS-Datei ${file} ist syntaktisch nicht geschlossen.`);
  for (const match of text.matchAll(/\/\*([\s\S]*?)\*\//g)) addFinding(findings, segment(file, firstLine + lineAt(text, match.index ?? 0) - 1, match[1]));
  for (const match of text.matchAll(/\bcontent\s*:\s*(["'])([\s\S]*?)\1/g)) if (match[2].trim()) addFinding(findings, segment(file, firstLine + lineAt(text, match.index ?? 0) - 1, match[2]));
}

function validateHtml(file, text, findings, firstLine = 1) {
  const blockPattern = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let masked = text;
  for (const match of text.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase(); const attributes = match[2]; const body = match[3]; const line = firstLine + lineAt(text, match.index ?? 0) - 1;
    if (tag === 'style') validateCss(file, body, findings, line);
    else if (/\btype\s*=\s*["']application\/json["']/i.test(attributes)) validateJson(file, body, findings, line);
    else if (body.trim()) validateSource(`${file}.js`, body, findings, line);
    masked = masked.replace(match[0], ' '.repeat(match[0].length));
  }
  for (const match of masked.matchAll(/<!--([\s\S]*?)-->/g)) addFinding(findings, segment(file, firstLine + lineAt(masked, match.index ?? 0) - 1, match[1]));
  if ((masked.match(/<!--/g)?.length ?? 0) !== (masked.match(/-->/g)?.length ?? 0)) fail(`Die HTML-Datei ${file} enthält einen nicht geschlossenen Kommentar.`);
  for (const match of masked.matchAll(/\b(?:aria-label|aria-description|alt|title|placeholder|value)\s*=\s*(["'])([\s\S]*?)\1/gi)) addFinding(findings, segment(file, firstLine + lineAt(masked, match.index ?? 0) - 1, match[2]));
  const rendered = [...masked]; const tags = [];
  for (let cursor = 0; cursor < masked.length; cursor += 1) {
    if (masked[cursor] !== '<') continue;
    const start = cursor; let quote = null; let closed = false;
    for (cursor += 1; cursor < masked.length; cursor += 1) {
      const char = masked[cursor];
      if (quote) { if (char === quote) quote = null; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '>') { closed = true; break; }
    }
    if (!closed || quote) fail(`Die HTML-Datei ${file} enthält ein nicht geschlossenes Element.`);
    tags.push(masked.slice(start, cursor + 1));
    for (let index = start; index <= cursor; index += 1) if (rendered[index] !== '\n' && rendered[index] !== '\r') rendered[index] = ' ';
  }
  const visible = rendered.join('').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, ' ');
  for (const [offset, line] of visible.split(/\r?\n/).entries()) if (line.trim()) addFinding(findings, segment(file, firstLine + offset, line));
  const opens = []; const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const full of tags) {
    const match = full.match(/^<\/?([A-Za-z][A-Za-z0-9:-]*)\b/); if (!match) continue;
    const name = match[1].toLowerCase();
    if (full.startsWith('</')) { if (opens.pop() !== name) fail(`Die HTML-Datei ${file} enthält nicht geschachtelte Elemente.`); }
    else if (!full.endsWith('/>') && !voidTags.has(name) && !full.startsWith('<!')) opens.push(name);
  }
  if (opens.length) fail(`Die HTML-Datei ${file} enthält nicht geschlossene Elemente.`);
}

function validateFence(file, language, body, findings, firstLine) {
  const normalized = language.toLowerCase();
  if (sourceExtensions.has(`.${normalized}`) || ['javascript', 'typescript'].includes(normalized)) return validateSource(`${file}.${normalized || 'ts'}`, body, findings, firstLine);
  if (['sh', 'bash', 'shell', 'powershell', 'ps1'].includes(normalized)) return validateShell(file, body, findings, firstLine);
  if (normalized === 'json') return validateJson(file, body, findings, firstLine);
  if (normalized === 'yaml' || normalized === 'yml') return validateYaml(file, body, findings, firstLine);
  if (normalized === 'html' || normalized === 'svg') return validateHtml(file, body, findings, firstLine);
  if (normalized === 'css') return validateCss(file, body, findings, firstLine);
  if (normalized && !['text', 'plain', 'console'].includes(normalized)) fail(`Der Markdown-Codeblock in ${file}:${firstLine} verwendet eine nicht positivgelistete Sprache.`);
  for (const [offset, line] of body.split('\n').entries()) {
    if (!line.trim() || technicalForm(line.trim(), 'technical-value')) continue;
    addFinding(findings, segment(file, firstLine + offset, line));
  }
}

function validateMarkdown(file, text, findings) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); let index = 0; let lastHeading = '';
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, candidate) => candidate > 0 && line.trim() === '---');
    if (end < 0) fail(`Die Markdown-Datei ${file} enthält einen nicht geschlossenen Kopfblock.`);
    validateYaml(file, lines.slice(1, end).join('\n'), findings, 2); index = end + 1;
  }
  while (index < lines.length) {
    const opening = lines[index].match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (opening) {
      const marker = opening[1]; const language = opening[2]; let end = index + 1;
      while (end < lines.length && !new RegExp(`^\\s*${regexEscape(marker[0])}{${marker.length},}\\s*$`).test(lines[end])) end += 1;
      if (end >= lines.length) fail(`Die Markdown-Datei ${file}:${index + 1} enthält einen nicht geschlossenen Codeblock.`);
      validateFence(file, language, lines.slice(index + 1, end).join('\n'), findings, index + 2); index = end + 1; continue;
    }
    const withoutCode = validateInlineCode(file, index + 1, lines[index], findings);
    const cleaned = stripMarkdownSyntax(withoutCode);
    if (/^\s*#{1,6}\s+/.test(withoutCode)) { lastHeading = cleaned; if (cleaned) addFinding(findings, segment(file, index + 1, cleaned)); }
    else if (cleaned && !(lastHeading === 'Status' && technicalForm(cleaned, 'technical-value'))) addFinding(findings, segment(file, index + 1, cleaned));
    index += 1;
  }
}

function validateEnv(file, text, findings) {
  for (const [offset, rawLine] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    if (!rawLine.trim()) continue;
    const comment = rawLine.match(/^\s*#\s*(.*)$/)?.[1]; if (comment !== undefined) { if (comment.trim()) addFinding(findings, segment(file, offset + 1, comment)); continue; }
    const assignment = rawLine.match(/^\s*[A-Z][A-Z0-9_]*=(.*)$/); if (!assignment) fail(`Die Umgebungsbeispieldatei ${file}:${offset + 1} ist nicht formgültig.`);
    const value = assignment[1].trim(); if (value && !technicalForm(value, 'technical-value')) addFinding(findings, segment(file, offset + 1, value));
  }
}

function validateGitignore(file, text, findings) {
  for (const [offset, line] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const comment = line.match(/^\s*#\s*(.*)$/)?.[1]; if (comment?.trim()) addFinding(findings, segment(file, offset + 1, comment));
  }
}

function validateBinary(file, bytes) {
  if (file.endsWith('.png')) {
    const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 20 || !bytes.subarray(0, 8).equals(magic) || !bytes.includes(Buffer.from('IHDR')) || !bytes.includes(Buffer.from('IEND'))) fail(`Die PNG-Datei ${file} ist kein eng validierter PNG-Blob.`);
    return;
  }
  if (bytes.length < 6 || !bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) || bytes.readUInt16LE(4) < 1) fail(`Die ICO-Datei ${file} ist kein eng validierter ICO-Blob.`);
}

function validateTextFile(file, bytes, findings) {
  if (bytes.includes(0)) fail(`Die geprüfte Textdatei ${file} enthält Nullbytes.`);
  const text = bytes.toString('utf8');
  if (text.includes('\uFFFD') || Buffer.byteLength(text, 'utf8') !== bytes.length) fail(`Die geprüfte Datei ${file} ist nicht gültig UTF-8-kodiert.`);
  const base = path.posix.basename(file); const extension = path.posix.extname(file).toLowerCase();
  if (file === generatedLockfile) { try { JSON.parse(text); } catch { fail('Die Sperrdatei package-lock.json ist nicht gültig.'); } return; }
  if (base.startsWith('.env')) return validateEnv(file, text, findings);
  if (base === '.gitignore') return validateGitignore(file, text, findings);
  if (markdownExtensions.has(extension)) return validateMarkdown(file, text, findings);
  if (jsonExtensions.has(extension)) return validateJson(file, text, findings);
  if (yamlExtensions.has(extension)) return validateYaml(file, text, findings);
  if (htmlExtensions.has(extension)) return validateHtml(file, text, findings);
  if (sourceExtensions.has(extension)) return validateSource(file, text, findings);
  if (extension === '.css') return validateCss(file, text, findings);
  fail(`Die Datei ${file} besitzt kein positivgelistetes prüfbares Format.`);
}

function validateRepository(root) {
  const findings = []; const modes = trackedModes(root);
  for (const file of candidateFiles(root)) {
    const mode = modes.get(file); if (mode && mode !== '100644' && mode !== '100755') fail(`Die geprüfte Datei ${file} besitzt den unzulässigen Git-Modus ${mode}.`);
    const { absolute } = assertRegularPath(root, file); const bytes = fs.readFileSync(absolute); const extension = path.posix.extname(file).toLowerCase();
    if (binaryExtensions.has(extension)) validateBinary(file, bytes); else validateTextFile(file, bytes, findings);
  }
  if (findings.length) fail(`Das Deutschgate hat menschliche Eigeninhalte außerhalb des deutschen Vertrags gefunden:\n- ${findings.slice(0, 100).join('\n- ')}`);
}

function resolveIdentity(root, snapshot) {
  const top = fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (top !== root) fail('Das Deutschgate muss am exakten Wurzelpfad des Versionsspeichers laufen.');
  const commit = snapshot.head;
  if (!/^[a-f0-9]{40}$/.test(commit)) fail('Das Deutschgate benötigt eine vollständige kleingeschriebene Commit-SHA.');
  const configuredProject = process.env.UNIVERSAARL_PROJECT_ID; const configuredCommit = process.env.UNIVERSAARL_EXPECTED_COMMIT;
  if ((configuredProject === undefined) !== (configuredCommit === undefined)) fail('Projektkennung und erwartete Commit-SHA müssen gemeinsam gesetzt werden.');
  const effectiveProject = configuredProject ?? projectId; const effectiveCommit = configuredCommit ?? commit;
  if (effectiveProject !== projectId) fail('Die Projektkennung des Deutschgates ist nicht exakt project-twin.');
  if (!/^[a-f0-9]{40}$/.test(effectiveCommit) || effectiveCommit !== commit) fail('Die erwartete Commit-SHA stimmt nicht exakt mit HEAD überein.');
  return commit;
}

function main() {
  const root = fs.realpathSync(process.cwd()); const before = repositorySnapshot(root); const commit = resolveIdentity(root, before);
  validateRepository(root); const after = repositorySnapshot(root); assertUnchanged(before, after);
  process.stdout.write(JSON.stringify({ schemaVersion: 1, status: 'passed', language: 'de', projectId, commit, userVisibleOwnContentGerman: true }));
}

try { main(); } catch (error) {
  process.stderr.write(error instanceof Error ? error.message : 'Das Deutschgate ist ohne verwertbaren Fehler abgebrochen.');
  process.exitCode = 1;
}
