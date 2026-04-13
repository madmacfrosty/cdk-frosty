import { transform } from './index';
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

describe('transform', () => {
  // Test 1: all nodes in 5-node tree appear in RuleOutputMap
  it('all nodes in a 5-node tree appear in the returned map', () => {
    const root = makeNode('App', 'App', 'aws-cdk-lib.App', [
      makeNode('Stack', 'Stack', 'aws-cdk-lib.Stack', [
        makeNode('Fn', 'Stack/Fn', 'lambda'),
        makeNode('Q', 'Stack/Q', 'queue'),
        makeNode('Role', 'Stack/Role', 'iam'),
      ]),
    ]);
    const rule: Rule = { id: 'catch-all', priority: 1, match: () => true, apply: () => null };
    const map = transform(makeTree(root), [rule]);
    expect(map.size).toBe(5);
    expect(map.has('App')).toBe(true);
    expect(map.has('Stack')).toBe(true);
    expect(map.has('Stack/Fn')).toBe(true);
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
    transform(makeTree(root), [lambdaRule, spyRule]);
    // In pass 1, the spy was invoked; results should all be undefined
    // (pass 1 context returns undefined for all findContainer calls)
    expect(results.every(r => r === undefined)).toBe(true);
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
    transform(makeTree(root), [lambdaRule, edgeRule]);
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
    transform(makeTree(root), [lambdaRule, edgeRule]);
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
    transform(makeTree(root), [bucketRule, edgeRule]);
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
    transform(makeTree(root), [spyRule]);
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
    transform(makeTree(root), [lambdaRule, edgeRule]);
    expect(resolvedInPass2).toBeDefined();
    expect(resolvedInPass2!.id).toBe('Stack/Fn');
  });
});
