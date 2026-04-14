import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';

function findChild(node: CdkNode, id: string): CdkNode | undefined {
  return node.children.find(c => c.id === id);
}

export const agentcoreRuntimeRule: Rule = {
  id: 'default/agentcore-runtime',
  priority: 50,
  match(node) {
    return node.fqn === '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'agentcore-runtime' };
  },
};

export const lambdaAgentcoreEdgeRule: Rule = {
  id: 'default/lambda-agentcore-edge',
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

    const invokesRuntime = statements.some(stmt => {
      const s = stmt as Record<string, unknown>;
      const actions = Array.isArray(s['Action']) ? s['Action'] : [s['Action']];
      return actions.some((a: unknown) => typeof a === 'string' && a.startsWith('bedrock-agentcore:Invoke'));
    });

    if (!invokesRuntime) return null;

    const runtime = context.findContainer('AgentCoreRuntime');
    if (!runtime) return null;

    return { kind: 'edge', sourceId: node.path, targetId: runtime.id, label: 'invokes' };
  },
};
