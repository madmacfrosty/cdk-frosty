import { buildGraph } from './index';
import { RuleOutputMap } from '../engine/types';
import { CdkTree } from '../parser/types';

function makeTree(): CdkTree {
  return { version: 'tree-0.1', root: { id: 'App', path: 'App', fqn: 'x', children: [], attributes: {} } };
}

function containerMap(entries: Array<[string, string, string]>): RuleOutputMap {
  const map: RuleOutputMap = new Map();
  for (const [path, label, fqn] of entries) {
    map.set(path, {
      primary: { kind: 'container', label, containerType: 'test' },
      metadata: [],
      sourceFqn: fqn,
    });
  }
  return map;
}

describe('buildGraph', () => {
  // Test 1: flat containers — all roots, no parentId
  it('flat containers are all roots with no parentId', () => {
    const map = containerMap([['A', 'A', 'x'], ['B', 'B', 'y'], ['C', 'C', 'z']]);
    const graph = buildGraph(map, makeTree());
    expect(graph.roots).toHaveLength(3);
    for (const c of graph.containers.values()) {
      expect(c.parentId).toBeUndefined();
    }
  });

  // Test 2: Stack/Lambda — Lambda parentId === 'Stack'
  it('Stack/Lambda: Lambda parentId is Stack', () => {
    const map = containerMap([['Stack', 'Stack', 's'], ['Stack/Lambda', 'Lambda', 'l']]);
    const graph = buildGraph(map, makeTree());
    expect(graph.containers.get('Stack/Lambda')!.parentId).toBe('Stack');
  });

  // Test 3: skip-level — Stack/L3/Lambda where L3 has no container → Lambda.parentId === 'Stack'
  it('Stack/L3/Lambda with L3 absent: Lambda parentId skips to Stack', () => {
    const map = containerMap([['Stack', 'Stack', 's'], ['Stack/L3/Lambda', 'Lambda', 'l']]);
    const graph = buildGraph(map, makeTree());
    expect(graph.containers.get('Stack/L3/Lambda')!.parentId).toBe('Stack');
  });

  // Test 4: three levels A/B/C — C.parentId === 'B'; B.parentId === 'A'
  it('three-level nesting: nearest ancestor assigned', () => {
    const map = containerMap([['A', 'A', 'a'], ['A/B', 'B', 'b'], ['A/B/C', 'C', 'c']]);
    const graph = buildGraph(map, makeTree());
    expect(graph.containers.get('A/B/C')!.parentId).toBe('A/B');
    expect(graph.containers.get('A/B')!.parentId).toBe('A');
    expect(graph.containers.get('A')!.parentId).toBeUndefined();
  });

  // Test 5: group assignment
  it('group assignment: container with matching sourceFqn gets groupId and groupLabel', () => {
    const map: RuleOutputMap = new Map();
    // A node that produces a group output for Lambda fqn
    map.set('App/GroupNode', {
      primary: { kind: 'group', groupLabel: 'Compute', memberFqn: 'aws-cdk-lib.aws_lambda.Function' },
      metadata: [],
      sourceFqn: 'special-construct',
    });
    map.set('Stack/Fn', {
      primary: { kind: 'container', label: 'Fn', containerType: 'lambda' },
      metadata: [],
      sourceFqn: 'aws-cdk-lib.aws_lambda.Function',
    });
    const graph = buildGraph(map, makeTree());
    const fn = graph.containers.get('Stack/Fn')!;
    expect(fn.groupLabel).toBe('Compute');
    expect(fn.groupId).toBe('Compute');
  });

  // Test 6: two group rules match same container — higher-priority (first in eval order) wins
  it('two group entries match same container: first (higher-priority) group used', () => {
    const map: RuleOutputMap = new Map();
    map.set('App/Group1', {
      primary: { kind: 'group', groupLabel: 'HighPriorityGroup', memberFqn: 'aws-cdk-lib.aws_lambda.Function' },
      metadata: [],
      sourceFqn: 'construct1',
    });
    map.set('App/Group2', {
      primary: { kind: 'group', groupLabel: 'LowPriorityGroup', memberFqn: 'aws-cdk-lib.aws_lambda.Function' },
      metadata: [],
      sourceFqn: 'construct2',
    });
    map.set('Stack/Fn', {
      primary: { kind: 'container', label: 'Fn', containerType: 'lambda' },
      metadata: [],
      sourceFqn: 'aws-cdk-lib.aws_lambda.Function',
    });
    const graph = buildGraph(map, makeTree());
    const fn = graph.containers.get('Stack/Fn')!;
    expect(fn.groupLabel).toBe('HighPriorityGroup');
  });

  // Test 7: edge IDs — first, second, third between same pair
  it('edge IDs: --2 and --3 suffixes for duplicate pairs', () => {
    const map: RuleOutputMap = new Map();
    map.set('n1', { primary: { kind: 'edge', sourceId: 'src', targetId: 'tgt' }, metadata: [], sourceFqn: 'x' });
    map.set('n2', { primary: { kind: 'edge', sourceId: 'src', targetId: 'tgt' }, metadata: [], sourceFqn: 'x' });
    map.set('n3', { primary: { kind: 'edge', sourceId: 'src', targetId: 'tgt' }, metadata: [], sourceFqn: 'x' });
    const graph = buildGraph(map, makeTree());
    const ids = graph.edges.map(e => e.id);
    expect(ids).toContain('src--tgt');
    expect(ids).toContain('src--tgt--2');
    expect(ids).toContain('src--tgt--3');
  });

  // Test 8: metadata attached to valid edge
  it('metadata on valid edge: attached to edge.metadata[key]', () => {
    const map: RuleOutputMap = new Map();
    map.set('n1', {
      primary: { kind: 'edge', sourceId: 'src', targetId: 'tgt' },
      metadata: [{ kind: 'metadata', targetEdgeSourceId: 'src', targetEdgeTargetId: 'tgt', key: 'role', value: 'arn:aws:iam::123' }],
      sourceFqn: 'x',
    });
    const graph = buildGraph(map, makeTree());
    expect(graph.edges[0].metadata['role']).toBe('arn:aws:iam::123');
  });

  // Test 9: orphaned metadata warning
  it('metadata targeting non-existent edge: warning emitted, metadata dropped', () => {
    const map: RuleOutputMap = new Map();
    map.set('n1', {
      primary: null,
      metadata: [{ kind: 'metadata', targetEdgeSourceId: 'ghost-src', targetEdgeTargetId: 'ghost-tgt', key: 'k', value: 'v' }],
      sourceFqn: 'x',
    });
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const graph = buildGraph(map, makeTree());
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(warnings).toContain('ghost-src');
    expect(warnings).toContain('ghost-tgt');
    expect(graph.edges).toHaveLength(0);
  });
});
