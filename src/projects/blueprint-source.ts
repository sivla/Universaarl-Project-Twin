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
  commit: '2ad348e689854f240083b653b9501af9eaa7b0b1',
  tree: '1bca3cda2c02b42ad3b66484f26bab939db72f0c',
  bootstrapBranch: 'codex/universaarl-projekt',
  integrationBranch: 'codex/universaarl-projekt',
  artifactCount: 145,
  sourceDigest: '1e28677ff179f45120eada12c449f33d8fa7043d1c4e15529071e392a38b25dc',
  projectionDigest: 'b551deea8df9797ea26ce6a8b964ca03e9650cbea26d35abd96ada67f4894932',
  setupProjectionDigest: 'f757373fbea1b914e9f8268fe55cb4e0d483b668cafd9cd2abdafe3fdfbd4da7',
  coreFinancePayloadDigest: '9759d2f8db7ecb198d130d1ba9da7cfad7f18faa878b0dc66713723f4231c37a',
  coreFinanceManifestDigest: '4de34af74ba424dc9555a1ae1e513a2e56316e1e65ab419dc97a8fa7812480f8',
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
