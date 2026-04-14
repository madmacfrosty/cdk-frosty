import { execute } from './index';
import { buildGraph } from './graph-builder';
import { CdkNode, CdkTree } from '../parser/types';
import { Rule, RuleOutput, RuleOutputMap } from './types';

function cdkNode(path: string, fqn = 'x', children: CdkNode[] = []): CdkNode {
  return { id: path.split('/').pop()!, path, fqn, children, attributes: {} };
}

function makeTree(...children: CdkNode[]): CdkTree {
  return { version: 'tree-0.1', root: { id: 'App', path: 'App', fqn: 'x', children, attributes: {} } };
}

function containerRule(path: string, label: string, type = 'test'): Rule {
  return {
    id: `test/${path}`,
    priority: 50,
    match(n) { return n.path === path; },
    apply() { return { kind: 'container', label, containerType: type }; },
  };
}

let stderrSpy: jest.SpyInstance;
beforeEach(() => { stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true); });
afterEach(() => { stderrSpy.mockRestore(); });

describe('execute — graph building', () => {
  // Test 1: flat containers — all roots, no parentId
  it('flat containers are all roots with no parentId', () => {
    const tree = makeTree(cdkNode('A'), cdkNode('B'), cdkNode('C'));
    const rules = [containerRule('A', 'A'), containerRule('B', 'B'), containerRule('C', 'C')];
    const graph = execute(tree, rules);
    expect(graph.roots).toHaveLength(3);
    for (const c of graph.containers.values()) {
      expect(c.parentId).toBeUndefined();
    }
  });

  // Test 2: Stack/Lambda — Lambda parentId === 'Stack'
  it('Stack/Lambda: Lambda parentId is Stack', () => {
    const tree = makeTree(cdkNode('Stack', 's', [cdkNode('Stack/Lambda', 'l')]));
    const rules = [containerRule('Stack', 'Stack'), containerRule('Stack/Lambda', 'Lambda')];
    const graph = execute(tree, rules);
    expect(graph.containers.get('Stack/Lambda')!.parentId).toBe('Stack');
  });

  // Test 3: skip-level — Stack/L3/Lambda where L3 has no container → Lambda.parentId === 'Stack'
  it('Stack/L3/Lambda with L3 absent: Lambda parentId skips to Stack', () => {
    const l3 = cdkNode('Stack/L3', 'y', [cdkNode('Stack/L3/Lambda', 'l')]);
    const tree = makeTree(cdkNode('Stack', 's', [l3]));
    const rules = [containerRule('Stack', 'Stack'), containerRule('Stack/L3/Lambda', 'Lambda')];
    const graph = execute(tree, rules);
    expect(graph.containers.get('Stack/L3/Lambda')!.parentId).toBe('Stack');
  });

  // Test 4: three levels A/B/C — C.parentId === 'B'; B.parentId === 'A'
  it('three-level nesting: nearest ancestor assigned', () => {
    const c = cdkNode('A/B/C', 'c');
    const b = cdkNode('A/B', 'b', [c]);
    const tree = makeTree(cdkNode('A', 'a', [b]));
    const rules = [containerRule('A', 'A'), containerRule('A/B', 'B'), containerRule('A/B/C', 'C')];
    const graph = execute(tree, rules);
    expect(graph.containers.get('A/B/C')!.parentId).toBe('A/B');
    expect(graph.containers.get('A/B')!.parentId).toBe('A');
    expect(graph.containers.get('A')!.parentId).toBeUndefined();
  });

  // Test 5: group assignment — group output on the same node as the container (path-based)
  it('group assignment: container gets groupId and groupLabel from group output in its own metadata', () => {
    const tree = makeTree(cdkNode('Stack/Fn', 'aws-cdk-lib.aws_lambda.Function'));
    const rules: Rule[] = [
      containerRule('Stack/Fn', 'Fn', 'lambda'),
      { id: 'test/group', priority: 30, match(n) { return n.path === 'Stack/Fn'; }, apply(): RuleOutput { return { kind: 'group', groupLabel: 'Compute' }; } },
    ];
    const graph = execute(tree, rules);
    const fn = graph.containers.get('Stack/Fn')!;
    expect(fn.groupLabel).toBe('Compute');
    expect(fn.groupId).toBe('Compute');
  });

  // Test 6: two group outputs on same container — first one wins
  it('two group outputs on same container: first group used', () => {
    const tree = makeTree(cdkNode('Stack/Fn', 'aws-cdk-lib.aws_lambda.Function'));
    const rules: Rule[] = [
      containerRule('Stack/Fn', 'Fn', 'lambda'),
      { id: 'test/group1', priority: 35, match(n) { return n.path === 'Stack/Fn'; }, apply(): RuleOutput { return { kind: 'group', groupLabel: 'HighPriorityGroup' }; } },
      { id: 'test/group2', priority: 30, match(n) { return n.path === 'Stack/Fn'; }, apply(): RuleOutput { return { kind: 'group', groupLabel: 'LowPriorityGroup' }; } },
    ];
    const graph = execute(tree, rules);
    expect(graph.containers.get('Stack/Fn')!.groupLabel).toBe('HighPriorityGroup');
  });

  // Test 7: edge IDs — first, second, third between same pair
  it('edge IDs: --2 and --3 suffixes for duplicate pairs', () => {
    const tree = makeTree(cdkNode('n1'), cdkNode('n2'), cdkNode('n3'));
    const rules: Rule[] = [
      { id: 'test/e1', priority: 50, match(n) { return n.path === 'n1'; }, apply(): RuleOutput { return { kind: 'edge', sourceId: 'src', targetId: 'tgt' }; } },
      { id: 'test/e2', priority: 50, match(n) { return n.path === 'n2'; }, apply(): RuleOutput { return { kind: 'edge', sourceId: 'src', targetId: 'tgt' }; } },
      { id: 'test/e3', priority: 50, match(n) { return n.path === 'n3'; }, apply(): RuleOutput { return { kind: 'edge', sourceId: 'src', targetId: 'tgt' }; } },
    ];
    const graph = execute(tree, rules);
    const ids = graph.edges.map(e => e.id);
    expect(ids).toContain('src--tgt');
    expect(ids).toContain('src--tgt--2');
    expect(ids).toContain('src--tgt--3');
  });

  // Test 8: metadata attached to valid edge
  it('metadata on valid edge: attached to edge.metadata[key]', () => {
    const tree = makeTree(cdkNode('n1'));
    const rules: Rule[] = [
      { id: 'test/edge', priority: 50, match(n) { return n.path === 'n1'; }, apply(): RuleOutput { return { kind: 'edge', sourceId: 'src', targetId: 'tgt' }; } },
      { id: 'test/meta', priority: 40, match(n) { return n.path === 'n1'; }, apply(): RuleOutput { return { kind: 'metadata', targetEdgeSourceId: 'src', targetEdgeTargetId: 'tgt', key: 'role', value: 'arn:aws:iam::123' }; } },
    ];
    const graph = execute(tree, rules);
    expect(graph.edges[0].metadata['role']).toBe('arn:aws:iam::123');
  });

  // Test 9: orphaned metadata warning
  it('metadata targeting non-existent edge: warning emitted, metadata dropped', () => {
    const tree = makeTree(cdkNode('n1'));
    const rules: Rule[] = [
      { id: 'test/meta', priority: 50, match(n) { return n.path === 'n1'; }, apply(): RuleOutput { return { kind: 'metadata', targetEdgeSourceId: 'ghost-src', targetEdgeTargetId: 'ghost-tgt', key: 'k', value: 'v' }; } },
    ];
    const graph = execute(tree, rules);
    const warnings = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(warnings).toContain('ghost-src');
    expect(warnings).toContain('ghost-tgt');
    expect(graph.edges).toHaveLength(0);
  });

  // Test 10: null in container metadata array — null guard (false branch of `m &&`)
  it('null entry in container metadata array: skipped gracefully', () => {
    const map: RuleOutputMap = new Map();
    map.set('Stack/Fn', {
      primary: { kind: 'container', label: 'Fn', containerType: 'lambda' },
      edges: [],
      metadata: [null as unknown as RuleOutput],
      sourceFqn: 'x',
    });
    const graph = buildGraph(map);
    expect(graph.containers.get('Stack/Fn')!.metadata).toEqual({});
  });

  // Test 11: metadata-kind entry in container metadata — covers assignment on line 24
  it('metadata-kind entry in container metadata array: applied to container.metadata', () => {
    const map: RuleOutputMap = new Map();
    map.set('Stack/Fn', {
      primary: { kind: 'container', label: 'Fn', containerType: 'lambda' },
      edges: [],
      metadata: [{ kind: 'metadata', targetEdgeSourceId: 'x', targetEdgeTargetId: 'y', key: 'tier', value: 'gold' }],
      sourceFqn: 'x',
    });
    const graph = buildGraph(map);
    expect(graph.containers.get('Stack/Fn')!.metadata['tier']).toBe('gold');
  });

  // Test 12: orphaned metadata warning with non-empty edge list — covers some() callback
  it('orphaned metadata with other edges present: some() callback called; warning emitted', () => {
    const n1 = cdkNode('n1');
    const n2 = cdkNode('n2');
    const tree = makeTree(n1, n2);
    const rules: Rule[] = [
      containerRule('n1', 'N1'),
      containerRule('n2', 'N2'),
      // n1 produces a real edge in Pass 2
      {
        id: 'test/real-edge', priority: 40,
        match(n) { return n.path === 'n1'; },
        apply(): RuleOutput { return { kind: 'edge', sourceId: 'n1', targetId: 'n2' }; },
      },
      // n2 produces orphaned metadata in Pass 2
      {
        id: 'test/orphan-meta', priority: 40,
        match(n) { return n.path === 'n2'; },
        apply(): RuleOutput { return { kind: 'metadata', targetEdgeSourceId: 'ghost', targetEdgeTargetId: 'ghost2', key: 'k', value: 'v' }; },
      },
    ];
    const graph = execute(tree, rules);
    const warnings = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(warnings).toContain('ghost');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].id).toBe('n1--n2');
  });
});
