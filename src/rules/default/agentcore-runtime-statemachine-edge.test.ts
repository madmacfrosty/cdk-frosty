import { agentcoreRuntimeStateMachineEdgeRule } from './agentcore-runtime-statemachine-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function container(id: string): ArchContainer {
  return { id, label: id.split('/').at(-1) ?? id, containerType: 'test', cdkPath: id, metadata: {} };
}

function makeRuntimeNode(envVars: Record<string, unknown>, stack = 'AppStack'): CdkNode {
  const resource: CdkNode = {
    id: 'Resource',
    path: `${stack}/AgentCoreRuntime/Resource`,
    fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.CfnRuntime',
    children: [],
    attributes: { 'aws:cdk:cloudformation:props': { environmentVariables: envVars } },
  };
  return {
    id: 'AgentCoreRuntime',
    path: `${stack}/AgentCoreRuntime`,
    fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime',
    children: [resource],
    attributes: {},
  };
}

function makeCfnSmNode(smName: string, stack = 'AppStack'): CdkNode {
  return {
    id: 'Resource',
    path: `${stack}/LifecycleStateMachine/Resource`,
    parentPath: `${stack}/LifecycleStateMachine`,
    fqn: 'aws-cdk-lib.aws_stepfunctions.CfnStateMachine',
    children: [],
    attributes: { 'aws:cdk:cloudformation:props': { stateMachineName: smName } },
  };
}

describe('agentcoreRuntimeStateMachineEdgeRule', () => {
  describe('match', () => {
    it('matches @aws-cdk/aws-bedrock-agentcore-alpha.Runtime', () => {
      expect(agentcoreRuntimeStateMachineEdgeRule.match(makeRuntimeNode({}))).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'X', path: 'S/X', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(agentcoreRuntimeStateMachineEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no Resource child', () => {
      const node: CdkNode = { id: 'R', path: 'S/R', fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime', children: [], attributes: {} };
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when environmentVariables key is absent from props', () => {
      const resource: CdkNode = {
        id: 'Resource', path: 'AppStack/AgentCoreRuntime/Resource',
        fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.CfnRuntime', children: [],
        attributes: { 'aws:cdk:cloudformation:props': {} },
      };
      const node: CdkNode = {
        id: 'AgentCoreRuntime', path: 'AppStack/AgentCoreRuntime',
        fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime', children: [resource], attributes: {},
      };
      const ctx: RuleContext = {
        findContainer: () => container('AppStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('skips env vars whose state machine ARN has an empty name segment', () => {
      const node = makeRuntimeNode({ SM: 'arn:aws:states:us-east-1:123:stateMachine:' });
      const ctx: RuleContext = {
        findContainer: () => container('AppStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when no env var contains a state machine ARN', () => {
      const node = makeRuntimeNode({ SOME_VAR: 'arn:aws:s3:::my-bucket', OTHER: { Ref: 'X' } });
      const ctx: RuleContext = {
        findContainer: () => container('AppStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when runtime container is not found', () => {
      const node = makeRuntimeNode({ SM: 'arn:aws:states:us-east-1:123:stateMachine:MyMachine' });
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when findNodeWhere returns nothing', () => {
      const node = makeRuntimeNode({ SM: 'arn:aws:states:us-east-1:123:stateMachine:MyMachine' });
      const ctx: RuleContext = {
        findContainer: () => container('AppStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('emits a starts edge resolved via any env var key name', () => {
      const runtime = container('AppStack/AgentCoreRuntime');
      const sm = container('AppStack/LifecycleStateMachine');
      const cfnSmNode = makeCfnSmNode('MyMachine');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'AppStack/AgentCoreRuntime') return runtime;
          if (p === 'AppStack/LifecycleStateMachine') return sm;
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: (pred) => pred(cfnSmNode) ? cfnSmNode : undefined,
      };
      const node = makeRuntimeNode({ CUSTOM_KEY_NAME: 'arn:aws:states:us-east-1:123:stateMachine:MyMachine' });
      expect(agentcoreRuntimeStateMachineEdgeRule.apply(node, ctx)).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'AppStack/AgentCoreRuntime', targetId: 'AppStack/LifecycleStateMachine', label: 'starts' }],
      });
    });

    it('emits one edge per distinct state machine when multiple ARNs are present', () => {
      const runtime = container('AppStack/AgentCoreRuntime');
      const smA = container('AppStack/StateMachineA');
      const smB = container('AppStack/StateMachineB');
      const cfnA = makeCfnSmNode('MachineA', 'AppStack');
      const cfnB = { ...makeCfnSmNode('MachineB', 'AppStack'), path: 'AppStack/StateMachineB/Resource', parentPath: 'AppStack/StateMachineB' };
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'AppStack/AgentCoreRuntime') return runtime;
          if (p === 'AppStack/LifecycleStateMachine') return smA;
          if (p === 'AppStack/StateMachineB') return smB;
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: (pred) => {
          if (pred(cfnA)) return cfnA;
          if (pred(cfnB)) return cfnB;
          return undefined;
        },
      };
      const node = makeRuntimeNode({
        SM_A: 'arn:aws:states:us-east-1:123:stateMachine:MachineA',
        SM_B: 'arn:aws:states:us-east-1:123:stateMachine:MachineB',
      });
      const result = agentcoreRuntimeStateMachineEdgeRule.apply(node, ctx) as { kind: string; items: unknown[] };
      expect(result?.kind).toBe('edges');
      expect(result?.items).toHaveLength(2);
    });
  });
});
