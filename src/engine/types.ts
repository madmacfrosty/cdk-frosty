import { CdkNode } from '../parser/types';
import { ArchContainer } from '../graph/types';

export type RuleOutput =
  | { kind: 'container'; label: string; containerType: string }
  | { kind: 'edge'; sourceId: string; targetId: string; label?: string }
  | { kind: 'metadata'; targetEdgeSourceId: string; targetEdgeTargetId: string; key: string; value: unknown }
  | { kind: 'group'; groupLabel: string; memberFqn: string }
  | null;

export interface RuleContext {
  findContainer(pathOrFragment: string): ArchContainer | undefined;
}

export interface Rule {
  id: string;
  priority: number;
  match(node: CdkNode): boolean;   // MUST be pure and stateless
  apply(node: CdkNode, context: RuleContext): RuleOutput;
}

export type RuleOutputMap = Map<string, {
  primary: RuleOutput;
  metadata: RuleOutput[];
  sourceFqn: string;
}>;
