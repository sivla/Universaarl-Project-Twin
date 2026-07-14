import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ProjectState } from '../model';

const maxCatalogBytes = 64 * 1024 * 1024;
const maxFileBytes = 50 * 1024 * 1024;
const pointerPath = 'exports/project-data/v1/snapshots/current.json';
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sha40Schema = z.string().regex(/^[a-f0-9]{40}$/);
const idSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/);
const projectRouteIdSchema = z.string().min(2).max(48).regex(/^[a-z][a-z0-9-]+$/);
const relativePathSchema = z.string().min(1).max(1_000).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine((value) => value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'));

export const catalogEntrySchema = z.object({
  id: projectRouteIdSchema,
  type: z.enum(['filesystem', 'https']),
  address: z.string().min(1).max(2_000),
  expectedCustomerId: idSchema,
  expectedProjectId: idSchema,
  displayName: z.string().min(1).max(120).optional(),
}).strict();

export const catalogConfigurationSchema = z.object({
  schemaVersion: z.literal(1),
  activeCatalogId: projectRouteIdSchema,
  catalogs: z.array(catalogEntrySchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.catalogs.map((entry) => entry.id)).size !== value.catalogs.length) context.addIssue({ code: 'custom', message: 'Katalog-IDs müssen eindeutig sein.' });
  if (!value.catalogs.some((entry) => entry.id === value.activeCatalogId)) context.addIssue({ code: 'custom', message: 'Der aktive Katalog fehlt im Register.' });
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type CatalogConfiguration = z.infer<typeof catalogConfigurationSchema>;

const currentSchema = z.object({
  schemaVersion: z.literal(1),
  pointerContract: z.literal('uabc-portable-snapshot-current-v1'),
  customerId: idSchema,
  projectId: idSchema,
  currentReleaseId: idSchema,
  manifestPath: relativePathSchema,
  manifestSha256: sha256Schema,
  bindingStatus: z.literal('BOUND_BCPROJECTOS_RELEASE'),
  consumerEligible: z.literal(true),
  publishEligible: z.literal(true),
  updatedAt: z.string().datetime(),
}).strict();

const spectraBindingSchema = z.object({
  evidencePath: relativePathSchema,
  productId: z.literal('spectra'),
  technicalRepositoryName: z.literal('BCProjectOS'),
  repositoryUrl: z.literal('https://github.com/sivla/BCProjectOS.git'),
  releaseVersion: z.string().min(1).max(80),
  releaseTag: z.string().regex(/^spectra-v.+$/),
  annotatedTagObject: sha40Schema,
  peeledCommit: sha40Schema,
  manifestPath: relativePathSchema,
  manifestSourceCommit: sha40Schema,
  sourceTree: sha40Schema,
  consumerMode: z.literal('INSTALLABLE_BLUEPRINT'),
  installableBlueprint: z.literal(true),
  digestAlgorithm: z.literal('SHA-256'),
  payloadBundleDigest: sha256Schema,
  platformEvidenceStatus: z.literal('passed'),
  platformEvidenceRun: z.string().url(),
}).strict().superRefine((value, context) => {
  if (value.releaseTag !== `spectra-v${value.releaseVersion}`) context.addIssue({ code: 'custom', message: 'Spectra-Tag und Version stimmen nicht überein.' });
});

const transportRecordSchema = z.object({ type: z.enum(['filesystem', 'https']), relativePath: relativePathSchema, sha256: sha256Schema }).strict();
const releaseFileSchema = z.object({
  kind: z.enum(['knowledge-payload', 'catalog-fragment', 'project-index', 'project-source']),
  id: idSchema,
  sourcePath: relativePathSchema.nullable(),
  format: z.enum(['json', 'json-schema', 'yaml', 'markdown', 'csv', 'javascript', 'png', 'binary']),
  selector: z.string().max(1_000).nullable(),
  path: relativePathSchema,
  sizeBytes: z.number().int().positive().max(maxFileBytes),
  sha256: sha256Schema,
  transports: z.array(transportRecordSchema).length(2),
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestContract: z.literal('uabc-portable-snapshot-release-v1'),
  releaseId: idSchema,
  immutable: z.literal(true),
  producer: z.object({ customerId: idSchema, projectIds: z.array(idSchema).length(1), commitShaProvenance: sha40Schema }).strict(),
  consumer: z.object({
    consumerId: z.literal('project-twin'),
    repositoryUrl: z.literal('https://github.com/sivla/Universaarl-Project-Twin.git'),
    branch: z.literal('codex/universaarl-projekt-twin'),
    access: z.literal('nur-lesend'),
    authorizationScope: z.literal('ausschliesslich-validierte-snapshots-lesen'),
  }).strict(),
  releaseBinding: z.object({
    bindingStatus: z.literal('BOUND_BCPROJECTOS_RELEASE'),
    pendingReason: z.null(),
    consumerEligible: z.literal(true),
    publishEligible: z.literal(true),
    requiredEvidence: z.tuple([z.literal('annotatedTag'), z.literal('peeledCommit'), z.literal('finalManifest'), z.literal('productDigest'), z.literal('platformMatrix')]),
    spectraReleaseBinding: spectraBindingSchema,
  }).strict(),
  pathSemantics: z.literal('repository-relative'),
  byteContract: z.literal('identical-canonical-bytes'),
  sourceInventoryDigest: sha256Schema,
  projectData: z.object({
    contractId: z.literal('UABC-PROJECT-DATA-V1'),
    indexSourcePath: z.literal('exports/project-data/v1/index.yaml'),
    indexPath: relativePathSchema,
    sourceCommit: sha40Schema,
    artifactCount: z.number().int().positive().max(1_000),
  }).strict(),
  files: z.array(releaseFileSchema).min(4).max(1_000),
  validationStatus: z.literal('validated-release'),
}).strict();

const knowledgePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: z.literal('UABC-PORTABLE-SNAPSHOT-PILOT-V1'),
  releaseId: idSchema,
  customerId: idSchema,
  projectId: idSchema,
  visibilityBoundary: z.object({ foreignCustomerDataAllowed: z.literal(false) }).passthrough(),
  truthBoundary: z.object({ liveExecutionClaimed: z.boolean(), externalSyncClaimed: z.boolean(), uncheckedKnowledgePromoted: z.boolean() }).strict(),
}).passthrough();

