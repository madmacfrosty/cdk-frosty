import { apigwRestEdgeRule, apigwWebSocketEdgeRule } from './apigw-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

function container(id: string): ArchContainer {
  return { id, label: id, containerType: 'apigw-rest', cdkPath: id, metadata: {} };
}

function makeNode(fqn: string, path: string, props: Record<string, unknown> = {}, children: CdkNode[] = []): CdkNode {
  return {
    id: path.split('/').pop()!,
    path, fqn, children,
    attributes: { 'aws:cdk:cloudformation:props': props },
  };
}

// REST edge: CfnPermission node with apigateway principal and sourceArn Fn::Join containing a Ref
function makeCfnPermissionNode(apiLogicalId: string): CdkNode {
  return makeNode('aws-cdk-lib.aws_lambda.CfnPermission', 'Stack/Fn/ApiPermission', {
    principal: 'apigateway.amazonaws.com',
    sourceArn: {
      'Fn::Join': ['', [
        'arn:aws:execute-api:us-east-1:123:',
        { Ref: apiLogicalId },
        '/*/GET/',
      ]],
    },
  });
}

// WebSocket edge: WebSocketApi node with CfnIntegration children containing Fn::GetAtt Lambda ref
function makeWebSocketNode(lambdaLogicalId: string): CdkNode {
  const integration = makeNode(
    'aws-cdk-lib.aws_apigatewayv2.CfnIntegration',
    'Stack/WsApi/Integration',
    {
      integrationUri: {
        'Fn::Join': ['', [
          'arn:aws:apigateway:us-east-1:lambda:path/functions/',
          { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] },
          '/invocations',
        ]],
      },
    }
  );
  return makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'Stack/WsApi', {}, [integration]);
}

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

