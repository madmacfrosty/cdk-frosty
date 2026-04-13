export interface CdkNode {
  id: string;           // last path segment; display fallback; unique among siblings only
  path: string;         // full CDK path; unique across tree; used as container ID
  fqn: string;          // constructInfo.fqn; defaults to 'unknown' if missing
  parentPath?: string;  // CDK path of parent; undefined on root
  children: CdkNode[];
  attributes: Record<string, unknown>;
}

export interface CdkTree {
  version: string;
  root: CdkNode;
}
