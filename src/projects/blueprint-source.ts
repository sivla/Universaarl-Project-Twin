import path from 'node:path';

export type BlueprintSourceBinding = Readonly<{
  localRelativePath: '..\\Universaarl Projekt BC Basic';
  remoteUrl: 'https://github.com/sivla/FiBu.git';
  branch: string;
  manifestPath: 'exports/project-data/v1/snapshot-manifest.json';
  schemaPath: 'governance/schemas/project-snapshot-manifest.schema.json';
  indexPath: 'exports/project-data/v1/index.yaml';
  expectedProjectId: 'UABC-BC-BASIC-001';
  producerProjectId: 'blueprint';
}>;

export type SnapshotSourceBinding = Readonly<{
  expectedCommit: string;
  expectedTree?: string;
  expectedRemote: typeof blueprintSourceBinding.remoteUrl;
  expectedBranch: string;
  branchTipRequired: boolean;
}>;

export const officialBcBasicSnapshotAnchor = Object.freeze({
  commit: '700e897f883c5e286f26629c077110290511dbff',
  tree: '9d940e970162c7743413fa4b38828ee24a9f4e81',
  bootstrapBranch: 'codex/universaarl-projekt',
  integrationBranch: 'codex/universaarl-projekt',
  artifactCount: 140,
  sourceDigest: '4804f1b0fcac789ba396d206bb80caec9bf6d5c64c1da3faf8832f36d9ab640f',
  projectionDigest: 'cf71fc5c57773bfea08caa0c5f852cb1170a68b1201e8bddc6e2d3bd43ff6c19',
  documentCount: 43,
  confluenceDocumentCount: 28,
  navigationNodeCount: 31,
  documentCatalogPath: 'exports/project-data/v1/document-catalog.json',
  documentCatalogSchemaPath: 'governance/schemas/project-document-catalog.schema.json',
} as const);

export const blueprintSourceBinding: BlueprintSourceBinding = Object.freeze({
  localRelativePath: '..\\Universaarl Projekt BC Basic',
  remoteUrl: 'https://github.com/sivla/FiBu.git',
  branch: 'codex/universaarl-projekt',
  manifestPath: 'exports/project-data/v1/snapshot-manifest.json',
  schemaPath: 'governance/schemas/project-snapshot-manifest.schema.json',
  indexPath: 'exports/project-data/v1/index.yaml',
  expectedProjectId: 'UABC-BC-BASIC-001',
  producerProjectId: 'blueprint',
});

export function resolveBlueprintSourceRoot(projectRoot: string, localOverride?: string) {
  const override = localOverride?.trim();
  if (override) {
    if (!path.isAbsolute(override)) throw new Error('Der lokale Blueprint-Override muss ein absoluter Pfad sein.');
    return path.normalize(override);
  }
  return path.resolve(projectRoot, ...blueprintSourceBinding.localRelativePath.split(/[\\/]+/));
}

export function snapshotSourceBinding(expectedCommit?: string, expectedTree?: string, expectedBranch = blueprintSourceBinding.branch, branchTipRequired = true): SnapshotSourceBinding {
  return Object.freeze({ expectedCommit: expectedCommit?.trim() ?? '', ...(expectedTree?.trim() ? { expectedTree: expectedTree.trim() } : {}), expectedRemote: blueprintSourceBinding.remoteUrl, expectedBranch: expectedBranch.trim(), branchTipRequired });
}
