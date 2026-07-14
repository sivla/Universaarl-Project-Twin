import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { projectStateSchema, type ProjectState } from '../model';

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
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
  schemaVersion: z.literal(1), customerId: idSchema, projectId: idSchema, releaseId: idSchema,
  manifestPath: relativePathSchema, manifestDigest: digestSchema, updatedAt: z.string().datetime(),
}).strict();

const pendingSpectraSchema = z.object({ status: z.literal('PENDING_BCPROJECTOS_RELEASE') }).strict();
const releasedSpectraSchema = z.object({
  status: z.literal('BOUND'), productId: z.literal('spectra'), version: z.string().min(1).max(80),
  releaseTag: z.string().regex(/^spectra-v.+$/), releaseCommit: z.string().regex(/^[a-f0-9]{40}$/), digest: digestSchema,
}).strict();

const payloadSchema = z.object({
  id: idSchema,
  role: z.enum(['project-state', 'evidence', 'resource']),
  path: relativePathSchema,
  mediaType: z.string().min(1).max(160),
  sizeBytes: z.number().int().nonnegative().max(100_000_000),
  digest: digestSchema,
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(1), customerId: idSchema, projectId: idSchema, releaseId: idSchema,
  validationStatus: z.literal('validated'), generatedAt: z.string().datetime(),
  provenance: z.object({ sourceCommit: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict(),
  spectra: z.union([pendingSpectraSchema, releasedSpectraSchema]),
  payloads: z.array(payloadSchema).min(1).max(2_000),
}).strict();

export type CatalogPayload = z.infer<typeof payloadSchema>;

export interface SnapshotTransport {
  readonly kind: 'filesystem' | 'https';
  read(relativePath: string): Promise<Buffer>;
}

export class SnapshotCatalogError extends Error {
  constructor() { super('Der Snapshot-Katalog verletzt den read-only Quellvertrag.'); this.name = 'SnapshotCatalogError'; }
}

function reject(): never { throw new SnapshotCatalogError(); }
function digest(bytes: Buffer) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
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
      if (!stat.isFile()) reject();
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
      if (length && Number(length) > 100_000_000) reject();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 100_000_000) reject();
      return bytes;
    },
  });
}

export function createCatalogTransport(entry: CatalogEntry, fetcher: typeof fetch = fetch) {
  return entry.type === 'filesystem' ? createFilesystemTransport(path.resolve(entry.address)) : createHttpsTransport(entry.address, fetcher);
}

export type LoadedCatalog = Readonly<{
  entry: CatalogEntry;
  releaseId: string;
  state: ProjectState;
  payloads: ReadonlyMap<string, Readonly<{ metadata: CatalogPayload; bytes: Buffer }>>;
}>;

export async function loadSnapshotCatalog(entryInput: unknown, fetcher: typeof fetch = fetch): Promise<LoadedCatalog> {
  const parsedEntry = catalogEntrySchema.safeParse(entryInput); if (!parsedEntry.success) reject();
  const entry = parsedEntry.data;
  const transport = createCatalogTransport(entry, fetcher);
  return loadSnapshotCatalogFromTransport(entry, transport);
}

export async function loadSnapshotCatalogFromTransport(entry: CatalogEntry, transport: SnapshotTransport): Promise<LoadedCatalog> {
  const firstCurrentBytes = await transport.read('current.json');
  const parsedCurrent = currentSchema.safeParse(parseJson(firstCurrentBytes)); if (!parsedCurrent.success) reject();
  const current = parsedCurrent.data;
  if (current.customerId !== entry.expectedCustomerId || current.projectId !== entry.expectedProjectId) reject();
  if (current.manifestPath !== `releases/${current.releaseId}/manifest.json`) reject();
  const manifestBytes = await transport.read(current.manifestPath);
  if (digest(manifestBytes) !== current.manifestDigest) reject();
  const parsedManifest = manifestSchema.safeParse(parseJson(manifestBytes)); if (!parsedManifest.success) reject();
  const manifest = parsedManifest.data;
  if (manifest.customerId !== current.customerId || manifest.projectId !== current.projectId || manifest.releaseId !== current.releaseId) reject();
  if (new Set(manifest.payloads.map((payload) => payload.id)).size !== manifest.payloads.length || new Set(manifest.payloads.map((payload) => payload.path)).size !== manifest.payloads.length) reject();
  if (manifest.payloads.filter((payload) => payload.role === 'project-state').length !== 1) reject();
  const payloads = new Map<string, Readonly<{ metadata: CatalogPayload; bytes: Buffer }>>();
  for (const payload of manifest.payloads) {
    if (!payload.path.startsWith(`releases/${current.releaseId}/payloads/`)) reject();
    const bytes = await transport.read(payload.path);
    if (bytes.length !== payload.sizeBytes || digest(bytes) !== payload.digest) reject();
    payloads.set(payload.id, Object.freeze({ metadata: payload, bytes }));
  }
  const statePayload = [...payloads.values()].find(({ metadata }) => metadata.role === 'project-state');
  if (!statePayload || statePayload.metadata.mediaType !== 'application/json') reject();
  const parsedState = projectStateSchema.safeParse(parseJson(statePayload.bytes)); if (!parsedState.success) reject();
  if (parsedState.data.source.projectId !== entry.id) reject();
  const state = projectStateSchema.parse({
    ...parsedState.data,
    source: {
      ...parsedState.data.source,
      branch: null,
      commit: manifest.provenance.sourceCommit ?? null,
      dirty: false,
      catalog: { customerId: current.customerId, projectId: current.projectId, releaseId: current.releaseId, sourceType: entry.type, manifestDigest: current.manifestDigest, updatedAt: current.updatedAt },
      channel: null,
      readAt: new Date().toISOString(),
    },
  });
  const secondCurrentBytes = await transport.read('current.json');
  if (digest(secondCurrentBytes) !== digest(firstCurrentBytes)) reject();
  return Object.freeze({ entry, releaseId: current.releaseId, state, payloads });
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
