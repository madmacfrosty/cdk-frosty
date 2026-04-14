import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { stripCdkHash } from '../utils';

function findChild(node: CdkNode, id: string): CdkNode | undefined {
  return node.children.find(c => c.id === id);
}

export const ssmParameterRule: Rule = {
  id: 'default/ssm-parameter',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_ssm.StringParameter';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'ssm-parameter' };
  },
};

// Lambda → SSM edge: Lambda policy has ssm:PutParameter or ssm:GetParameter actions
export const lambdaSsmEdgeRule: Rule = {
  id: 'default/lambda-ssm-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const policyResource =
      findChild(findChild(findChild(node, 'ServiceRole') ?? node, 'DefaultPolicy') ?? node, 'Resource');
    if (!policyResource) return null;

    const props = policyResource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const statements = (props?.policyDocument as { Statement?: unknown[] } | undefined)?.Statement;
    if (!statements) return null;

    const ssmActions = new Set(['ssm:PutParameter', 'ssm:GetParameter', 'ssm:GetParametersByPath',
      'ssm:DeleteParameter', 'ssm:DescribeParameters']);
    const targetIds = new Set<string>();

    for (const stmt of statements) {
      const s = stmt as Record<string, unknown>;
      const actions = Array.isArray(s['Action']) ? s['Action'] : [s['Action']];
      const hasSsm = actions.some((a: unknown) => typeof a === 'string' && ssmActions.has(a));
      if (!hasSsm) continue;

      // Resources may be ARN strings with Fn::Join containing a Ref to the parameter construct
      const resources = Array.isArray(s['Resource']) ? s['Resource'] : [s['Resource']];
      for (const res of resources) {
        if (!res || typeof res !== 'object') continue;
        const join = (res as Record<string, unknown>)['Fn::Join'];
        if (!Array.isArray(join) || !Array.isArray(join[1])) continue;
        for (const part of join[1] as unknown[]) {
          if (!part || typeof part !== 'object') continue;
          const ref = (part as Record<string, unknown>)['Ref'];
          if (typeof ref !== 'string') continue;
          const constructId = stripCdkHash(ref);
          const target = context.findContainer(constructId);
          if (target) targetIds.add(target.id);
        }
      }
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: node.path, targetId, label: 'writes' })),
    };
  },
};
