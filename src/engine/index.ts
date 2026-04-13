import { CdkNode, CdkTree } from '../parser/types';
import { ArchContainer } from '../graph/types';
import { Rule, RuleContext, RuleOutputMap } from './types';
import { evaluateNode } from './evaluator';

function flattenTree(node: CdkNode): CdkNode[] {
  const result: CdkNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

export function transform(tree: CdkTree, rules: Rule[]): RuleOutputMap {
  const nodes = flattenTree(tree.root);
  const matchCache = new Map<string, boolean>();
  const outputMap: RuleOutputMap = new Map();

  // Pass-1 context: findContainer always returns undefined
  const pass1Context: RuleContext = {
    findContainer() { return undefined; },
  };

  // Partial container map for Pass-2 lookup (built from Pass-1 results)
  const containerMap = new Map<string, ArchContainer>();

  // Pass 1: populate matchCache, collect containers
  for (const node of nodes) {
    const result = evaluateNode(node, rules, 1, matchCache, pass1Context);
    // Store pass-1 result temporarily keyed by path
    outputMap.set(node.path, { primary: result.primary, metadata: result.metadata, sourceFqn: node.fqn });

    if (result.primary && result.primary.kind === 'container') {
      containerMap.set(node.path, {
        id: node.path,
        label: result.primary.label,
        containerType: result.primary.containerType,
        cdkPath: node.path,
        metadata: {},
      });
    }
  }

  // Pass-2 context: resolve by exact match then suffix
  const pass2Context: RuleContext = {
    findContainer(pathOrFragment: string): ArchContainer | undefined {
      // Exact match first
      const exact = containerMap.get(pathOrFragment);
      if (exact) return exact;

      // Suffix match
      const matches: ArchContainer[] = [];
      for (const [key, container] of containerMap) {
        if (key === pathOrFragment || key.endsWith('/' + pathOrFragment)) {
          matches.push(container);
        }
      }

      if (matches.length === 0) return undefined;
      if (matches.length === 1) return matches[0];

      // Ambiguous: warn and return shallowest (shortest path)
      matches.sort((a, b) => a.id.length - b.id.length);
      const paths = matches.map(c => c.id).join(', ');
      process.stderr.write(
        `Warning: findContainer('${pathOrFragment}') matched multiple containers: ${paths}; using shallowest\n`
      );
      return matches[0];
    },
  };

  // Pass 2: update outputMap with pass-2 results (edges/metadata)
  for (const node of nodes) {
    const result = evaluateNode(node, rules, 2, matchCache, pass2Context);
    // Merge: keep pass-1 primary if pass-2 produces null; keep pass-2 primary if it produces edge/metadata
    const existing = outputMap.get(node.path)!;
    if (result.primary !== null) {
      outputMap.set(node.path, { primary: result.primary, metadata: result.metadata, sourceFqn: node.fqn });
    } else {
      // Pass 2 produced nothing — keep pass-1 result (container/group)
      // but also merge any pass-2 metadata
      outputMap.set(node.path, {
        primary: existing.primary,
        metadata: [...existing.metadata, ...result.metadata],
        sourceFqn: node.fqn,
      });
    }
  }

  return outputMap;
}
