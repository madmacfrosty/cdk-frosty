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

// StateMachine → Lambda edges: extract Fn::GetAtt refs from definition Fn::Join parts
export const stateMachineLambdaEdgeRule: Rule = {
  id: 'default/state-machine-lambda-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_stepfunctions.CfnStateMachine';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    // StateMachine container is the parent node
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

// AgentCoreRuntime → StateMachine edge: Runtime has LIFECYCLE_STATE_MACHINE_ARN env var
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
    if (!envVars?.['LIFECYCLE_STATE_MACHINE_ARN']) return null;

    const runtime = context.findContainer(node.path);
    const sm = context.findContainer('LifecycleStateMachine');
    if (!runtime || !sm) return null;

    return { kind: 'edge', sourceId: runtime.id, targetId: sm.id, label: 'starts' };
  },
};
