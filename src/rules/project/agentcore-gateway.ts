import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { stripCdkHash } from '../utils';

export const agentcoreRuntimeGatewayEdgeRule: Rule = {
  id: 'project/agentcore-runtime-gateway-edge',
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

export const agentcoreGatewayMcpEdgeRule: Rule = {
  id: 'project/agentcore-gateway-mcp-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_bedrockagentcore.CfnGatewayTarget';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;

    // Resolve gateway from gatewayIdentifier: { Fn::GetAtt: ["GatewayABCDEF12", "GatewayIdentifier"] }
    // Qualify with the owning stack prefix to avoid ambiguous suffix matches across stacks
    const localStack = node.path.split('/')[0];
    const gatewayId = props?.gatewayIdentifier as Record<string, unknown> | undefined;
    const getAtt = gatewayId?.['Fn::GetAtt'];
    if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') return null;
    const gatewayConstructId = stripCdkHash(getAtt[0] as string);
    const gateway = context.findContainer(localStack + '/' + gatewayConstructId + '/Resource');
    if (!gateway) return null;

    // Resolve target Lambda from targetConfiguration.mcp.lambda.lambdaArn: { Fn::ImportValue: "Stack:ExportsOutputRefAliasABCDEF12ABCDEF12" }
    const lambdaArn = (props?.targetConfiguration as Record<string, unknown> | undefined)
      ?.['mcp'] as Record<string, unknown> | undefined;
    const importValue = (lambdaArn?.['lambda'] as Record<string, unknown> | undefined)
      ?.['lambdaArn'] as Record<string, unknown> | undefined;
    const fnImport = importValue?.['Fn::ImportValue'];
    if (typeof fnImport !== 'string') return null;

    const colonIdx = fnImport.indexOf(':');
    if (colonIdx < 0) return null;
    const stackName = fnImport.slice(0, colonIdx);
    const exportName = fnImport.slice(colonIdx + 1);

    const match = exportName.match(/ExportsOutputRef([A-Za-z0-9]+?)[A-F0-9]{8}[A-F0-9]{8}$/);
    if (!match) return null;

    // The export points to a Lambda alias — resolve the Lambda via alias Resource's functionName.Ref
    // Qualify the Lambda lookup with the source stack to avoid cross-stack ambiguity
    const aliasNode = context.findNode(stackName + '/' + match[1]);
    const aliasResource = aliasNode?.children.find(c => c.id === 'Resource');
    const aliasProps = aliasResource?.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const fnRef = (aliasProps?.functionName as Record<string, unknown> | undefined)?.['Ref'];
    if (typeof fnRef !== 'string') return null;
    const lambda = context.findContainer(stackName + '/' + stripCdkHash(fnRef));
    if (!lambda) return null;

    return { kind: 'edge', sourceId: gateway.id, targetId: lambda.id, label: 'invokes' };
  },
};
