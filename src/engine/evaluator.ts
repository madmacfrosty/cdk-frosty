import { CdkNode } from '../parser/types';
import { Rule, RuleContext, RuleOutput } from './types';

export function evaluateNode(
  node: CdkNode,
  rules: Rule[],
  pass: 1 | 2,
  matchCache: Map<string, boolean>,
  context: RuleContext
): { primary: RuleOutput; metadata: RuleOutput[] } {
  // Build list of matching rules (with original index for tie-breaking)
  const matching: Array<{ rule: Rule; index: number }> = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const cacheKey = `${rule.id}::${node.path}`;

    let matched: boolean;
    if (pass === 1) {
      matched = rule.match(node);
      matchCache.set(cacheKey, matched);
    } else {
      matched = matchCache.get(cacheKey) ?? false;
    }

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

  // Determine expected kinds for this pass
  const pass1Kinds = new Set(['container', 'group']);
  const pass2Kinds = new Set(['edge', 'metadata']);

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

    // Check pass filter
    const kind = result.kind;
    const validForPass = pass === 1 ? pass1Kinds.has(kind) : pass2Kinds.has(kind);
    if (!validForPass) {
      // Wrong pass — treat as no primary for this pass
      return { primary: null, metadata: [] };
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

    if (result.kind === 'metadata') {
      metadata.push(result);
    } else {
      process.stderr.write(
        `Warning: rule "${rule.id}" produced unexpected output type "${result.kind}" on node "${node.path}"; discarding\n`
      );
    }
  }

  return { primary: primaryResult, metadata };
}
