import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const safeId = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/;
const safeRouteId = /^[a-z][a-z0-9-]{1,47}$/;
const safeRelative = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function defaultConfigPath(environment = process.env, home = os.homedir(), platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const base = environment.XDG_CONFIG_HOME || pathApi.join(home, '.config');
  return pathApi.join(base, 'universaarl-twin', 'config.json');
}
export function npmExecutable(platform = process.platform) { return platform === 'win32' ? 'npm.cmd' : 'npm'; }
export function browserCommand(url, platform = process.platform) { if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] }; if (platform === 'darwin') return { command: 'open', args: [url] }; return { command: 'xdg-open', args: [url] }; }

export function parseArguments(argv) {
  const action = (argv[0] ?? 'start').toLowerCase();
  const options = { action, config: '', catalogId: '', catalogType: '', catalogAddress: '', customerId: '', projectId: '', displayName: '', port: 4173, timeoutSeconds: 60, openBrowser: false };
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]; if (value === '--open') { options.openBrowser = true; continue; }
    const next = argv[index + 1]; if (!next) throw new Error(`Für ${value} fehlt ein Wert.`);
    if (value === '--config') options.config = next; else if (value === '--catalog-id') options.catalogId = next; else if (value === '--catalog-type') options.catalogType = next; else if (value === '--catalog-address') options.catalogAddress = next; else if (value === '--customer-id') options.customerId = next; else if (value === '--project-id') options.projectId = next; else if (value === '--display-name') options.displayName = next; else if (value === '--port') options.port = Number(next); else if (value === '--timeout') options.timeoutSeconds = Number(next); else throw new Error(`Unbekannter Parameter: ${value}`); index += 1;
  }
  if (!['bootstrap', 'doctor', 'configure', 'start', 'status', 'stop'].includes(options.action)) throw new Error(`Unbekannte Aktion: ${options.action}`);
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Der Port muss zwischen 1 und 65535 liegen.');
  if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 5 || options.timeoutSeconds > 300) throw new Error('Das Zeitlimit muss zwischen 5 und 300 Sekunden liegen.'); return options;
}

