import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { parseArnName } from '../utils';

export const agentcoreRuntimeStateMachineEdgeRule: Rule = {
  id: 'default/agentcore-runtime-statemachine-edge',
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
      if (typeof value !== 'string' || !value.includes(':stateMachine:')) continue;

      const smName = parseArnName(value);
      if (!smName) continue;

      const cfnSm = context.findNodeWhere(n =>
        (n.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined)
          ?.['stateMachineName'] === smName
      );
      if (!cfnSm?.parentPath) continue;

      const sm = context.findContainer(cfnSm.parentPath);
      if (sm) targetIds.add(sm.id);
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: runtime.id, targetId, label: 'starts' })),
    };
  },
};
