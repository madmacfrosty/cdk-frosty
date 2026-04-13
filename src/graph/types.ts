export interface ArchContainer {
  id: string;
  label: string;
  containerType: string;
  cdkPath: string;
  parentId?: string;
  groupId?: string;
  groupLabel?: string;
  metadata: Record<string, unknown>;
}

export interface ArchEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  metadata: Record<string, unknown>;
}

export interface ArchGraph {
  containers: Map<string, ArchContainer>;
  edges: ArchEdge[];
  roots: string[];
}
