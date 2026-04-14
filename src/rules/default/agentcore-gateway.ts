import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';

// Gateway container: match the CfnGateway resource, label from parent id
export const agentcoreGatewayRule: Rule = {
  id: 'default/agentcore-gateway',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_bedrockagentcore.CfnGateway';
  },
  apply(node) {
    const segments = node.path.split('/');
    const label = segments[segments.length - 2] ?? node.id;
    return { kind: 'container', label, containerType: 'agentcore-gateway' };
  },
};

// AgentCoreRuntime → Gateway edge: Runtime env vars contain GATEWAY_ENDPOINTS referencing the Gateway
export const agentcoreRuntimeGatewayEdgeRule: Rule = {
  id: 'default/agentcore-runtime-gateway-edge',
  priority: 50,
  match(node) {
    return node.fqn === '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const resource = node.children.find(c => c.id === 'Resource');
    if (!resource) return null;

    const props = resource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const envVars = props?.environmentVariables as Record<string, unknown> | undefined;
    if (!envVars?.['GATEWAY_ENDPOINTS']) return null;

    const runtime = context.findContainer(node.path);
    const gateway = context.findContainer('Gateway/Resource');
    if (!runtime || !gateway) return null;

    return { kind: 'edge', sourceId: runtime.id, targetId: gateway.id, label: 'invokes' };
  },
};

// Gateway → McpLambda edge: GatewayTarget targetConfiguration points to McpLambda
export const agentcoreGatewayMcpEdgeRule: Rule = {
  id: 'default/agentcore-gateway-mcp-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_bedrockagentcore.CfnGatewayTarget';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;

    // Find Gateway via gatewayIdentifier.Fn::GetAtt
    const gatewayId = props?.gatewayIdentifier as Record<string, unknown> | undefined;
    const getAtt = gatewayId?.['Fn::GetAtt'];
    if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') return null;
    const gatewayConstructId = (getAtt[0] as string).replace(/[A-F0-9]{8}$/, '');
    const gateway = context.findContainer(gatewayConstructId + '/Resource');
    if (!gateway) return null;

    // Find McpLambda — GatewayTarget always routes to the MCP Lambda
    const mcpLambda = context.findContainer('McpLambda');
    if (!mcpLambda) return null;

    return { kind: 'edge', sourceId: gateway.id, targetId: mcpLambda.id, label: 'invokes' };
  },
};
