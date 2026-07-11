import { z } from 'zod';
import path from 'node:path';

const projectId = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/).refine((value) => !['constructor', 'prototype', '__proto__'].includes(value));
const sourceContract = z.object({
  path: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine((value) => value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')),
  expectedProjectId: z.string().min(1).max(120).regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,118}[A-Za-z0-9])?$/),
}).strict();
const projectEntry = z.object({
  id: projectId,
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/),
  name: z.string().min(1).max(80),
  sourceRoot: z.string().min(1).refine(path.isAbsolute),
  sourceContract: sourceContract.nullable().default(null),
});

export type ProjectEntry = z.infer<typeof projectEntry>;
export type ProjectSourceContract = z.infer<typeof sourceContract>;
export type PublicProject = Pick<ProjectEntry, 'id' | 'key' | 'name'>;

export function createProjectRegistry(entries: unknown): readonly ProjectEntry[] {
  const parsed = z.array(projectEntry).min(1).parse(entries);
  if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length) throw new Error('Doppelte Projekt-ID');
  if (new Set(parsed.map((entry) => entry.key)).size !== parsed.length) throw new Error('Doppelter Projekt-Key');
  return Object.freeze(parsed.map((entry) => Object.freeze({ ...entry })));
}

export function productionRegistry(sourceRoot: string) {
  return createProjectRegistry([
    { id: 'universaarl', key: 'UABC', name: 'Universaarl', sourceRoot },
    { id: 'bc-basic', key: 'BCB', name: 'Business Central Basic', sourceRoot, sourceContract: { path: 'exports/project-data/v1/index.yaml', expectedProjectId: 'UABC-BC-BASIC-001' } },
  ]);
}

export function publicProjects(registry: readonly ProjectEntry[]): PublicProject[] {
  return registry.map(({ id, key, name }) => ({ id, key, name }));
}

export function findProject(registry: readonly ProjectEntry[], id: string) {
  if (!projectId.safeParse(id).success) return undefined;
  return registry.find((entry) => entry.id === id);
}
