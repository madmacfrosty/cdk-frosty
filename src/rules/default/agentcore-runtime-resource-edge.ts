import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { parseCrossStackRef } from '../utils';

export const agentcoreRuntimeResourceEdgeRule: Rule = {
  id: 'default/agentcore-runtime-resource-edge',
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
      const fnImport = (value as Record<string, unknown>)['Fn::ImportValue'];
      if (typeof fnImport !== 'string') continue;

      const ref = parseCrossStackRef(fnImport);
      if (!ref) continue;

      const target = context.findContainer(ref.stackName + '/' + ref.constructId);
      if (target && target.id !== runtime.id) targetIds.add(target.id);
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: runtime.id, targetId, label: 'reads' })),
    };
  },
};
