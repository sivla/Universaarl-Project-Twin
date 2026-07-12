import path from 'node:path';

export type BlueprintSourceBinding = Readonly<{
  localRelativePath: '..\\Universaarl Projekt BC Basic';
  remoteUrl: 'https://github.com/sivla/FiBu.git';
  branch: 'codex/universaarl-projekt';
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
  expectedBranch: typeof blueprintSourceBinding.branch;
}>;

export const officialBcBasicSnapshotAnchor = Object.freeze({
  commit: 'ab2497dc4f96ed6f6a402cf84ee160f29d84e822',
  tree: 'e882c342bb569e7d56a0a84bbf488f1bf7896a90',
  artifactCount: 108,
  documentCount: 32,
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

export function snapshotSourceBinding(expectedCommit?: string, expectedTree?: string): SnapshotSourceBinding {
  return Object.freeze({ expectedCommit: expectedCommit?.trim() ?? '', ...(expectedTree?.trim() ? { expectedTree: expectedTree.trim() } : {}), expectedRemote: blueprintSourceBinding.remoteUrl, expectedBranch: blueprintSourceBinding.branch });
}
