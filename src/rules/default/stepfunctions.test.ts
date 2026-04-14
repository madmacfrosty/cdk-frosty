import { stateMachineRule, stateMachineLambdaEdgeRule } from './stepfunctions';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined };

function makeNode(fqn: string, path: string, attributes: Record<string, unknown> = {}): CdkNode {
  return { id: path.split('/').pop()!, path, fqn, children: [], attributes };
}

function container(id: string): ArchContainer {
  return { id, label: id, containerType: 'state-machine', cdkPath: id, metadata: {} };
}

function makeCfnStateMachineNode(path: string, definitionParts: unknown[]): CdkNode {
  return makeNode('aws-cdk-lib.aws_stepfunctions.CfnStateMachine', path, {
    'aws:cdk:cloudformation:props': {
      definitionString: { 'Fn::Join': ['', definitionParts] },
    },
  });
}

describe('stateMachineRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_stepfunctions.StateMachine', () => {
      expect(stateMachineRule.match(makeNode('aws-cdk-lib.aws_stepfunctions.StateMachine', 'Stack/SM'))).toBe(true);
    });

    it('does not match CfnStateMachine', () => {
      expect(stateMachineRule.match(makeNode('aws-cdk-lib.aws_stepfunctions.CfnStateMachine', 'Stack/SM/Resource'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns a state-machine container with node id as label', () => {
      const result = stateMachineRule.apply(makeNode('aws-cdk-lib.aws_stepfunctions.StateMachine', 'Stack/SM', {}), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'SM', containerType: 'state-machine' });
    });
  });
});

describe('stateMachineLambdaEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_stepfunctions.CfnStateMachine', () => {
      expect(stateMachineLambdaEdgeRule.match(makeNode('aws-cdk-lib.aws_stepfunctions.CfnStateMachine', 'Stack/SM/Resource'))).toBe(true);
    });

    it('does not match StateMachine L2', () => {
      expect(stateMachineLambdaEdgeRule.match(makeNode('aws-cdk-lib.aws_stepfunctions.StateMachine', 'Stack/SM'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when state machine container not found', () => {
      const node = makeCfnStateMachineNode('Stack/SM/Resource', []);
      expect(stateMachineLambdaEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when definitionString has no Fn::Join', () => {
      const node = makeNode('aws-cdk-lib.aws_stepfunctions.CfnStateMachine', 'Stack/SM/Resource', {
        'aws:cdk:cloudformation:props': { definitionString: '{}' },
      });
      const ctx: RuleContext = { findContainer: (id) => id === 'Stack/SM' ? container('Stack/SM') : undefined, findNode: () => undefined };
      expect(stateMachineLambdaEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns edges to lambdas referenced via Fn::GetAtt in definition', () => {
      // StateMachine definition Fn::Join contains Fn::GetAtt refs to Lambda logical IDs
      const node = makeCfnStateMachineNode('Stack/SM/Resource', [
        '{"StartAt":"Step1","States":{"Step1":{"Resource":{"Fn::GetAtt":["',
        { 'Fn::GetAtt': ['ProcessorFnABCDEF12', 'Arn'] },
        '"}}}}',
      ]);
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'Stack/SM') return container('Stack/SM');
          if (id === 'ProcessorFn') return container('Stack/ProcessorFn');
          return undefined;
        },
        findNode: () => undefined,
      };
      const result = stateMachineLambdaEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edges', items: [{ sourceId: 'Stack/SM', targetId: 'Stack/ProcessorFn', label: 'invokes' }] });
    });

    it('returns null when no lambda containers found in definition', () => {
      const node = makeCfnStateMachineNode('Stack/SM/Resource', [
        { 'Fn::GetAtt': ['UnknownConstructABCDEF12', 'Arn'] },
      ]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/SM' ? container('Stack/SM') : undefined,
        findNode: () => undefined,
      };
      expect(stateMachineLambdaEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('deduplicates multiple references to the same lambda', () => {
      const node = makeCfnStateMachineNode('Stack/SM/Resource', [
        { 'Fn::GetAtt': ['ProcessorFnABCDEF12', 'Arn'] },
        { 'Fn::GetAtt': ['ProcessorFnABCDEF12', 'Arn'] },
      ]);
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'Stack/SM') return container('Stack/SM');
          if (id === 'ProcessorFn') return container('Stack/ProcessorFn');
          return undefined;
        },
        findNode: () => undefined,
      };
      const result = stateMachineLambdaEdgeRule.apply(node, ctx) as { kind: 'edges'; items: unknown[] };
      expect(result.items).toHaveLength(1);
    });
  });
});
