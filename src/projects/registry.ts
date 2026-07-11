import { z } from 'zod';
import path from 'node:path';
import { blueprintSourceBinding, snapshotSourceBinding, type SnapshotSourceBinding } from './blueprint-source';

const projectId = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/).refine((value) => !['constructor', 'prototype', '__proto__'].includes(value));
const sourceContract = z.object({
  manifestPath: z.literal('exports/project-data/v1/snapshot-manifest.json'),
  schemaPath: z.literal('governance/schemas/project-snapshot-manifest.schema.json'),
  indexPath: z.literal('exports/project-data/v1/index.yaml'),
  expectedProjectId: z.string().min(1).max(120).regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/),
  expectedProducerId: z.literal('blueprint'),
}).strict();
const snapshotBinding = z.object({ expectedCommit: z.string().regex(/^[a-f0-9]{40}$/), expectedRemote: z.string().min(1).max(500), expectedBranch: z.string().min(1).max(250) }).strict();
const projectEntry = z.object({
  id: projectId,
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/),
  name: z.string().min(1).max(80),
  sourceRoot: z.string().min(1).refine(path.isAbsolute),
  sourceContract: sourceContract.nullable().default(null),
  sourceBinding: snapshotBinding.nullable().default(null),
});

export type ProjectEntry = z.infer<typeof projectEntry>;
export type ProjectSourceContract = z.infer<typeof sourceContract>;
export type ProjectSourceBinding = z.infer<typeof snapshotBinding>;
export type PublicProject = Pick<ProjectEntry, 'id' | 'key' | 'name'>;

export function createProjectRegistry(entries: unknown): readonly ProjectEntry[] {
  const parsed = z.array(projectEntry).min(1).parse(entries);
  if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length) throw new Error('Doppelte Projekt-ID');
  if (new Set(parsed.map((entry) => entry.key)).size !== parsed.length) throw new Error('Doppelter Projekt-Key');
  return Object.freeze(parsed.map((entry) => Object.freeze({ ...entry })));
}

export function productionRegistry(sourceRoot: string, expectedCommit?: string) {
  if (typeof expectedCommit !== 'string' || !/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error('Die erwartete vollständige Commit-SHA fehlt oder ist ungültig.');
  const sourceBinding: SnapshotSourceBinding = snapshotSourceBinding(expectedCommit);
  return createProjectRegistry([
    { id: 'universaarl', key: 'UABC', name: 'Universaarl', sourceRoot, sourceBinding, sourceContract: { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } },
    { id: 'bc-basic', key: 'BCB', name: 'Business Central Basic', sourceRoot, sourceBinding, sourceContract: { manifestPath: blueprintSourceBinding.manifestPath, schemaPath: blueprintSourceBinding.schemaPath, indexPath: blueprintSourceBinding.indexPath, expectedProjectId: blueprintSourceBinding.expectedProjectId, expectedProducerId: blueprintSourceBinding.producerProjectId } },
  ]);
}

export function publicProjects(registry: readonly ProjectEntry[]): PublicProject[] {
  return registry.map(({ id, key, name }) => ({ id, key, name }));
}

export function findProject(registry: readonly ProjectEntry[], id: string) {
  if (!projectId.safeParse(id).success) return undefined;
  return registry.find((entry) => entry.id === id);
}
