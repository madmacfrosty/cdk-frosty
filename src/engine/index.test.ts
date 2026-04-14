import { execute } from './index';
import { CdkNode, CdkTree } from '../parser/types';
import { Rule, RuleContext } from './types';

function makeNode(id: string, path: string, fqn: string, children: CdkNode[] = []): CdkNode {
  return { id, path, fqn, children, attributes: {}, parentPath: undefined };
}

function makeTree(root: CdkNode): CdkTree {
  return { version: 'tree-0.1', root };
}

function containerRule(id: string, matchFqn: string, priority = 10): Rule {
  return {
    id,
    priority,
    match: (n) => n.fqn === matchFqn,
    apply: (n) => ({ kind: 'container', label: n.id, containerType: 'test' }),
  };
}

describe('execute', () => {
  // Test 1: all nodes in 5-node tree are visited (become containers)
  it('all nodes in a 5-node tree appear as containers', () => {
    const root = makeNode('App', 'App', 'aws-cdk-lib.App', [
      makeNode('Stack', 'Stack', 'aws-cdk-lib.Stack', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
        makeNode('Q', 'Stack/Q', 'queue'),
        makeNode('Role', 'Stack/Role', 'iam'),
      ]),
    ]);
    const rule: Rule = { id: 'catch-all', priority: 1, match: () => true, apply: (n) => ({ kind: 'container', label: n.id, containerType: 'test' }) };
    const graph = execute(makeTree(root), [rule]);
    expect(graph.containers.size).toBe(5);
    expect(graph.containers.has('App')).toBe(true);
    expect(graph.containers.has('Stack')).toBe(true);
    expect(graph.containers.has('Stack/Fn')).toBe(true);
  });

  // Test 2: Pass-1 context.findContainer always returns undefined
  it('Pass-1 context.findContainer always returns undefined', () => {
    const results: (ReturnType<RuleContext['findContainer']>)[] = [];
    const spyRule: Rule = {
      id: 'spy',
      priority: 10,
      match: () => true,
      apply(node, context) {
        if (node.path === 'Stack/Fn') {
          results.push(context.findContainer('Stack/Fn'));
          results.push(context.findContainer('Fn'));
        }
        return null;
      },
    };
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'aws-cdk-lib.Stack', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
      ]),
    ]);
    // Make Fn a container so it exists in Pass-2
    const lambdaRule = containerRule('lambda', 'lambda');
    execute(makeTree(root), [lambdaRule, spyRule]);
    // In pass 1, the spy was invoked during demotion; those results are undefined.
    // The spy is also called in pass 2 where findContainer resolves.
    // Verify the first two entries (pass 1) are undefined.
    expect(results[0]).toBeUndefined();
    expect(results[1]).toBeUndefined();
  });

  // Test 3: Pass-2 exact match
  it('Pass-2 exact match: findContainer by full path returns correct container', () => {
    let resolvedContainer: ReturnType<RuleContext['findContainer']> = undefined;
    const edgeRule: Rule = {
      id: 'edge',
      priority: 5,
      match: (n) => n.fqn === 'esm',
      apply(node, context) {
        resolvedContainer = context.findContainer('Stack/Fn');
        return null;
      },
    };
    const lambdaRule = containerRule('lambda', 'lambda', 10);
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'aws-cdk-lib.Stack', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
        makeNode('ESM', 'Stack/ESM', 'esm'),
      ]),
    ]);
    execute(makeTree(root), [lambdaRule, edgeRule]);
    expect(resolvedContainer).toBeDefined();
    expect(resolvedContainer!.id).toBe('Stack/Fn');
  });

  // Test 4: Pass-2 suffix match (one candidate)
  it('Pass-2 suffix match with one candidate returns container; no warning', () => {
    let resolvedContainer: ReturnType<RuleContext['findContainer']> = undefined;
    const edgeRule: Rule = {
      id: 'edge',
      priority: 5,
      match: (n) => n.fqn === 'esm',
      apply(node, context) {
        resolvedContainer = context.findContainer('Fn');
        return null;
      },
    };
    const lambdaRule = containerRule('lambda', 'lambda', 10);
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'x', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
        makeNode('ESM', 'Stack/ESM', 'esm'),
      ]),
    ]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    execute(makeTree(root), [lambdaRule, edgeRule]);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(resolvedContainer).toBeDefined();
    expect(resolvedContainer!.id).toBe('Stack/Fn');
    expect(warnings).not.toContain('matched multiple');
  });

  // Test 5: Pass-2 ambiguous suffix
  it('Pass-2 ambiguous suffix: warning emitted; shallowest path returned', () => {
    let resolved: ReturnType<RuleContext['findContainer']> = undefined;
    const edgeRule: Rule = {
      id: 'edge',
      priority: 5,
      match: (n) => n.fqn === 'esm',
      apply(node, context) {
        resolved = context.findContainer('MyBucket');
        return null;
      },
    };
    const bucketRule = containerRule('bucket', 'bucket', 10);
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'x', [
        makeNode('MyBucket', 'Stack/MyBucket', 'bucket'),
        makeNode('Inner', 'Stack/Inner', 'x', [
          makeNode('MyBucket', 'Stack/Inner/MyBucket', 'bucket'),
        ]),
        makeNode('ESM', 'Stack/ESM', 'esm'),
      ]),
    ]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    execute(makeTree(root), [bucketRule, edgeRule]);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(warnings).toContain('matched multiple');
    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe('Stack/MyBucket'); // shallowest
  });

  // Test 6: match() called once per rule per node across both passes
  it('match() called once per rule per node total across both passes', () => {
    let callCount = 0;
    const spyRule: Rule = {
      id: 'spy',
      priority: 1,
      match() { callCount++; return false; },
      apply() { return null; },
    };
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'x'),
    ]);
    execute(makeTree(root), [spyRule]);
    // 2 nodes × 1 rule = 2 match calls (once per node, cached in Pass 2)
    expect(callCount).toBe(2);
  });

  // Test 7: container produced in Pass 1 accessible in Pass 2
  it('container from Pass 1 accessible via findContainer in Pass 2', () => {
    let resolvedInPass2: ReturnType<RuleContext['findContainer']> = undefined;
    const lambdaRule = containerRule('lambda', 'lambda', 10);
    const edgeRule: Rule = {
      id: 'edge',
      priority: 5,
      match: (n) => n.fqn === 'esm',
      apply(node, context) {
        resolvedInPass2 = context.findContainer('Stack/Fn');
        return { kind: 'edge', sourceId: 'Stack/Q', targetId: 'Stack/Fn', label: 'triggers' };
      },
    };
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'x', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
        makeNode('ESM', 'Stack/ESM', 'esm'),
      ]),
    ]);
    execute(makeTree(root), [lambdaRule, edgeRule]);
    expect(resolvedInPass2).toBeDefined();
    expect(resolvedInPass2!.id).toBe('Stack/Fn');
  });

  // Test 8: Pass-2 findNode suffix match
  it('Pass-2 findNode suffix match: returns node by path fragment', () => {
    let found: ReturnType<RuleContext['findNode']> = undefined;
    const probe: Rule = {
      id: 'probe',
      priority: 5,
      match: (n) => n.fqn === 'probe',
      apply(_, context) { found = context.findNode('Fn'); return null; },
    };
    const lambdaRule = containerRule('lambda', 'lambda', 10);
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'x', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
        makeNode('Probe', 'Stack/Probe', 'probe'),
      ]),
    ]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    execute(makeTree(root), [lambdaRule, probe]);
    spy.mockRestore();
    expect(found).toBeDefined();
    expect(found!.path).toBe('Stack/Fn');
  });

  // Test 9: Pass-2 findNode with no match returns undefined
  it('Pass-2 findNode with no match: returns undefined', () => {
    let found: ReturnType<RuleContext['findNode']> = undefined;
    const probe: Rule = {
      id: 'probe',
      priority: 5,
      match: (n) => n.fqn === 'probe',
      apply(_, context) { found = context.findNode('NonExistent'); return null; },
    };
    const root = makeNode('App', 'App', 'x', [makeNode('Probe', 'Stack/Probe', 'probe')]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    execute(makeTree(root), [probe]);
    spy.mockRestore();
    expect(found).toBeUndefined();
  });

  // Test 10: Pass-2 rule throwing — warning emitted; other rules still produce edges
  it('Pass-2 rule throwing: warning emitted; other matched rules still run', () => {
    const thrower: Rule = {
      id: 'thrower',
      priority: 10,
      match: (n) => n.fqn === 'target',
      apply() { throw new Error('pass2 boom'); },
    };
    const edgeRule: Rule = {
      id: 'edge',
      priority: 5,
      match: (n) => n.fqn === 'target',
      apply() { return { kind: 'edge', sourceId: 'src', targetId: 'tgt' } as const; },
    };
    const root = makeNode('App', 'App', 'x', [makeNode('Target', 'Stack/Target', 'target')]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const graph = execute(makeTree(root), [thrower, edgeRule]);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(warnings).toContain('thrower');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].id).toBe('src--tgt');
  });

  // Test 11: Pass-2 rule throwing non-Error — String(err) branch
  it('Pass-2 rule throwing non-Error: String() path used in warning', () => {
    const thrower: Rule = {
      id: 'thrower',
      priority: 10,
      match: (n) => n.fqn === 'target',
      apply() { throw 'string throw'; },
    };
    const root = makeNode('App', 'App', 'x', [makeNode('Target', 'Stack/Target', 'target')]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    execute(makeTree(root), [thrower]);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(warnings).toContain('thrower');
  });

  // Test 12: findContainer suffix returning undefined — no containers match fragment
  it('Pass-2 findContainer with unmatched fragment: returns undefined', () => {
    let resolved: ReturnType<RuleContext['findContainer']> = undefined;
    const probe: Rule = {
      id: 'probe',
      priority: 5,
      match: (n) => n.fqn === 'esm',
      apply(_, context) { resolved = context.findContainer('NonExistent'); return null; },
    };
    const root = makeNode('App', 'App', 'x', [
      makeNode('Stack', 'Stack', 'x', [makeNode('ESM', 'Stack/ESM', 'esm')]),
    ]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    execute(makeTree(root), [probe]);
    spy.mockRestore();
    expect(resolved).toBeUndefined();
  });

  // Test 13: Priority-100 rule returning null in Pass 2 — short-circuits with break
  it('Pass-2 priority-100 rule returning null: breaks loop; lower-priority rules do not run', () => {
    let lowerRuleCalled = false;
    const filter: Rule = { id: 'filter', priority: 100, match: () => true, apply: () => null };
    const edgeRule: Rule = {
      id: 'edge',
      priority: 5,
      match: (n) => n.fqn === 'target',
      apply() { lowerRuleCalled = true; return { kind: 'edge', sourceId: 'a', targetId: 'b' }; },
    };
    const root = makeNode('App', 'App', 'x', [makeNode('Target', 'Stack/Target', 'target')]);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const graph = execute(makeTree(root), [filter, edgeRule]);
    spy.mockRestore();
    expect(lowerRuleCalled).toBe(false);
    expect(graph.edges).toHaveLength(0);
  });
});