const catalogFragmentSchema = z.object({
  schemaVersion: z.literal(1),
  fragmentContract: z.literal('uabc-customer-project-fragment-v1'),
  customerId: idSchema,
  fixtureOnly: z.literal(false),
  projects: z.array(z.object({ projectId: idSchema, routeKey: projectRouteIdSchema, visibility: z.enum(['customer', 'internal']), snapshotReleaseId: idSchema, consumerEligible: z.literal(true), publishEligible: z.literal(true) }).strict()).length(1),
  payload: z.object({ path: relativePathSchema, sha256: sha256Schema, sizeBytes: z.number().int().positive() }).strict(),
  projectData: z.object({ contractId: z.literal('UABC-PROJECT-DATA-V1'), sourceCommit: sha40Schema, artifactCount: z.number().int().positive() }).strict(),
}).strict();

export interface SnapshotTransport {
  readonly kind: 'filesystem' | 'https';
  read(relativePath: string): Promise<Buffer>;
}

export class SnapshotCatalogError extends Error {
  constructor(cause?: unknown) { super('Der Snapshot-Katalog verletzt den read-only Quellvertrag.', cause === undefined ? undefined : { cause }); this.name = 'SnapshotCatalogError'; }
}

function reject(): never { throw new SnapshotCatalogError(); }
function sha256(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function parseJson(bytes: Buffer) { try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { return reject(); } }
function validateRelativePath(value: string) { const parsed = relativePathSchema.safeParse(value); if (!parsed.success) reject(); return parsed.data; }

export function createFilesystemTransport(root: string): SnapshotTransport {
  if (!path.isAbsolute(root) || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) reject();
  const realRoot = fs.realpathSync(root);
  return Object.freeze({
    kind: 'filesystem' as const,
    async read(relativePath: string) {
      const safe = validateRelativePath(relativePath);
      let current = realRoot;
      for (const segment of safe.split('/')) {
        current = path.join(current, segment);
        let stat: fs.Stats;
        try { stat = fs.lstatSync(current); } catch { return reject(); }
        if (stat.isSymbolicLink()) reject();
      }
      const resolved = path.resolve(current);
      if (resolved !== realRoot && !resolved.startsWith(`${realRoot}${path.sep}`)) reject();
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size > maxFileBytes) reject();
      return fs.readFileSync(resolved);
    },
  });
}

export function createHttpsTransport(address: string, fetcher: typeof fetch = fetch): SnapshotTransport {
  let base: URL;
  try { base = new URL(address.endsWith('/') ? address : `${address}/`); } catch { return reject(); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) reject();
  return Object.freeze({
    kind: 'https' as const,
    async read(relativePath: string) {
      const safe = validateRelativePath(relativePath);
      const target = new URL(safe, base);
      if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) reject();
      let response: Response;
      try { response = await fetcher(target, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10_000) }); } catch { return reject(); }
      if (!response.ok) reject();
      const length = response.headers.get('content-length');
      if (length && (!Number.isSafeInteger(Number(length)) || Number(length) > maxFileBytes)) reject();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxFileBytes) reject();
      return bytes;
    },
  });
}

