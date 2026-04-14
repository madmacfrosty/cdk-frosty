import { evaluateNode } from './evaluator';
import { CdkNode } from '../parser/types';
import { Rule, RuleContext, RuleOutput } from './types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined };

function makeNode(overrides: Partial<CdkNode> = {}): CdkNode {
  return { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {}, ...overrides };
}

function makeRule(overrides: Partial<Rule> & { id: string; priority: number; output?: RuleOutput }): Rule {
  return {
    id: overrides.id,
    priority: overrides.priority,
    match: overrides.match ?? (() => true),
    apply: overrides.apply ?? (() => overrides.output ?? null),
  };
}

describe('evaluateNode', () => {
  // Test 1: Single matching rule in Pass 1
  it('collects primary output from single matching rule in Pass 1', () => {
    const rule = makeRule({ id: 'r1', priority: 10, output: { kind: 'container', label: 'Fn', containerType: 'lambda' } });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [rule], 1, cache, noopContext);
    expect(result.primary).toMatchObject({ kind: 'container', label: 'Fn' });
  });

  // Test 2: Higher-priority rule wins; lower becomes metadata
  it('higher-priority rule wins; lower-priority metadata-returning rule goes to metadata', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: { kind: 'container', label: 'Hi', containerType: 'lambda' } });
    const lo = makeRule({
      id: 'lo', priority: 5,
      output: { kind: 'metadata', targetEdgeSourceId: 'a', targetEdgeTargetId: 'b', key: 'role', value: 'arn' },
    });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [hi, lo], 1, cache, noopContext);
    expect(result.primary).toMatchObject({ kind: 'container' });
    expect(result.metadata.length).toBe(1);
    expect(result.metadata[0]).toMatchObject({ kind: 'metadata', key: 'role' });
  });

  // Test 3: Equal-priority: earlier array index wins
  it('equal-priority: earlier array index wins', () => {
    const r1 = makeRule({ id: 'r1', priority: 10, output: { kind: 'container', label: 'First', containerType: 'a' } });
    const r2 = makeRule({ id: 'r2', priority: 10, output: { kind: 'container', label: 'Second', containerType: 'b' } });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [r1, r2], 1, cache, noopContext);
    expect(result.primary).toMatchObject({ label: 'First' });
  });

  // Test 4: Declaration-order tie-breaking with three rules
  it('three equal-priority rules: array position determines winner', () => {
    const r1 = makeRule({ id: 'r1', priority: 5, output: { kind: 'container', label: 'A', containerType: 'x' } });
    const r2 = makeRule({ id: 'r2', priority: 5, output: { kind: 'container', label: 'B', containerType: 'x' } });
    const r3 = makeRule({ id: 'r3', priority: 5, output: { kind: 'container', label: 'C', containerType: 'x' } });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [r1, r2, r3], 1, cache, noopContext);
    expect(result.primary).toMatchObject({ label: 'A' });
  });

  // Test 5: match() caching — Pass 2 uses cached value
  it('Pass 2 uses cached match result; match() not called again', () => {
    let callCount = 0;
    let toggle = true;
    const rule: Rule = {
      id: 'toggle',
      priority: 10,
      match() { callCount++; const v = toggle; toggle = !toggle; return v; },
      apply() { return { kind: 'container', label: 'X', containerType: 'x' }; },
    };
    const cache = new Map<string, boolean>();
    const node = makeNode();
    // Pass 1: calls match, caches true
    evaluateNode(node, [rule], 1, cache, noopContext);
    const countAfterPass1 = callCount;
    // Pass 2: should NOT call match again
    evaluateNode(node, [rule], 2, cache, noopContext);
    expect(callCount).toBe(countAfterPass1); // no new calls
    // If match had been called again, toggle would return false — but cache says true
    const cacheVal = cache.get('toggle::Stack/Fn');
    expect(cacheVal).toBe(true);
  });

  // Test 6: Null primary — lower-priority rules skipped
  it('null primary: lower-priority rules apply() not called', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: null });
    let loCalled = 0;
    const lo: Rule = { id: 'lo', priority: 5, match: () => true, apply() { loCalled++; return null; } };
    const cache = new Map<string, boolean>();
    evaluateNode(makeNode(), [hi, lo], 1, cache, noopContext);
    expect(loCalled).toBe(0);
  });

  // Test 7: apply() throwing — warning on stderr; next rule's output returned
  it('apply() throwing: warning emitted; next rule output returned', () => {
    const thrower = makeRule({ id: 'thrower', priority: 10, apply() { throw new Error('boom'); } });
    const fallback = makeRule({ id: 'fallback', priority: 5, output: { kind: 'container', label: 'FB', containerType: 'x' } });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [thrower, fallback], 1, cache, noopContext);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(result.primary).toMatchObject({ label: 'FB' });
    expect(warnings).toContain('thrower');
    expect(warnings).toContain('Stack/Fn');
  });

  // Test 8: Lower-priority rule returning metadata — included in metadata array
  it('demoted rule returning metadata is included in metadata array', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: { kind: 'container', label: 'X', containerType: 'x' } });
    const lo = makeRule({
      id: 'lo', priority: 5,
      output: { kind: 'metadata', targetEdgeSourceId: 'src', targetEdgeTargetId: 'tgt', key: 'k', value: 'v' },
    });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [hi, lo], 1, cache, noopContext);
    expect(result.metadata).toHaveLength(1);
    expect(result.metadata[0]).toMatchObject({ kind: 'metadata', key: 'k' });
  });

  // Test 9: Lower-priority rule returning non-metadata kind — warning; not in result
  it('demoted rule returning non-metadata kind: exactly one warning, output absent', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: { kind: 'container', label: 'X', containerType: 'x' } });
    const lo = makeRule({ id: 'lo', priority: 5, output: { kind: 'container', label: 'Y', containerType: 'y' } });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [hi, lo], 1, cache, noopContext);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(result.metadata).toHaveLength(0);
    const matchCount = (warnings.match(/unexpected output type/g) ?? []).length;
    expect(matchCount).toBe(1);
  });

  // Test 10: No matching rules — warning; returns null primary
  it('no matching rules: warning on stderr with path and fqn; returns null', () => {
    const rule = makeRule({ id: 'r', priority: 10, match: () => false });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [rule], 1, cache, noopContext);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(result.primary).toBeNull();
    expect(result.metadata).toHaveLength(0);
    expect(warnings).toContain('Stack/Fn');
    expect(warnings).toContain('aws-cdk-lib.aws_lambda.Function');
  });
});