describe('apigwRestEdgeRule', () => {
  describe('match', () => {
    it('matches CfnPermission with apigateway.amazonaws.com principal', () => {
      const node = makeCfnPermissionNode('MyApiABCDEF12');
      expect(apigwRestEdgeRule.match(node)).toBe(true);
    });

    it('does not match CfnPermission with a different principal', () => {
      const node = makeNode('aws-cdk-lib.aws_lambda.CfnPermission', 'Stack/Fn/Perm', {
        principal: 'events.amazonaws.com',
      });
      expect(apigwRestEdgeRule.match(node)).toBe(false);
    });

    it('does not match other fqns', () => {
      const node = makeNode('aws-cdk-lib.aws_lambda.Function', 'Stack/Fn');
      expect(apigwRestEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when lambda container not found', () => {
      const node = makeCfnPermissionNode('MyApiABCDEF12');
      expect(apigwRestEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when sourceArn is an object without Fn::Join', () => {
      const node = makeNode('aws-cdk-lib.aws_lambda.CfnPermission', 'Stack/Fn/Perm', {
        principal: 'apigateway.amazonaws.com',
        sourceArn: { 'Fn::Sub': 'arn:aws:execute-api:us-east-1:123:abc/stage/GET/' },
      });
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/Fn' ? container('Stack/Fn') : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(apigwRestEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when sourceArn Fn::Join parts have no Ref key', () => {
      const node = makeNode('aws-cdk-lib.aws_lambda.CfnPermission', 'Stack/Fn/Perm', {
        principal: 'apigateway.amazonaws.com',
        sourceArn: { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['MyApiABCDEF12', 'RootResourceId'] }]] },
      });
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/Fn' ? container('Stack/Fn') : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(apigwRestEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when sourceArn has no Fn::Join Ref', () => {
      const node = makeNode('aws-cdk-lib.aws_lambda.CfnPermission', 'Stack/Fn/Perm', {
        principal: 'apigateway.amazonaws.com',
        sourceArn: 'arn:aws:execute-api:us-east-1:123:abc123',
      });
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/Fn' ? container('Stack/Fn') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(apigwRestEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when API container not found', () => {
      const node = makeCfnPermissionNode('MyApiABCDEF12');
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/Fn' ? container('Stack/Fn') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(apigwRestEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns API→Lambda invokes edge when both containers found', () => {
      const node = makeCfnPermissionNode('MyApiABCDEF12');
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'Stack/Fn') return container('Stack/Fn');
          if (id === 'MyApi') return container('Stack/MyApi');
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = apigwRestEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edge', sourceId: 'Stack/MyApi', targetId: 'Stack/Fn', label: 'invokes' });
    });
  });
});

describe('apigwWebSocketEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_apigatewayv2.WebSocketApi', () => {
      const node = makeWebSocketNode('FnABCDEF12');
      expect(apigwWebSocketEdgeRule.match(node)).toBe(true);
    });

    it('does not match other fqns', () => {
      const node = makeNode('aws-cdk-lib.aws_apigateway.SpecRestApi', 'Stack/Api');
      expect(apigwWebSocketEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when the WebSocketApi container itself is not found', () => {
      const node = makeWebSocketNode('FnABCDEF12');
      expect(apigwWebSocketEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no CfnIntegration children exist', () => {
      const node = makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'Stack/WsApi');
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/WsApi' ? container('Stack/WsApi') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(apigwWebSocketEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when CfnIntegration has no integrationUri', () => {
      const integration = makeNode('aws-cdk-lib.aws_apigatewayv2.CfnIntegration', 'Stack/WsApi/Integration', {});
      const node = makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'Stack/WsApi', {}, [integration]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/WsApi' ? container('Stack/WsApi') : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(apigwWebSocketEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when CfnIntegration integrationUri is an object without Fn::Join', () => {
      const integration = makeNode(
        'aws-cdk-lib.aws_apigatewayv2.CfnIntegration', 'Stack/WsApi/Integration',
        { integrationUri: { 'Fn::Sub': 'arn:aws:apigateway:us-east-1:lambda:path/functions/arn/invocations' } },
      );
      const node = makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'Stack/WsApi', {}, [integration]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/WsApi' ? container('Stack/WsApi') : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(apigwWebSocketEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when CfnIntegration Fn::Join parts have no Fn::GetAtt key', () => {
      const integration = makeNode(
        'aws-cdk-lib.aws_apigatewayv2.CfnIntegration', 'Stack/WsApi/Integration',
        { integrationUri: { 'Fn::Join': ['', [{ Ref: 'SomethingABCDEF12' }]] } },
      );
      const node = makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'Stack/WsApi', {}, [integration]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/WsApi' ? container('Stack/WsApi') : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(apigwWebSocketEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when integration lambda container not found', () => {
      const node = makeWebSocketNode('UnknownFnABCDEF12');
      const ctx: RuleContext = {
        findContainer: (id) => id === 'Stack/WsApi' ? container('Stack/WsApi') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(apigwWebSocketEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns WebSocketApi→Lambda invokes edge via CfnIntegration', () => {
      const node = makeWebSocketNode('HandlerFnABCDEF12');
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'Stack/WsApi') return container('Stack/WsApi');
          if (id === 'HandlerFn') return container('Stack/HandlerFn');
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = apigwWebSocketEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({
        kind: 'edges',
        items: [{ sourceId: 'Stack/WsApi', targetId: 'Stack/HandlerFn', label: 'invokes' }],
      });
    });

    it('deduplicates multiple integrations pointing to the same lambda', () => {
      const integration1 = makeNode('aws-cdk-lib.aws_apigatewayv2.CfnIntegration', 'Stack/WsApi/Int1', {
        integrationUri: { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['HandlerFnABCDEF12', 'Arn'] }]] },
      });
      const integration2 = makeNode('aws-cdk-lib.aws_apigatewayv2.CfnIntegration', 'Stack/WsApi/Int2', {
        integrationUri: { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['HandlerFnABCDEF12', 'Arn'] }]] },
      });
      const node = makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'Stack/WsApi', {}, [integration1, integration2]);
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'Stack/WsApi') return container('Stack/WsApi');
          if (id === 'HandlerFn') return container('Stack/HandlerFn');
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = apigwWebSocketEdgeRule.apply(node, ctx) as { kind: 'edges'; items: unknown[] };
      expect(result.items).toHaveLength(1);
    });
  });
});
