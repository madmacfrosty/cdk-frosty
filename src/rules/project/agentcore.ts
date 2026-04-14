import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { parseArnName } from '../utils';

function findChild(node: CdkNode, id: string): CdkNode | undefined {
  return node.children.find(c => c.id === id);
}

export const lambdaAgentcoreEdgeRule: Rule = {
  id: 'project/lambda-agentcore-edge',
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

export const agentcoreRuntimeStateMachineEdgeRule: Rule = {
  id: 'project/agentcore-runtime-statemachine-edge',
  priority: 50,
  match(node) {
    return node.fqn === '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const resource = node.children.find(c => c.id === 'Resource');
    if (!resource) return null;

    const props = resource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const envVars = props?.environmentVariables as Record<string, unknown> | undefined;
    const smArn = envVars?.['LIFECYCLE_STATE_MACHINE_ARN'];
    if (typeof smArn !== 'string') return null;

    const smName = parseArnName(smArn);
    if (!smName) return null;

    const runtime = context.findContainer(node.path);
    if (!runtime) return null;

    const cfnSm = context.findNodeWhere(n =>
      (n.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined)
        ?.['stateMachineName'] === smName
    );
    if (!cfnSm?.parentPath) return null;
    const sm = context.findContainer(cfnSm.parentPath);
    if (!sm) return null;

    return { kind: 'edge', sourceId: runtime.id, targetId: sm.id, label: 'starts' };
  },
};

export const agentcoreSecretsEdgeRule: Rule = {
  id: 'project/agentcore-secrets-edge',
  priority: 50,
  match(node) {
    return node.fqn === '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const resource = node.children.find(c => c.id === 'Resource');
    if (!resource) return null;

    const props = resource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const envVars = props?.environmentVariables as Record<string, unknown> | undefined;
    if (!envVars) return null;

    const runtime = context.findContainer(node.path);
    if (!runtime) return null;

    const targetIds = new Set<string>();

    for (const value of Object.values(envVars)) {
      if (!value || typeof value !== 'object') continue;
      const importValue = (value as Record<string, unknown>)['Fn::ImportValue'];
      if (typeof importValue !== 'string') continue;

      const colonIdx = importValue.indexOf(':');
      if (colonIdx < 0) continue;
      const stackName = importValue.slice(0, colonIdx);
      const exportName = importValue.slice(colonIdx + 1);

      const match = exportName.match(/ExportsOutputRef([A-Za-z0-9]+?)[A-F0-9]{8}[A-F0-9]{8}$/);
      if (!match) continue;

      const target = context.findContainer(stackName + '/' + match[1]);
      if (target && target.id !== runtime.id) targetIds.add(target.id);
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: runtime.id, targetId, label: 'reads' })),
    };
  },
};
