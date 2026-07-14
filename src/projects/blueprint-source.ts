import path from 'node:path';

export type BlueprintSourceBinding = Readonly<{
  localRelativePath: '..\\Universaarl Projekt BC Basic';
  remoteUrl: 'https://github.com/sivla/Universaarl-BC-Basic.git';
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
  commit: '6583b6f070979de23c4746bd69c6d328b5ef889f',
  tree: '3c9a19fdda0f31605c712ea500dbede1d08ca5d5',
  bootstrapBranch: 'codex/universaarl-projekt',
  integrationBranch: 'codex/universaarl-projekt',
  artifactCount: 179,
  sourceDigest: '0dc4d17750ef5ae7d5705fd46d462936ad20b0b0ba64a2321ec8a9ef64bccadf',
  projectionDigest: 'b3468f74e06ebcec91d2db65437e7f1363ec9a3b94fad479a7d96d15e5cfb1c7',
  setupProjectionDigest: '95aefe259f670ef79ede0101e62f1b5e5a02a073246c3e25b15ccbcc4925e8f5',
  coreFinancePayloadDigest: '9759d2f8db7ecb198d130d1ba9da7cfad7f18faa878b0dc66713723f4231c37a',
  coreFinanceManifestDigest: '4de34af74ba424dc9555a1ae1e513a2e56316e1e65ab419dc97a8fa7812480f8',
  nativeRelationCount: 1044,
  portableEdgeCount: 362,
  documentCount: 46,
  confluenceDocumentCount: 28,
  navigationNodeCount: 31,
  documentCatalogPath: 'exports/project-data/v1/document-catalog.json',
  documentCatalogSchemaPath: 'governance/schemas/project-document-catalog.schema.json',
} as const);

export const blueprintSourceBinding: BlueprintSourceBinding = Object.freeze({
  localRelativePath: '..\\Universaarl Projekt BC Basic',
  remoteUrl: 'https://github.com/sivla/Universaarl-BC-Basic.git',
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
