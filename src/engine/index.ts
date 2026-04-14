import { CdkNode, CdkTree } from '../parser/types';
import { ArchContainer } from '../graph/types';
import { Rule, RuleContext, RuleOutput, RuleOutputMap, EdgeItem } from './types';
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

  // Pass-1 context: findContainer/findNode always return undefined
  const pass1Context: RuleContext = {
    findContainer() { return undefined; },
    findNode() { return undefined; },
  };

  // Partial container map for Pass-2 lookup (built from Pass-1 results)
  const containerMap = new Map<string, ArchContainer>();

  // Pass 1: populate matchCache, collect containers
  for (const node of nodes) {
    const result = evaluateNode(node, rules, 1, matchCache, pass1Context);
    // Store pass-1 result temporarily keyed by path
    outputMap.set(node.path, { primary: result.primary, edges: [], metadata: result.metadata, sourceFqn: node.fqn });

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

  // Node map for pass-2 findNode
  const nodeMap = new Map<string, CdkNode>();
  for (const node of nodes) nodeMap.set(node.path, node);

  // Pass-2 context: resolve by exact match then suffix
  const pass2Context: RuleContext = {
    findNode(pathOrFragment: string): CdkNode | undefined {
      const exact = nodeMap.get(pathOrFragment);
      if (exact) return exact;
      const matches: CdkNode[] = [];
      for (const [key, node] of nodeMap) {
        if (key === pathOrFragment || key.endsWith('/' + pathOrFragment)) matches.push(node);
      }
      if (matches.length === 0) return undefined;
      matches.sort((a, b) => a.path.length - b.path.length);
      return matches[0];
    },
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

  // Pass 2: collect edges from ALL matched rules, highest priority first so null-returning
  // rules (e.g. stack filter) can short-circuit before edge rules fire
  const rulesByPriority = [...rules]
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => b.rule.priority !== a.rule.priority
      ? b.rule.priority - a.rule.priority
      : a.index - b.index);

  for (const node of nodes) {
    const newEdges: EdgeItem[] = [];
    const newMetadata: RuleOutput[] = [];

    for (const { rule } of rulesByPriority) {
      const cacheKey = `${rule.id}::${node.path}`;
      if (!matchCache.get(cacheKey)) continue;

      let result: RuleOutput;
      try {
        result = rule.apply(node, pass2Context);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Warning: rule "${rule.id}" threw on node "${node.path}": ${msg}\n`);
        continue;
      }

      if (result === null) { if (rule.priority >= 100) break; continue; }
      if (result.kind === 'edge') newEdges.push(result);
      else if (result.kind === 'edges') newEdges.push(...result.items);
      else if (result.kind === 'metadata') newMetadata.push(result);
    }

    const existing = outputMap.get(node.path)!;
    outputMap.set(node.path, {
      primary: existing.primary,
      edges: [...existing.edges, ...newEdges],
      metadata: [...existing.metadata, ...newMetadata],
      sourceFqn: node.fqn,
    });
  }

  return outputMap;
}
