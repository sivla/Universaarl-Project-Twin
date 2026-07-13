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
  commit: '8f50573bc6105991a74363d6e3ed672abc0eaeef',
  tree: '24b6f4107cef22b7b0cd34ad0982a1b7be2330eb',
  bootstrapBranch: 'codex/universaarl-projekt',
  integrationBranch: 'codex/universaarl-projekt',
  artifactCount: 139,
  sourceDigest: 'c2ca21a8faace5fbda0946a89aff25b6d045b9219183505080bc9d9da2598a2d',
  projectionDigest: '867f9132a18488a1389edb02f30a8171078e777c31123263d9addc3c4d78ab06',
  setupProjectionDigest: 'f181cef8af469fadb1b3085b67650f7c8b1f1c4986f459e89e40d25ed515602d',
  nativeRelationCount: 1040,
  portableEdgeCount: 362,
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
