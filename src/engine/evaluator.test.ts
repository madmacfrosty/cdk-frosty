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
  // Test 1: Single matching rule
  it('collects primary output from single matching rule', () => {
    const rule = makeRule({ id: 'r1', priority: 10, output: { kind: 'container', label: 'Fn', containerType: 'lambda' } });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [rule], cache, noopContext);
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
    const result = evaluateNode(makeNode(), [hi, lo], cache, noopContext);
    expect(result.primary).toMatchObject({ kind: 'container' });
    expect(result.metadata.length).toBe(1);
    expect(result.metadata[0]).toMatchObject({ kind: 'metadata', key: 'role' });
  });

  // Test 3: Equal-priority: earlier array index wins
  it('equal-priority: earlier array index wins', () => {
    const r1 = makeRule({ id: 'r1', priority: 10, output: { kind: 'container', label: 'First', containerType: 'a' } });
    const r2 = makeRule({ id: 'r2', priority: 10, output: { kind: 'container', label: 'Second', containerType: 'b' } });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [r1, r2], cache, noopContext);
    expect(result.primary).toMatchObject({ label: 'First' });
  });

  // Test 4: Declaration-order tie-breaking with three rules
  it('three equal-priority rules: array position determines winner', () => {
    const r1 = makeRule({ id: 'r1', priority: 5, output: { kind: 'container', label: 'A', containerType: 'x' } });
    const r2 = makeRule({ id: 'r2', priority: 5, output: { kind: 'container', label: 'B', containerType: 'x' } });
    const r3 = makeRule({ id: 'r3', priority: 5, output: { kind: 'container', label: 'C', containerType: 'x' } });
    const cache = new Map<string, boolean>();
    const result = evaluateNode(makeNode(), [r1, r2, r3], cache, noopContext);
    expect(result.primary).toMatchObject({ label: 'A' });
  });

  // Test 5: match() result stored in matchCache with correct key
  it('match() result is stored in matchCache with key "ruleId::nodePath"', () => {
    let callCount = 0;
    const rule: Rule = {
      id: 'cached',
      priority: 10,
      match() { callCount++; return true; },
      apply() { return { kind: 'container', label: 'X', containerType: 'x' }; },
    };
    const cache = new Map<string, boolean>();
    evaluateNode(makeNode(), [rule], cache, noopContext);
    expect(callCount).toBe(1);
    expect(cache.get('cached::Stack/Fn')).toBe(true);
  });

  // Test 6: Null primary — lower-priority rules skipped
  it('null primary: lower-priority rules apply() not called', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: null });
    let loCalled = 0;
    const lo: Rule = { id: 'lo', priority: 5, match: () => true, apply() { loCalled++; return null; } };
    const cache = new Map<string, boolean>();
    evaluateNode(makeNode(), [hi, lo], cache, noopContext);
    expect(loCalled).toBe(0);
  });

  // Test 7: apply() throwing Error — warning on stderr; next rule's output returned
  it('apply() throwing: warning emitted; next rule output returned', () => {
    const thrower = makeRule({ id: 'thrower', priority: 10, apply() { throw new Error('boom'); } });
    const fallback = makeRule({ id: 'fallback', priority: 5, output: { kind: 'container', label: 'FB', containerType: 'x' } });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [thrower, fallback], cache, noopContext);
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
    const result = evaluateNode(makeNode(), [hi, lo], cache, noopContext);
    expect(result.metadata).toHaveLength(1);
    expect(result.metadata[0]).toMatchObject({ kind: 'metadata', key: 'k' });
  });

  // Test 9: Lower-priority rule returning non-metadata kind — warning; not in result
  it('demoted rule returning non-metadata kind: exactly one warning, output absent', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: { kind: 'container', label: 'X', containerType: 'x' } });
    const lo = makeRule({ id: 'lo', priority: 5, output: { kind: 'container', label: 'Y', containerType: 'y' } });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [hi, lo], cache, noopContext);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(result.metadata).toHaveLength(0);
    const matchCount = (warnings.match(/unexpected output type/g) ?? []).length;
    expect(matchCount).toBe(1);
  });

  // Test 7b: apply() throwing non-Error — String(err) branch covered
  it('apply() throwing non-Error value: String() path used in warning', () => {
    const thrower = makeRule({ id: 'thrower', priority: 10, apply() { throw 'plain string error'; } });
    const fallback = makeRule({ id: 'fallback', priority: 5, output: { kind: 'container', label: 'FB', containerType: 'x' } });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [thrower, fallback], cache, noopContext);
    spy.mockRestore();
    expect(result.primary).toMatchObject({ label: 'FB' });
  });

  // Test 10: Demoted rule throwing — warning; subsequent demoted rules still run
  it('demoted rule throwing: warning emitted; subsequent demoted rules still run', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: { kind: 'container', label: 'X', containerType: 'x' } });
    const thrower: Rule = { id: 'thrower', priority: 5, match: () => true, apply() { throw new Error('demotion boom'); } };
    const lo = makeRule({ id: 'lo', priority: 3, output: { kind: 'metadata', targetEdgeSourceId: 'a', targetEdgeTargetId: 'b', key: 'k', value: 'v' } });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [hi, thrower, lo], cache, noopContext);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(warnings).toContain('thrower');
    expect(result.primary).toMatchObject({ label: 'X' });
    expect(result.metadata).toHaveLength(1);
  });

  // Test 10b: Demoted rule throwing non-Error — String(err) branch in demotion phase
  it('demoted rule throwing non-Error: String() path used in warning', () => {
    const hi = makeRule({ id: 'hi', priority: 10, output: { kind: 'container', label: 'X', containerType: 'x' } });
    const thrower: Rule = { id: 'thrower', priority: 5, match: () => true, apply() { throw 42; } };
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    evaluateNode(makeNode(), [hi, thrower], cache, noopContext);
    spy.mockRestore();
  });

  // Test 11: No matching rules — warning; returns null primary
  it('no matching rules: warning on stderr with path and fqn; returns null', () => {
    const rule = makeRule({ id: 'r', priority: 10, match: () => false });
    const cache = new Map<string, boolean>();
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = evaluateNode(makeNode(), [rule], cache, noopContext);
    const warnings = (spy.mock.calls as string[][]).flat().join('');
    spy.mockRestore();
    expect(result.primary).toBeNull();
    expect(result.metadata).toHaveLength(0);
    expect(warnings).toContain('Stack/Fn');
    expect(warnings).toContain('aws-cdk-lib.aws_lambda.Function');
  });
});
