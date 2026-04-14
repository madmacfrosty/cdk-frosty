import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';

export const stateMachineRule: Rule = {
  id: 'default/state-machine',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_stepfunctions.StateMachine';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'state-machine' };
  },
};

export const stateMachineLambdaEdgeRule: Rule = {
  id: 'default/state-machine-lambda-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_stepfunctions.CfnStateMachine';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const smPath = node.path.split('/').slice(0, -1).join('/');
    const sm = context.findContainer(smPath);
    if (!sm) return null;

    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const parts = (props?.definitionString as Record<string, unknown> | undefined)?.['Fn::Join'];
    if (!Array.isArray(parts) || !Array.isArray(parts[1])) return null;

    const targetIds = new Set<string>();
    for (const part of parts[1] as unknown[]) {
      if (!part || typeof part !== 'object') continue;
      const getAtt = (part as Record<string, unknown>)['Fn::GetAtt'];
      if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') continue;
      const constructId = (getAtt[0] as string).replace(/[A-F0-9]{8}$/, '');
      const target = context.findContainer(constructId);
      if (target && target.id !== sm.id) targetIds.add(target.id);
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: sm.id, targetId, label: 'invokes' })),
    };
  },
};
