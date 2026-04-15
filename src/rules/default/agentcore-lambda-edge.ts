import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { parseCrossStackRef } from '../utils';

function extractFnImportValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;

  if (typeof v['Fn::ImportValue'] === 'string') return v['Fn::ImportValue'];

  // Also check inside Fn::Join parts (CDK emits both the ARN and ARN/* as resources)
  const join = v['Fn::Join'];
  if (Array.isArray(join) && Array.isArray(join[1])) {
    for (const part of join[1] as unknown[]) {
      const nested = extractFnImportValue(part);
      if (nested) return nested;
    }
  }
  return undefined;
}

export const lambdaAgentcoreEdgeRule: Rule = {
  id: 'default/lambda-agentcore-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const serviceRole = node.children.find(c => c.id === 'ServiceRole');
    const defaultPolicy = serviceRole?.children.find(c => c.id === 'DefaultPolicy');
    const policyResource = defaultPolicy?.children.find(c => c.id === 'Resource');
    if (!policyResource) return null;

    const props = policyResource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const statements = (props?.policyDocument as { Statement?: unknown[] } | undefined)?.Statement;
    if (!statements) return null;

    const targetIds = new Set<string>();

    for (const stmt of statements) {
      const s = stmt as Record<string, unknown>;
      const actions = Array.isArray(s['Action']) ? s['Action'] : [s['Action']];
      if (!actions.some((a: unknown) => typeof a === 'string' && a.startsWith('bedrock-agentcore:Invoke'))) continue;

      const resources = Array.isArray(s['Resource']) ? s['Resource'] : [s['Resource']];
      for (const res of resources) {
        const importValue = extractFnImportValue(res);
        if (!importValue) continue;

        const ref = parseCrossStackRef(importValue);
        if (!ref) continue;

        const runtime = context.findContainer(ref.stackName + '/' + ref.constructId);
        if (runtime) targetIds.add(runtime.id);
      }
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: node.path, targetId, label: 'invokes' })),
    };
  },
};
