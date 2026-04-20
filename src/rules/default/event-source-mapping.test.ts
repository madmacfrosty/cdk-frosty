import { eventSourceMappingRule } from './event-source-mapping';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

function container(id: string, type = 'queue'): ArchContainer {
  return { id, label: id, containerType: type, cdkPath: id, origin: 'synthesized', metadata: {} };
}

function makeEsmNode(props: Record<string, unknown>): CdkNode {
  return {
    id: 'SqsEventSource', path: 'Stack/Fn/SqsEventSource',
    fqn: 'aws-cdk-lib.aws_lambda.EventSourceMapping',
    children: [],
    attributes: {
      'aws:cdk:cloudformation:type': 'AWS::Lambda::EventSourceMapping',
      'aws:cdk:cloudformation:props': props,
    },
  };
}

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

describe('eventSourceMappingRule', () => {
  describe('match', () => {
    it('matches nodes with AWS::Lambda::EventSourceMapping cloudformation type', () => {
      expect(eventSourceMappingRule.match(makeEsmNode({}))).toBe(true);
    });

    it('does not match other cloudformation types', () => {
      const node: CdkNode = {
        id: 'Q', path: 'Stack/Q', fqn: 'aws-cdk-lib.aws_sqs.Queue', children: [], attributes: {
          'aws:cdk:cloudformation:type': 'AWS::SQS::Queue',
        },
      };
      expect(eventSourceMappingRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when props are missing', () => {
      const node: CdkNode = {
        id: 'ESM', path: 'Stack/Fn/ESM', fqn: 'x', children: [], attributes: {},
      };
      expect(eventSourceMappingRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when functionName has no Ref', () => {
      const node = makeEsmNode({
        functionName: 'my-function',
        eventSourceArn: { 'Fn::GetAtt': ['QueueABCDEF12', 'Arn'] },
      });
      expect(eventSourceMappingRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when lambda container not found', () => {
      const node = makeEsmNode({
        functionName: { Ref: 'LambdaFnABCDEF12' },
        eventSourceArn: { 'Fn::GetAtt': ['QueueABCDEF12', 'Arn'] },
      });
      expect(eventSourceMappingRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when eventSourceArn has no Fn::GetAtt', () => {
      const node = makeEsmNode({
        functionName: { Ref: 'LambdaFnABCDEF12' },
        eventSourceArn: 'arn:aws:sqs:us-east-1:123:my-queue',
      });
      const ctx: RuleContext = {
        findContainer: (id) => id === 'LambdaFn' ? container('Stack/LambdaFn', 'lambda') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(eventSourceMappingRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when source container not found', () => {
      const node = makeEsmNode({
        functionName: { Ref: 'LambdaFnABCDEF12' },
        eventSourceArn: { 'Fn::GetAtt': ['UnknownQueueABCDEF12', 'Arn'] },
      });
      const ctx: RuleContext = {
        findContainer: (id) => id === 'LambdaFn' ? container('Stack/LambdaFn', 'lambda') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(eventSourceMappingRule.apply(node, ctx)).toBeNull();
    });

    it('returns source→lambda triggers edge for SQS queue resolved via Fn::GetAtt', () => {
      const node = makeEsmNode({
        functionName: { Ref: 'LambdaFnABCDEF12' },
        eventSourceArn: { 'Fn::GetAtt': ['MyQueueABCDEF12', 'Arn'] },
      });
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'LambdaFn') return container('Stack/LambdaFn', 'lambda');
          if (id === 'MyQueue') return container('Stack/MyQueue', 'queue');
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = eventSourceMappingRule.apply(node, ctx);
      expect(result).toEqual({ kind: 'edge', sourceId: 'Stack/MyQueue', targetId: 'Stack/LambdaFn', label: 'triggers' });
    });

    it('works for DynamoDB stream as event source', () => {
      const node = makeEsmNode({
        functionName: { Ref: 'ProcessorFnABCDEF12' },
        eventSourceArn: { 'Fn::GetAtt': ['MyTableABCDEF12', 'StreamArn'] },
      });
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'ProcessorFn') return container('Stack/ProcessorFn', 'lambda');
          if (id === 'MyTable') return container('Stack/MyTable', 'dynamodb');
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = eventSourceMappingRule.apply(node, ctx);
      expect(result).toEqual({ kind: 'edge', sourceId: 'Stack/MyTable', targetId: 'Stack/ProcessorFn', label: 'triggers' });
    });
  });
});
