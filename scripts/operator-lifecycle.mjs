import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const safeId = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/;
const safeRouteId = /^[a-z][a-z0-9-]{1,47}$/;
const semver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const sha256 = /^[a-f0-9]{64}$/;
function exactKeys(value, allowed) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key)); }

function defaultConfigPath(environment = process.env, home = os.homedir(), platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const base = environment.XDG_CONFIG_HOME || pathApi.join(home, '.config');
  return pathApi.join(base, 'universaarl-twin', 'config.json');
}
function validateConfiguration(value) {
  if (!exactKeys(value, new Set(['schemaVersion', 'activeCatalogId', 'catalogs'])) || value.schemaVersion !== 1 || !safeRouteId.test(value.activeCatalogId) || !Array.isArray(value.catalogs) || value.catalogs.length < 1) throw new Error('Die lokale Katalogkonfiguration ist ungültig.');
  const ids = new Set();
  for (const entry of value.catalogs) {
    if (!exactKeys(entry, new Set(['id', 'type', 'address', 'expectedCustomerId', 'expectedProjectId', 'displayName'])) || !safeRouteId.test(entry.id) || ids.has(entry.id) || !['filesystem', 'https'].includes(entry.type) || typeof entry.address !== 'string' || !entry.address || !safeId.test(entry.expectedCustomerId) || !safeId.test(entry.expectedProjectId) || (entry.displayName !== undefined && (typeof entry.displayName !== 'string' || !entry.displayName.trim()))) throw new Error('Das Katalogregister ist ungültig.');
    if (entry.type === 'https') { const url = new URL(entry.address); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Die Katalogadresse muss HTTPS ohne Zugangsdaten verwenden.'); }
    ids.add(entry.id);
  }
  if (!ids.has(value.activeCatalogId)) throw new Error('Der aktive Katalog fehlt im Register.');
  return value;
}

function json(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Die Operator-Datei enthält kein gültiges JSON.'); } }
function digest(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function atomicJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temporary, file); }
function configPath(options) { return path.resolve(options.config || defaultConfigPath()); }
function statePath(options) { return path.join(path.dirname(configPath(options)), 'operator-release.json'); }
function validateBackup(value) { if (!exactKeys(value, new Set(['schemaVersion', 'kind', 'createdAt', 'configuration'])) || value.schemaVersion !== 1 || value.kind !== 'universaarl-twin-config-backup' || typeof value.createdAt !== 'string' || !value.configuration) throw new Error('Die Konfigurationssicherung ist ungültig.'); validateConfiguration(value.configuration); return value; }
function validateCandidate(file) {
  const resolvedManifest = path.resolve(file);
  if (fs.lstatSync(resolvedManifest).isSymbolicLink()) throw new Error('Symbolische Releaseverknüpfungen sind nicht erlaubt.');
  const manifest = json(resolvedManifest);
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'universaarl-twin-release' || !safeId.test(manifest.releaseId) || !semver.test(manifest.applicationVersion) || manifest.configSchemaVersion !== 1 || manifest.snapshotSchemaVersion !== 1 || !sha256.test(manifest.packageJsonSha256)) throw new Error('Das Update-Manifest ist nicht kompatibel.');
  const releaseRoot = path.dirname(resolvedManifest); const packageFile = path.join(releaseRoot, 'package.json');
  if (!fs.existsSync(packageFile)) throw new Error('Das Releasepaket fehlt.');
  if (fs.lstatSync(releaseRoot).isSymbolicLink() || fs.lstatSync(packageFile).isSymbolicLink()) throw new Error('Symbolische Releaseverknüpfungen sind nicht erlaubt.');
  const canonicalRoot = fs.realpathSync.native(releaseRoot); const expectedRoot = path.resolve(releaseRoot); if ((process.platform === 'win32' ? canonicalRoot.toLowerCase() : canonicalRoot) !== (process.platform === 'win32' ? expectedRoot.toLowerCase() : expectedRoot)) throw new Error('Releaseverknüpfungen und Junctions sind nicht erlaubt.');
  if (digest(packageFile) !== manifest.packageJsonSha256) throw new Error('Der Update-Digest stimmt nicht.');
  return { manifest, releaseRoot, manifestPath: resolvedManifest, manifestSha256: digest(resolvedManifest) };
}
function versionParts(value) { return value.split('-')[0].split('.').map(Number); }
function compareVersions(left, right) { const a = versionParts(left); const b = versionParts(right); for (let index = 0; index < 3; index += 1) { if (a[index] !== b[index]) return a[index] - b[index]; } return 0; }
export function compatibilityMatrix(candidate, nodeVersion = process.versions.node) {
  const nodeMajor = Number(nodeVersion.split('.')[0]);
  return {
    configSchema: candidate.manifest.configSchemaVersion === 1,
    snapshotSchema: candidate.manifest.snapshotSchemaVersion === 1,
    nodeRuntime: nodeMajor >= 20 && nodeMajor !== 21,
    digest: true,
  };
}
export function switchCatalog(configuration, catalogId) { if (!configuration.catalogs.some((item) => item.id === catalogId)) throw new Error('Der gewählte Katalog fehlt im Register.'); return validateConfiguration({ ...configuration, activeCatalogId: catalogId }); }
export function backupConfiguration(file, backupFile) { const configuration = validateConfiguration(json(file)); atomicJson(backupFile, { schemaVersion: 1, kind: 'universaarl-twin-config-backup', createdAt: new Date().toISOString(), configuration }); return backupFile; }
export function restoreConfiguration(backupFile, file) { const backup = validateBackup(json(backupFile)); atomicJson(file, backup.configuration); return file; }
export function promoteRelease(candidateFile, options = {}) {
  const candidate = validateCandidate(candidateFile); const matrix = compatibilityMatrix(candidate);
  if (Object.values(matrix).some((value) => !value)) throw new Error('Das Update ist mit der lokalen Laufzeit nicht kompatibel.');
  const file = statePath(options); const previous = fs.existsSync(file) ? json(file).active ?? null : null;
  if (previous && compareVersions(candidate.manifest.applicationVersion, previous.applicationVersion) <= 0) throw new Error('Ein Downgrade oder eine erneute Aktivierung ist nur über den geprüften Rollback zulässig.');
  atomicJson(file, { schemaVersion: 1, active: { releaseId: candidate.manifest.releaseId, applicationVersion: candidate.manifest.applicationVersion, manifestPath: candidate.manifestPath, manifestSha256: candidate.manifestSha256, releaseRoot: candidate.releaseRoot, packageJsonSha256: candidate.manifest.packageJsonSha256 }, previous });
  return { file, matrix };
}
function validateStoredRelease(active) {
  if (!active || !safeId.test(active.releaseId) || !semver.test(active.applicationVersion) || !path.isAbsolute(active.releaseRoot) || !path.isAbsolute(active.manifestPath) || !sha256.test(active.manifestSha256) || !sha256.test(active.packageJsonSha256)) throw new Error('Der lokale Releasezeiger ist ungültig.');
  const candidate = validateCandidate(active.manifestPath); const matrix = compatibilityMatrix(candidate);
  if (Object.values(matrix).some((value) => !value) || candidate.manifest.releaseId !== active.releaseId || candidate.manifest.applicationVersion !== active.applicationVersion || candidate.releaseRoot !== active.releaseRoot || candidate.manifestSha256 !== active.manifestSha256 || candidate.manifest.packageJsonSha256 !== active.packageJsonSha256) throw new Error('Der gespeicherte Release ist nicht mehr unverändert und kompatibel.');
  return active;
}
export function rollbackRelease(options = {}) { const file = statePath(options); const state = json(file); if (!state?.previous) throw new Error('Es ist kein geprüfter vorheriger Release für den Rollback vorhanden.'); const previous = validateStoredRelease(state.previous); atomicJson(file, { schemaVersion: 1, active: previous, previous: state.active }); return previous; }
export function resolveActiveReleaseRoot(options = {}) {
  const file = statePath(options); if (!fs.existsSync(file)) return null; const state = json(file); const active = state?.active;
  return validateStoredRelease(active).releaseRoot;
}
function redact(text) { return text.replace(/https?:\/\/[^\s]+/g, '[HTTPS-Adresse]').replace(/[A-Za-z]:\\[^\r\n]+|\/(?:Users|home)\/[^\r\n]+/g, '[lokaler Pfad]').slice(-8_000); }
export function diagnosticReport(options = {}) { const file = configPath(options); const configuration = validateConfiguration(json(file)); return { schemaVersion: 1, status: 'diagnosebereit', host: '127.0.0.1', activeCatalogId: configuration.activeCatalogId, catalogCount: configuration.catalogs.length, releasePointerPresent: fs.existsSync(statePath(options)), unsupported: ['LAN', 'Mehrbenutzer', 'Authentifizierung', 'TLS-Terminierung'], logs: options.logText ? redact(options.logText) : '' }; }

