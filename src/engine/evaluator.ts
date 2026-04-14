import { CdkNode } from '../parser/types';
import { Rule, RuleContext, RuleOutput } from './types';

export function evaluateNode(
  node: CdkNode,
  rules: Rule[],
  matchCache: Map<string, boolean>,
  context: RuleContext
): { primary: RuleOutput; metadata: RuleOutput[] } {
  // Build list of matching rules (with original index for tie-breaking)
  const matching: Array<{ rule: Rule; index: number }> = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const cacheKey = `${rule.id}::${node.path}`;
    const matched = rule.match(node);
    matchCache.set(cacheKey, matched);
    if (matched) {
      matching.push({ rule, index: i });
    }
  }

  if (matching.length === 0) {
    process.stderr.write(`Warning: no rule matched CDK node "${node.path}" (fqn: ${node.fqn})\n`);
    return { primary: null, metadata: [] };
  }

  // Sort by priority desc, then by original index asc (ADR-5)
  matching.sort((a, b) =>
    b.rule.priority !== a.rule.priority
      ? b.rule.priority - a.rule.priority
      : a.index - b.index
  );

  const primaryKinds = new Set(['container', 'group']);

  // Try each rule in order until we get a valid primary
  let primaryResult: RuleOutput = null;
  let primaryFound = false;
  let startDemotionAt = 0;

  for (let i = 0; i < matching.length; i++) {
    const { rule } = matching[i];
    let result: RuleOutput;
    try {
      result = rule.apply(node, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: rule "${rule.id}" threw on node "${node.path}": ${msg}\n`);
      continue;
    }

    if (result === null) {
      // null primary — skip all remaining
      return { primary: null, metadata: [] };
    }

    if (!primaryKinds.has(result.kind)) {
      continue;
    }

    primaryResult = result;
    primaryFound = true;
    startDemotionAt = i + 1;
    break;
  }

  if (!primaryFound) {
    return { primary: null, metadata: [] };
  }

  // Demotion: process remaining rules
  const metadata: RuleOutput[] = [];
  for (let i = startDemotionAt; i < matching.length; i++) {
    const { rule } = matching[i];
    let result: RuleOutput;
    try {
      result = rule.apply(node, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: rule "${rule.id}" threw on node "${node.path}": ${msg}\n`);
      continue;
    }

    if (result === null) continue;

    if (result.kind === 'metadata' || result.kind === 'group') {
      metadata.push(result);
    } else {
      process.stderr.write(
        `Warning: rule "${rule.id}" produced unexpected output type "${result.kind}" on node "${node.path}"; discarding\n`
      );
    }
  }

  return { primary: primaryResult, metadata };
}
