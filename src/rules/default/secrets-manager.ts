import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';

export const secretsManagerRule: Rule = {
  id: 'default/secrets-manager',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_secretsmanager.Secret';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'secret' };
  },
};

// AgentCoreRuntime → Secret edge: env vars contain secret ARN as Fn::ImportValue
export const agentcoreSecretsEdgeRule: Rule = {
  id: 'default/agentcore-secrets-edge',
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