function parse(argv) { const options = { action: argv[0] ?? 'diagnose', config: '', catalogId: '', backup: '', candidate: '' }; for (let i = 1; i < argv.length; i += 2) { const key = argv[i]; const value = argv[i + 1]; if (!value) throw new Error(`Für ${key} fehlt ein Wert.`); if (key === '--config') options.config = value; else if (key === '--catalog-id') options.catalogId = value; else if (key === '--backup') options.backup = value; else if (key === '--candidate') options.candidate = value; else throw new Error(`Unbekannter Parameter: ${key}`); } return options; }
export function main(argv = process.argv.slice(2)) {
  const options = parse(argv); const file = configPath(options);
  if (options.action === 'switch') { const configuration = switchCatalog(validateConfiguration(json(file)), options.catalogId); atomicJson(file, configuration); return process.stdout.write(`Aktiver Katalog: ${configuration.activeCatalogId}\n`); }
  if (options.action === 'backup') return process.stdout.write(`Konfiguration gesichert: ${backupConfiguration(file, path.resolve(options.backup))}\n`);
  if (options.action === 'restore') return process.stdout.write(`Konfiguration wiederhergestellt: ${restoreConfiguration(path.resolve(options.backup), file)}\n`);
  if (options.action === 'update-preflight') { const candidate = validateCandidate(options.candidate); return process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: 'kompatibel', matrix: compatibilityMatrix(candidate) })}\n`); }
  if (options.action === 'upgrade') return process.stdout.write(`Release atomar aktiviert: ${promoteRelease(options.candidate, options).file}\n`);
  if (options.action === 'rollback') { const active = rollbackRelease(options); return process.stdout.write(`Rollback aktiviert: ${active.releaseId}\n`); }
  if (options.action === 'diagnose') return process.stdout.write(`${JSON.stringify(diagnosticReport(options), null, 2)}\n`);
  throw new Error('Unbekannte Operatoraktion.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
