import { lambdaApiInvokeEdgeRule } from './lambda-apigw-invoke-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function container(id: string): ArchContainer {
  return { id, label: id.split('/').at(-1) ?? id, containerType: 'test', cdkPath: id, origin: 'synthesized', metadata: {} };
}

function makeLambdaNode(statements: unknown[]): CdkNode {
  const policyResource: CdkNode = {
    id: 'Resource', path: 'Stack/Fn/ServiceRole/DefaultPolicy/Resource',
    fqn: 'aws-cdk-lib.aws_iam.CfnPolicy', children: [],
    attributes: { 'aws:cdk:cloudformation:props': { policyDocument: { Statement: statements } } },
  };
  const defaultPolicy: CdkNode = { id: 'DefaultPolicy', path: 'Stack/Fn/ServiceRole/DefaultPolicy', fqn: 'x', children: [policyResource], attributes: {} };
  const serviceRole: CdkNode = { id: 'ServiceRole', path: 'Stack/Fn/ServiceRole', fqn: 'x', children: [defaultPolicy], attributes: {} };
  return { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [serviceRole], attributes: {} };
}

// execute-api resource: API ID embedded via Fn::ImportValue inside an ARN Fn::Join
function apiResource(stackName: string, constructId: string): unknown {
  return {
    'Fn::Join': ['', [
      'arn:aws:execute-api:us-east-1:123:',
      { 'Fn::ImportValue': `${stackName}:ExportsOutputRef${constructId}ABCDEF1234567890` },
      '/*/*',
    ]],
  };
}

describe('lambdaApiInvokeEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_lambda.Function', () => {
      expect(lambdaApiInvokeEdgeRule.match(makeLambdaNode([]))).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'Q', path: 'S/Q', fqn: 'aws-cdk-lib.aws_sqs.Queue', children: [], attributes: {} };
      expect(lambdaApiInvokeEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no ServiceRole/DefaultPolicy/Resource child exists', () => {
      const node: CdkNode = { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(lambdaApiInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no execute-api:Invoke action present', () => {
      const node = makeLambdaNode([{ Action: 'lambda:InvokeFunction', Resource: apiResource('ApiStack', 'MyApi') }]);
      expect(lambdaApiInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when resource has no Fn::ImportValue', () => {
      const node = makeLambdaNode([{ Action: 'execute-api:Invoke', Resource: 'arn:aws:execute-api:us-east-1:123:abc123/stage/GET/' }]);
      expect(lambdaApiInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when parseCrossStackRef fails', () => {
      const node = makeLambdaNode([{
        Action: 'execute-api:Invoke',
        Resource: { 'Fn::Join': ['', ['arn::', { 'Fn::ImportValue': 'no-colon-here' }, '/*/*']] },
      }]);
      expect(lambdaApiInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when API container is not found', () => {
      const node = makeLambdaNode([{ Action: 'execute-api:Invoke', Resource: apiResource('ApiStack', 'MyApi') }]);
      expect(lambdaApiInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns an invokes edge to a WebSocket API resolved via cross-stack import', () => {
      const api = container('ChatStack/ChatWebSocketApi');
      const ctx: RuleContext = {
        findContainer: (p) => p === 'ChatStack/ChatWebSocketApi' ? api : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([{ Action: 'execute-api:Invoke', Resource: apiResource('ChatStack', 'ChatWebSocketApi') }]);
      expect(lambdaApiInvokeEdgeRule.apply(node, ctx)).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'Stack/Fn', targetId: 'ChatStack/ChatWebSocketApi', label: 'invokes' }],
      });
    });

    it('returns an invokes edge to a REST API resolved via cross-stack import', () => {
      const api = container('RestStack/ServiceRestApi');
      const ctx: RuleContext = {
        findContainer: (p) => p === 'RestStack/ServiceRestApi' ? api : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([{ Action: 'execute-api:Invoke', Resource: apiResource('RestStack', 'ServiceRestApi') }]);
      expect(lambdaApiInvokeEdgeRule.apply(node, ctx)).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'Stack/Fn', targetId: 'RestStack/ServiceRestApi', label: 'invokes' }],
      });
    });

    it('deduplicates multiple resource entries for the same API', () => {
      const api = container('ApiStack/MyApi');
      const ctx: RuleContext = {
        findContainer: (p) => p === 'ApiStack/MyApi' ? api : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([{
        Action: 'execute-api:Invoke',
        Resource: [apiResource('ApiStack', 'MyApi'), apiResource('ApiStack', 'MyApi')],
      }]);
      const result = lambdaApiInvokeEdgeRule.apply(node, ctx) as { kind: string; items: unknown[] };
      expect(result.items).toHaveLength(1);
    });

    it('emits edges to multiple distinct APIs in one statement', () => {
      const wsApi = container('ChatStack/ChatWebSocketApi');
      const restApi = container('RestStack/ServiceRestApi');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'ChatStack/ChatWebSocketApi') return wsApi;
          if (p === 'RestStack/ServiceRestApi') return restApi;
          return undefined;
        },
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([{
        Action: 'execute-api:Invoke',
        Resource: [apiResource('ChatStack', 'ChatWebSocketApi'), apiResource('RestStack', 'ServiceRestApi')],
      }]);
      const result = lambdaApiInvokeEdgeRule.apply(node, ctx) as { kind: string; items: unknown[] };
      expect(result.kind).toBe('edges');
      expect(result.items).toHaveLength(2);
    });
  });
});