export function createCatalogTransport(entry: CatalogEntry, fetcher: typeof fetch = fetch) {
  return entry.type === 'filesystem' ? createFilesystemTransport(path.resolve(entry.address)) : createHttpsTransport(entry.address, fetcher);
}

export type CatalogPayload = Readonly<{
  id: string;
  role: 'evidence' | 'resource';
  mediaType: string;
  sizeBytes: number;
  digest: string;
  fileName: string;
  downloadable: boolean;
}>;

export type LoadedCatalog = Readonly<{
  entry: CatalogEntry;
  releaseId: string;
  state: ProjectState;
  payloads: ReadonlyMap<string, Readonly<{ metadata: CatalogPayload; bytes: Buffer }>>;
}>;

function validateFileTransport(file: z.infer<typeof releaseFileSchema>) {
  const byType = new Map(file.transports.map((transport) => [transport.type, transport]));
  if (byType.size !== 2 || !byType.has('filesystem') || !byType.has('https')) reject();
  for (const transport of byType.values()) if (transport.relativePath !== file.path || transport.sha256 !== file.sha256) reject();
}

type ValidatedSnapshotAsset = Readonly<{ id: string; role: 'evidence' | 'resource'; mediaType: string; bytes: Buffer; fileName: string; downloadable: boolean }>;

function assetPayload(asset: ValidatedSnapshotAsset): Readonly<{ metadata: CatalogPayload; bytes: Buffer }> {
  const bytes = Buffer.from(asset.bytes);
  return Object.freeze({
    metadata: Object.freeze({ id: asset.id, role: asset.role, mediaType: asset.mediaType, sizeBytes: bytes.length, digest: `sha256:${sha256(bytes)}`, fileName: asset.fileName, downloadable: asset.downloadable }),
    bytes,
  });
}

export async function loadSnapshotCatalog(entryInput: unknown, fetcher: typeof fetch = fetch): Promise<LoadedCatalog> {
  const parsedEntry = catalogEntrySchema.safeParse(entryInput); if (!parsedEntry.success) reject();
  const entry = parsedEntry.data;
  return loadSnapshotCatalogFromTransport(entry, createCatalogTransport(entry, fetcher));
}

export async function loadSnapshotCatalogFromTransport(entry: CatalogEntry, transport: SnapshotTransport): Promise<LoadedCatalog> {
  try { return await loadSnapshotCatalogFromTransportUnchecked(entry, transport); } catch (error) {
    if (error instanceof SnapshotCatalogError) throw error;
    throw new SnapshotCatalogError(error);
  }
}

