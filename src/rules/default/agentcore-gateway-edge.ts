import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { stripCdkHash, parseCrossStackRef } from '../utils';

function extractFnImportValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v['Fn::ImportValue'] === 'string') return v['Fn::ImportValue'];
  const join = v['Fn::Join'];
  if (Array.isArray(join) && Array.isArray(join[1])) {
    for (const part of join[1] as unknown[]) {
      const nested = extractFnImportValue(part);
      if (nested) return nested;
    }
  }
  return undefined;
}

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
    if (!envVars) return null;

    const runtime = context.findContainer(node.path);
    if (!runtime) return null;

    const targetIds = new Set<string>();

    for (const value of Object.values(envVars)) {
      const fnImport = extractFnImportValue(value);
      if (!fnImport) continue;

      const ref = parseCrossStackRef(fnImport);
      if (!ref) continue;

      // Gateway containers are registered at the CfnGateway path: stackName/constructId/Resource
      const target = context.findContainer(ref.stackName + '/' + ref.constructId + '/Resource');
      if (target?.containerType === 'agentcore-gateway') targetIds.add(target.id);
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: runtime.id, targetId, label: 'invokes' })),
    };
  },
};

export const agentcoreGatewayMcpEdgeRule: Rule = {
  id: 'default/agentcore-gateway-mcp-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_bedrockagentcore.CfnGatewayTarget';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;

    // Resolve gateway from gatewayIdentifier: { Fn::GetAtt: ["GatewayABCDEF12", "GatewayIdentifier"] }
    const localStack = node.path.split('/')[0];
    const gatewayId = props?.gatewayIdentifier as Record<string, unknown> | undefined;
    const getAtt = gatewayId?.['Fn::GetAtt'];
    if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') return null;
    const gatewayConstructId = stripCdkHash(getAtt[0] as string);
    const gateway = context.findContainer(localStack + '/' + gatewayConstructId + '/Resource');
    if (!gateway) return null;

    // Resolve target Lambda from targetConfiguration.mcp.lambda.lambdaArn: { Fn::ImportValue: "Stack:ExportsOutputRef..." }
    const lambdaArn = (props?.targetConfiguration as Record<string, unknown> | undefined)
      ?.['mcp'] as Record<string, unknown> | undefined;
    const importValue = (lambdaArn?.['lambda'] as Record<string, unknown> | undefined)
      ?.['lambdaArn'] as Record<string, unknown> | undefined;
    const fnImport = importValue?.['Fn::ImportValue'];
    if (typeof fnImport !== 'string') return null;

    const ref = parseCrossStackRef(fnImport);
    if (!ref) return null;

    // Export points to a Lambda alias — walk alias Resource's functionName.Ref to get the Lambda
    const aliasNode = context.findNode(ref.stackName + '/' + ref.constructId);
    const aliasResource = aliasNode?.children.find(c => c.id === 'Resource');
    const aliasProps = aliasResource?.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const fnRef = (aliasProps?.functionName as Record<string, unknown> | undefined)?.['Ref'];
    if (typeof fnRef !== 'string') return null;
    const lambda = context.findContainer(ref.stackName + '/' + stripCdkHash(fnRef));
    if (!lambda) return null;

    return { kind: 'edge', sourceId: gateway.id, targetId: lambda.id, label: 'invokes' };
  },
};
