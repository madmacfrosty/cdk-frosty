import { CdkNode } from '../parser/types';

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

export type RuleOutput =
  | { kind: 'container'; label: string; containerType: string }
  | { kind: 'edge'; sourceId: string; targetId: string; label?: string }
  | { kind: 'edges'; items: Array<{ sourceId: string; targetId: string; label?: string }> }
  | { kind: 'metadata'; targetEdgeSourceId: string; targetEdgeTargetId: string; key: string; value: unknown }
  | { kind: 'group'; groupLabel: string; memberFqn?: string }
  | null;

export interface RuleContext {
  findContainer(pathOrFragment: string): ArchContainer | undefined;
  findNode(pathOrFragment: string): CdkNode | undefined;
}

export interface Rule {
  id: string;
  priority: number;
  match(node: CdkNode): boolean;   // MUST be pure and stateless
  apply(node: CdkNode, context: RuleContext): RuleOutput;
}

export type EdgeItem = { sourceId: string; targetId: string; label?: string };

export type RuleOutputMap = Map<string, {
  primary: RuleOutput;
  edges: EdgeItem[];
  metadata: RuleOutput[];
  sourceFqn: string;
}>;
