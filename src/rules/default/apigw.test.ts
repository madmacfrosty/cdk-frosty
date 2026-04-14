import { apigwRestRule, apigwWebSocketRule } from './apigw';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined };

function makeNode(fqn: string, id = 'Api'): CdkNode {
  return { id, path: 'Stack/Api', fqn, children: [], attributes: {} };
}

describe('apigwRestRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_apigateway.SpecRestApi', () => {
      expect(apigwRestRule.match(makeNode('aws-cdk-lib.aws_apigateway.SpecRestApi'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(apigwRestRule.match(makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns an apigw-rest container with node id as label', () => {
      const result = apigwRestRule.apply(makeNode('aws-cdk-lib.aws_apigateway.SpecRestApi', 'MyApi'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'MyApi', containerType: 'apigw-rest' });
    });
  });
});

describe('apigwWebSocketRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_apigatewayv2.WebSocketApi', () => {
      expect(apigwWebSocketRule.match(makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(apigwWebSocketRule.match(makeNode('aws-cdk-lib.aws_apigateway.SpecRestApi'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns an apigw-websocket container with node id as label', () => {
      const result = apigwWebSocketRule.apply(makeNode('aws-cdk-lib.aws_apigatewayv2.WebSocketApi', 'WsApi'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'WsApi', containerType: 'apigw-websocket' });
    });
  });
});
