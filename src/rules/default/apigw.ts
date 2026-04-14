import { Rule } from '../../engine/types';

export const apigwRestRule: Rule = {
  id: 'default/apigw-rest',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_apigateway.SpecRestApi';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'apigw-rest' };
  },
};

export const apigwWebSocketRule: Rule = {
  id: 'default/apigw-websocket',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_apigatewayv2.WebSocketApi';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'apigw-websocket' };
  },
};
