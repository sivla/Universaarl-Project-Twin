import { z } from 'zod';

export const phases = ['Strategize', 'Initiate', 'Implement', 'Prepare', 'Operate'] as const;
export const artifactKinds = [
  'milestone', 'epic', 'story', 'task', 'change', 'capability', 'architecture', 'document', 'evidence',
] as const;

export const historyEventSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  at: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  wave: z.enum(['W0', 'W1']),
  sourcePath: z.string().min(1),
});

export const artifactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(artifactKinds),
  title: z.string().min(1),
  status: z.string().min(1),
  phase: z.enum(phases),
  wave: z.string().default(''),
  workstream: z.string().min(1),
  rationale: z.string().default(''),
  parentId: z.string().nullable().default(null),
  dependencies: z.array(z.string()).default([]),
  documents: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  sourcePath: z.string().min(1),
});

export const evidenceImageSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
});

export const projectStateSchema = z.object({
  source: z.object({
    branch: z.string().min(1), commit: z.string().min(1), dirty: z.boolean(), readAt: z.string().datetime(), pathLabel: z.string().min(1),
  }),
  artifacts: z.array(artifactSchema),
  history: z.array(historyEventSchema),
  evidenceImages: z.array(evidenceImageSchema),
  workstreams: z.array(z.string()),
  gaps: z.array(z.string()),
  warnings: z.array(z.string()),
  stats: z.object({
    jira: z.number().int().nonnegative(), changes: z.number().int().nonnegative(), documents: z.number().int().nonnegative(),
    capabilities: z.number().int().nonnegative(), evidence: z.number().int().nonnegative(), history: z.number().int().nonnegative(),
  }),
});

export type Artifact = z.infer<typeof artifactSchema>;
export type HistoryEvent = z.infer<typeof historyEventSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