async function loadSnapshotCatalogFromTransportUnchecked(entry: CatalogEntry, transport: SnapshotTransport): Promise<LoadedCatalog> {
  const firstCurrentBytes = await transport.read(pointerPath);
  const parsedCurrent = currentSchema.safeParse(parseJson(firstCurrentBytes)); if (!parsedCurrent.success) reject();
  const current = parsedCurrent.data;
  if (current.customerId !== entry.expectedCustomerId || current.projectId !== entry.expectedProjectId) reject();
  const releaseRoot = `exports/project-data/v1/snapshots/releases/${current.currentReleaseId}`;
  if (current.manifestPath !== `${releaseRoot}/manifest.json`) reject();

  const manifestBytes = await transport.read(current.manifestPath);
  if (sha256(manifestBytes) !== current.manifestSha256) reject();
  const parsedManifest = manifestSchema.safeParse(parseJson(manifestBytes)); if (!parsedManifest.success) reject();
  const manifest = parsedManifest.data;
  if (manifest.releaseId !== current.currentReleaseId || manifest.producer.customerId !== current.customerId || manifest.producer.projectIds[0] !== current.projectId || manifest.projectData.sourceCommit !== manifest.producer.commitShaProvenance) reject();
  if (new Set(manifest.files.map((file) => file.id)).size !== manifest.files.length || new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length) reject();
  if (manifest.files.reduce((total, file) => total + file.sizeBytes, 0) > maxCatalogBytes) reject();
  for (const file of manifest.files) validateFileTransport(file);

  const indexFiles = manifest.files.filter((file) => file.kind === 'project-index');
  const sourceFiles = manifest.files.filter((file) => file.kind === 'project-source');
  const knowledgeFiles = manifest.files.filter((file) => file.kind === 'knowledge-payload');
  const fragmentFiles = manifest.files.filter((file) => file.kind === 'catalog-fragment');
  if (indexFiles.length !== 1 || sourceFiles.length !== manifest.projectData.artifactCount || knowledgeFiles.length !== 1 || fragmentFiles.length !== 1) reject();
  const indexFile = indexFiles[0];
  if (indexFile.sourcePath !== manifest.projectData.indexSourcePath || indexFile.path !== manifest.projectData.indexPath || indexFile.path !== `${releaseRoot}/data/${manifest.projectData.indexSourcePath}`) reject();
  if (sourceFiles.some((file) => !file.sourcePath || file.path !== `${releaseRoot}/data/${file.sourcePath}`) || new Set(sourceFiles.map((file) => file.sourcePath)).size !== sourceFiles.length) reject();

  const loadedFiles = new Map<string, Buffer>();
  await Promise.all(manifest.files.map(async (file) => {
    const bytes = await transport.read(file.path);
    if (bytes.length !== file.sizeBytes || sha256(bytes) !== file.sha256) reject();
    loadedFiles.set(file.path, bytes);
  }));
  if (loadedFiles.size !== manifest.files.length) reject();

  const knowledge = knowledgePayloadSchema.safeParse(parseJson(loadedFiles.get(knowledgeFiles[0].path)!));
  const fragment = catalogFragmentSchema.safeParse(parseJson(loadedFiles.get(fragmentFiles[0].path)!));
  if (!knowledge.success || !fragment.success) reject();
  if (knowledge.data.releaseId !== current.currentReleaseId || knowledge.data.customerId !== current.customerId || knowledge.data.projectId !== current.projectId || knowledge.data.truthBoundary.liveExecutionClaimed || knowledge.data.truthBoundary.externalSyncClaimed || knowledge.data.truthBoundary.uncheckedKnowledgePromoted) reject();
  const fragmentProject = fragment.data.projects[0];
  if (fragment.data.customerId !== current.customerId || fragmentProject.projectId !== current.projectId || fragmentProject.routeKey !== entry.id || fragmentProject.snapshotReleaseId !== current.currentReleaseId || fragment.data.projectData.sourceCommit !== manifest.projectData.sourceCommit || fragment.data.projectData.artifactCount !== manifest.projectData.artifactCount || fragment.data.payload.path !== knowledgeFiles[0].path || fragment.data.payload.sha256 !== knowledgeFiles[0].sha256 || fragment.data.payload.sizeBytes !== knowledgeFiles[0].sizeBytes) reject();

  const projectFiles = new Map<string, Buffer>();
  projectFiles.set(manifest.projectData.indexSourcePath, loadedFiles.get(indexFile.path)!);
  for (const file of sourceFiles) projectFiles.set(file.sourcePath!, loadedFiles.get(file.path)!);
  // Der historische Git-Adapter wird nur als Bibliothek für seine reine
  // In-Memory-Normalisierung geladen. Es wird kein Repository aufgelöst und
  // kein Git-Befehl ausgeführt; die Eingabe besteht ausschließlich aus den
  // oben vollständig validierten Releasebytes.
  const { createProjectDataStateFromSnapshot } = await import('./adapter');
  const projection = createProjectDataStateFromSnapshot({
    routeProjectId: entry.id,
    producerProjectId: current.projectId,
    producerCommit: manifest.projectData.sourceCommit,
    indexPath: manifest.projectData.indexSourcePath,
    sourceInventoryDigest: manifest.sourceInventoryDigest,
    files: projectFiles,
    spectra: manifest.releaseBinding.spectraReleaseBinding,
    catalog: { customerId: current.customerId, projectId: current.projectId, releaseId: current.currentReleaseId, sourceType: transport.kind, manifestDigest: `sha256:${current.manifestSha256}`, updatedAt: current.updatedAt },
  });
  const payloads = new Map<string, Readonly<{ metadata: CatalogPayload; bytes: Buffer }>>();
  for (const asset of projection.assets.values()) {
    if (payloads.has(asset.id)) reject();
    payloads.set(asset.id, assetPayload(asset));
  }
  const secondCurrentBytes = await transport.read(pointerPath);
  if (sha256(secondCurrentBytes) !== sha256(firstCurrentBytes)) reject();
  return Object.freeze({ entry, releaseId: current.currentReleaseId, state: projection.state, payloads });
}

export function parseCatalogConfiguration(value: unknown) { return catalogConfigurationSchema.parse(value); }

export function readCatalogConfiguration(file: string): CatalogConfiguration {
  if (!path.isAbsolute(file)) reject();
  let bytes: Buffer;
  try { bytes = fs.readFileSync(file); } catch { return reject(); }
  return parseCatalogConfiguration(parseJson(bytes));
}

export async function loadConfiguredCatalogs(configuration: CatalogConfiguration, fetcher: typeof fetch = fetch) {
  const loaded = await Promise.all(configuration.catalogs.map((entry) => loadSnapshotCatalog(entry, fetcher)));
  return Object.freeze(loaded);
}