function runtimePaths(port) { const root = path.join(projectRoot, '.runtime', `twin-local-${port}`); return { root, metadata: path.join(root, 'process.json'), stdout: path.join(root, 'stdout.log'), stderr: path.join(root, 'stderr.log') }; }
async function health(port) { try { const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2_000) }); if (response.status !== 200 || response.headers.get('x-universaarl-service') !== 'project-twin') return null; const body = await response.json(); return body?.application === 'project-twin' && body?.status === 'bereit' ? body : null; } catch { return null; } }
function portOccupied(port) { return new Promise((resolve) => { const socket = net.createConnection({ host: '127.0.0.1', port }); const finish = (value) => { socket.destroy(); resolve(value); }; socket.setTimeout(500, () => finish(false)); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); }); }
function readMetadata(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function processExists(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function waitFor(check, timeoutSeconds) { const deadline = Date.now() + timeoutSeconds * 1_000; while (Date.now() < deadline) { const value = await check(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 250)); } return null; }
async function terminateOwned(pid, port) { try { process.kill(pid, 'SIGTERM'); } catch { return; } await waitFor(async () => !(await portOccupied(port)), 10); if (processExists(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* Bereits beendet. */ } } }
function spawnCommand(command, args, options) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], options);
  return spawnSync(command, args, options);
}
function run(command, args, cwd = projectRoot) { return spawnCommand(command, args, { cwd, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }); }
function assertCommand(command, args, label) { const result = run(command, args); if (result.status !== 0) throw new Error(`${label} ist nicht verfügbar oder nicht ausführbar.`); return result.stdout.trim(); }
function digest(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function parseJson(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Der Snapshot-Katalog enthält ungültiges JSON.'); } }
function checkedRelative(value) { if (typeof value !== 'string' || !safeRelative.test(value) || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Der Snapshot-Katalog enthält einen unsicheren relativen Pfad.'); return value; }

export function validateConfiguration(value) {
  if (!value || value.schemaVersion !== 1 || !safeRouteId.test(value.activeCatalogId) || !Array.isArray(value.catalogs) || value.catalogs.length < 1) throw new Error('Die lokale Katalogkonfiguration ist ungültig.'); const ids = new Set();
  for (const entry of value.catalogs) { if (!entry || !safeRouteId.test(entry.id) || ids.has(entry.id) || !['filesystem', 'https'].includes(entry.type) || typeof entry.address !== 'string' || !entry.address || !safeId.test(entry.expectedCustomerId) || !safeId.test(entry.expectedProjectId)) throw new Error('Das Katalogregister ist ungültig.'); if (entry.type === 'https') { const url = new URL(entry.address); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Die Katalogadresse muss HTTPS ohne Zugangsdaten verwenden.'); } ids.add(entry.id); }
  if (!ids.has(value.activeCatalogId)) throw new Error('Der aktive Katalog fehlt im Register.'); return value;
}
function configurationPath(options) { return path.resolve(options.config || defaultConfigPath()); }
function readConfiguration(options) { const file = configurationPath(options); if (!fs.existsSync(file)) throw new Error(`Die lokale Konfiguration fehlt: ${file}`); return validateConfiguration(parseJson(fs.readFileSync(file))); }
function overrideConfiguration(configuration, options) { const values = [options.catalogType, options.catalogAddress, options.customerId, options.projectId]; if (values.every((value) => !value)) return configuration; if (values.some((value) => !value)) throw new Error('Für eine CLI-Überschreibung müssen Typ, Adresse, Kunden-ID und Projekt-ID gemeinsam angegeben werden.'); const id = options.catalogId || configuration.activeCatalogId; const entry = { id, type: options.catalogType, address: options.catalogAddress, expectedCustomerId: options.customerId, expectedProjectId: options.projectId, ...(options.displayName ? { displayName: options.displayName } : {}) }; return validateConfiguration({ schemaVersion: 1, activeCatalogId: id, catalogs: [...configuration.catalogs.filter((item) => item.id !== id), entry] }); }

async function readCatalogBytes(entry, relative) {
  const safe = checkedRelative(relative);
  if (entry.type === 'https') { const base = new URL(entry.address.endsWith('/') ? entry.address : `${entry.address}/`); const target = new URL(safe, base); if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) throw new Error('Die Katalogadresse verlässt die konfigurierte Quelle.'); const response = await fetch(target, { redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error('Der HTTPS-Katalog ist nicht vollständig erreichbar.'); return Buffer.from(await response.arrayBuffer()); }
  const root = path.resolve(entry.address); if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Der lokale Snapshot-Katalog ist nicht erreichbar.'); const realRoot = fs.realpathSync(root); let target = realRoot;
  for (const segment of safe.split('/')) { target = path.join(target, segment); const stat = fs.lstatSync(target); if (stat.isSymbolicLink()) throw new Error('Symbolische Verknüpfungen sind im Snapshot-Katalog nicht erlaubt.'); }
  const resolved = path.resolve(target); if (resolved !== realRoot && !resolved.startsWith(`${realRoot}${path.sep}`)) throw new Error('Der Katalogpfad verlässt die konfigurierte Quelle.'); return fs.readFileSync(resolved);
}
export async function inspectCatalog(entry) {
  const pointerPath = 'exports/project-data/v1/snapshots/current.json';
  const currentBytes = await readCatalogBytes(entry, pointerPath);
  const current = parseJson(currentBytes);
  if (current.schemaVersion !== 1 || current.pointerContract !== 'uabc-portable-snapshot-current-v1' || current.customerId !== entry.expectedCustomerId || current.projectId !== entry.expectedProjectId || !safeId.test(current.currentReleaseId) || current.bindingStatus !== 'BOUND_BCPROJECTOS_RELEASE' || current.consumerEligible !== true || current.publishEligible !== true) throw new Error('Der Katalogzeiger stimmt nicht mit Kunde, Projekt und Freigabestatus überein.');
  const releaseRoot = `exports/project-data/v1/snapshots/releases/${current.currentReleaseId}`;
  if (current.manifestPath !== `${releaseRoot}/manifest.json` || !/^[a-f0-9]{64}$/.test(current.manifestSha256)) throw new Error('Der Katalogzeiger bindet kein sicheres unveränderliches Release.');
  const manifestBytes = await readCatalogBytes(entry, current.manifestPath);
  if (digest(manifestBytes) !== `sha256:${current.manifestSha256}`) throw new Error('Der Manifest-Digest stimmt nicht.');
  const manifest = parseJson(manifestBytes);
  if (manifest.schemaVersion !== 1 || manifest.manifestContract !== 'uabc-portable-snapshot-release-v1' || manifest.releaseId !== current.currentReleaseId || manifest.immutable !== true || manifest.validationStatus !== 'validated-release' || manifest.producer?.customerId !== current.customerId || manifest.producer?.projectIds?.length !== 1 || manifest.producer.projectIds[0] !== current.projectId || manifest.releaseBinding?.bindingStatus !== 'BOUND_BCPROJECTOS_RELEASE' || manifest.releaseBinding?.consumerEligible !== true || manifest.releaseBinding?.publishEligible !== true || manifest.releaseBinding?.spectraReleaseBinding?.installableBlueprint !== true || manifest.releaseBinding?.spectraReleaseBinding?.platformEvidenceStatus !== 'passed') throw new Error('Das unveränderliche Release-Manifest ist nicht verbraucherfähig.');
  if (!Array.isArray(manifest.files) || !Number.isInteger(manifest.projectData?.artifactCount) || manifest.files.filter((item) => item.kind === 'project-index').length !== 1 || manifest.files.filter((item) => item.kind === 'project-source').length !== manifest.projectData.artifactCount || manifest.files.filter((item) => item.kind === 'knowledge-payload').length !== 1 || manifest.files.filter((item) => item.kind === 'catalog-fragment').length !== 1) throw new Error('Projektindex und Projektquellen sind im Release nicht vollständig.');
  const ids = new Set(); const paths = new Set(); let totalBytes = 0;
  for (const file of manifest.files) {
    checkedRelative(file.path);
    if (!safeId.test(file.id) || ids.has(file.id) || paths.has(file.path) || !Number.isInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > 50 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(file.sha256) || !Array.isArray(file.transports) || file.transports.length !== 2) throw new Error('Eine Release-Dateibindung ist ungültig.');
    const transports = new Map(file.transports.map((transport) => [transport.type, transport]));
    if (transports.size !== 2 || !transports.has('filesystem') || !transports.has('https') || [...transports.values()].some((transport) => transport.relativePath !== file.path || transport.sha256 !== file.sha256)) throw new Error('Die Transportbindung einer Release-Datei ist widersprüchlich.');
    ids.add(file.id); paths.add(file.path); totalBytes += file.sizeBytes;
    const bytes = await readCatalogBytes(entry, file.path);
    if (bytes.length !== file.sizeBytes || digest(bytes) !== `sha256:${file.sha256}`) throw new Error('Ein Release-Dateidigest stimmt nicht.');
  }
  if (totalBytes > 64 * 1024 * 1024) throw new Error('Der Snapshot-Katalog überschreitet die zulässige Gesamtgröße.');
  if (digest(await readCatalogBytes(entry, pointerPath)) !== digest(currentBytes)) throw new Error('Der Katalogzeiger hat sich während der Prüfung geändert.');
  return { releaseId: current.currentReleaseId, payloadCount: manifest.files.length };
}

export async function doctorConfiguration(options) { if (!fs.existsSync(path.join(projectRoot, 'package-lock.json'))) throw new Error('package-lock.json fehlt; ein deterministischer Bootstrap ist nicht möglich.'); const configuration = overrideConfiguration(readConfiguration(options), options); for (const entry of configuration.catalogs) await inspectCatalog(entry); return configuration; }
async function doctor(options) { const [major, minor] = process.versions.node.split('.').map(Number); if ((major === 20 && minor < 19) || (major === 22 && minor < 12) || major < 20 || major === 21) throw new Error('Project Twin benötigt Node.js 20.19 oder 22.12 und neuer.'); assertCommand(npmExecutable(), ['--version'], 'npm'); const configuration = await doctorConfiguration(options); process.stdout.write(`Doctor bestanden: Node ${process.versions.node}, npm und ${configuration.catalogs.length} Snapshot-Katalog(e) validiert.\n`); return configuration; }
async function configure(options) { if (!options.catalogType || !options.catalogAddress || !options.customerId || !options.projectId) throw new Error('configure benötigt --catalog-type, --catalog-address, --customer-id und --project-id.'); const id = options.catalogId || options.projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-'); const existing = fs.existsSync(configurationPath(options)) ? readConfiguration(options) : { schemaVersion: 1, activeCatalogId: id, catalogs: [] }; const configuration = overrideConfiguration({ ...existing, activeCatalogId: id }, { ...options, catalogId: id }); const file = configurationPath(options); fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(configuration, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temporary, file); process.stdout.write(`Konfiguration gespeichert: ${file}\n`); }
async function bootstrap(options) { const result = spawnCommand(npmExecutable(), ['ci'], { cwd: projectRoot, stdio: 'inherit', windowsHide: true }); if (result.status !== 0) throw new Error('npm ci ist fehlgeschlagen.'); const configured = fs.existsSync(configurationPath(options)) || [options.catalogType, options.catalogAddress, options.customerId, options.projectId].every(Boolean); if (configured) await doctor(options); else process.stdout.write('Bootstrap abgeschlossen. Bitte als Nächstes den Snapshot-Katalog mit twin:configure einrichten.\n'); }
function openBrowser(url) { const target = browserCommand(url); const child = spawn(target.command, target.args, { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); }
async function start(options) { const url = `http://127.0.0.1:${options.port}/`; if (await health(options.port)) { process.stdout.write(`Project Twin ist bereits bereit: ${url}\n`); if (options.openBrowser) openBrowser(url); return; } if (await portOccupied(options.port)) throw Object.assign(new Error(`Port ${options.port} ist durch einen fremden oder ungesunden Dienst belegt. Es wurde nichts gestartet oder beendet.`), { exitCode: 2 }); const configuration = await doctor(options); const files = runtimePaths(options.port); fs.mkdirSync(files.root, { recursive: true }); fs.rmSync(files.metadata, { force: true }); const instanceId = randomUUID().replaceAll('-', ''); const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'); if (!fs.existsSync(viteCli)) throw new Error('Vite ist nicht installiert. Bitte zuerst npm run twin:bootstrap ausführen.'); const output = fs.openSync(files.stdout, 'a'); const errors = fs.openSync(files.stderr, 'a'); const env = { ...process.env, UNIVERSAARL_TWIN_CONFIG_JSON: JSON.stringify(configuration), UABC_TWIN_INSTANCE_ID: instanceId }; delete env.UABC_INTEGRATION_COMMIT; delete env.UABC_INTEGRATION_TREE; delete env.UABC_PRESENTATION_FIXTURE_VARIANT; const child = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(options.port), '--strictPort'], { cwd: projectRoot, env, detached: true, stdio: ['ignore', output, errors], windowsHide: true }); fs.closeSync(output); fs.closeSync(errors); child.unref(); const metadata = { schemaVersion: 1, pid: child.pid, instanceId, port: options.port, startedAt: new Date().toISOString() }; const temporary = `${files.metadata}.tmp`; fs.writeFileSync(temporary, JSON.stringify(metadata, null, 2), 'utf8'); fs.renameSync(temporary, files.metadata); const ready = await waitFor(async () => { const current = await health(options.port); return current?.instanceId === instanceId && current?.pid === child.pid ? current : null; }, options.timeoutSeconds); if (!ready) { await terminateOwned(child.pid, options.port); fs.rmSync(files.metadata, { force: true }); throw new Error(`Project Twin wurde innerhalb von ${options.timeoutSeconds} Sekunden nicht gesund. Die Protokolle liegen unter .runtime/.`); } process.stdout.write(`Project Twin ist bereit: ${url}\n`); if (options.openBrowser) openBrowser(url); }
async function status(options) { const ready = await health(options.port); if (ready) { process.stdout.write(`Project Twin ist bereit: http://127.0.0.1:${options.port}/\n`); return; } if (await portOccupied(options.port)) throw Object.assign(new Error(`Port ${options.port} ist belegt, antwortet aber nicht als gesunder Project Twin.`), { exitCode: 2 }); throw new Error('Project Twin läuft derzeit nicht.'); }
async function stop(options) { const files = runtimePaths(options.port); const metadata = readMetadata(files.metadata); if (!metadata || !Number.isInteger(metadata.pid) || typeof metadata.instanceId !== 'string' || metadata.port !== options.port) throw new Error('Es ist kein vom plattformneutralen Starter erzeugter Twin-Prozess registriert. Es wurde nichts beendet.'); const ready = await health(options.port); if (!ready || ready.instanceId !== metadata.instanceId || ready.pid !== metadata.pid || !processExists(metadata.pid)) throw new Error('Der gespeicherte Prozess gehört nicht nachweislich zu diesem Twin-Starter. Es wurde nichts beendet.'); await terminateOwned(metadata.pid, options.port); fs.rmSync(files.metadata, { force: true }); process.stdout.write(`Project Twin auf Port ${options.port} wurde beendet.\n`); }
export async function main(argv = process.argv.slice(2)) { const options = parseArguments(argv); if (options.action === 'bootstrap') return bootstrap(options); if (options.action === 'doctor') return doctor(options); if (options.action === 'configure') return configure(options); if (options.action === 'start') return start(options); if (options.action === 'status') return status(options); return stop(options); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Der lokale Twin-Befehl ist fehlgeschlagen.'}\n`); process.exitCode = Number(error?.exitCode) || 1; });
