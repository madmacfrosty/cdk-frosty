import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { stripCdkHash } from '../utils';

function findRefInJoin(join: unknown): string | null {
  if (!join || typeof join !== 'object') return null;
  const parts = (join as Record<string, unknown>)['Fn::Join'];
  if (!Array.isArray(parts) || !Array.isArray(parts[1])) return null;
  for (const item of parts[1] as unknown[]) {
    if (item && typeof item === 'object') {
      const ref = (item as Record<string, unknown>)['Ref'];
      if (typeof ref === 'string') return ref;
    }
  }
  return null;
}

function findGetAttInJoin(join: unknown): string | null {
  if (!join || typeof join !== 'object') return null;
  const parts = (join as Record<string, unknown>)['Fn::Join'];
  if (!Array.isArray(parts) || !Array.isArray(parts[1])) return null;
  for (const item of parts[1] as unknown[]) {
    if (item && typeof item === 'object') {
      const getAtt = (item as Record<string, unknown>)['Fn::GetAtt'];
      if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') return getAtt[0];
    }
  }
  return null;
}

function walkForCfnIntegrations(node: CdkNode, results: CdkNode[] = []): CdkNode[] {
  if (node.fqn === 'aws-cdk-lib.aws_apigatewayv2.CfnIntegration') results.push(node);
  for (const child of node.children) walkForCfnIntegrations(child, results);
  return results;
}

// REST API edge: CfnPermission with principal=apigateway.amazonaws.com
export const apigwRestEdgeRule: Rule = {
  id: 'default/apigw-rest-edge',
  priority: 50,
  match(node) {
    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    return (
      node.fqn === 'aws-cdk-lib.aws_lambda.CfnPermission' &&
      props?.['principal'] === 'apigateway.amazonaws.com'
    );
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;

    // Lambda: strip the permission node's own id from the path
    const lambdaPath = node.path.split('/').slice(0, -1).join('/');
    const lambda = context.findContainer(lambdaPath);
    if (!lambda) return null;

    // API: Ref inside sourceArn Fn::Join
    const apiLogicalId = findRefInJoin(props?.['sourceArn']);
    if (!apiLogicalId) return null;
    const api = context.findContainer(stripCdkHash(apiLogicalId));
    if (!api) return null;

    return { kind: 'edge', sourceId: api.id, targetId: lambda.id, label: 'invokes' };
  },
};

// WebSocket edge: match WebSocketApi, walk children for CfnIntegration nodes
export const apigwWebSocketEdgeRule: Rule = {
  id: 'default/apigw-websocket-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_apigatewayv2.WebSocketApi';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const api = context.findContainer(node.path);
    if (!api) return null;

    const lambdaIds = new Set<string>();
    for (const integration of walkForCfnIntegrations(node)) {
      const props = integration.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
      const logicalId = findGetAttInJoin(props?.['integrationUri']);
      if (!logicalId) continue;
      const lambda = context.findContainer(stripCdkHash(logicalId));
      if (lambda) lambdaIds.add(lambda.id);
    }

    if (lambdaIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...lambdaIds].map(lambdaId => ({ sourceId: api.id, targetId: lambdaId, label: 'invokes' })),
    };
  },
};
