import { agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule } from './agentcore-gateway-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function container(id: string): ArchContainer {
  return { id, label: id.split('/').at(-1) ?? id, containerType: 'test', cdkPath: id, metadata: {} };
}

// --- agentcoreRuntimeGatewayEdgeRule ---

function makeRuntimeNode(envVars: Record<string, unknown> | undefined, stack = 'MyStack'): CdkNode {
  const resource: CdkNode = {
    id: 'Resource',
    path: `${stack}/AgentCoreRuntime/Resource`,
    fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.CfnRuntime',
    children: [],
    attributes: {
      'aws:cdk:cloudformation:props': envVars !== undefined ? { environmentVariables: envVars } : {},
    },
  };
  return {
    id: 'AgentCoreRuntime',
    path: `${stack}/AgentCoreRuntime`,
    fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime',
    children: [resource],
    attributes: {},
  };
}

describe('agentcoreRuntimeGatewayEdgeRule', () => {
  describe('match', () => {
    it('matches @aws-cdk/aws-bedrock-agentcore-alpha.Runtime', () => {
      expect(agentcoreRuntimeGatewayEdgeRule.match(makeRuntimeNode({}))).toBe(true);
    });
    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'X', path: 'S/X', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(agentcoreRuntimeGatewayEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no Resource child', () => {
      const node: CdkNode = { id: 'R', path: 'S/R', fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime', children: [], attributes: {} };
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when environmentVariables is absent from props', () => {
      const node = makeRuntimeNode(undefined);
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no env var contains a Fn::ImportValue pointing to a gateway', () => {
      const node = makeRuntimeNode({ OTHER_VAR: 'plain-string-value' });
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when Fn::Join parts contain no Fn::ImportValue', () => {
      const node = makeRuntimeNode({ GATEWAY_ENDPOINTS: { 'Fn::Join': ['', ['[{"url":"https://example.com"}]']] } });
      const ctx: RuleContext = {
        findContainer: () => container('AlphaStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when runtime container is not found', () => {
      const gatewayImport = { 'Fn::Join': ['', ['[{"url":"', { 'Fn::ImportValue': 'GwStack:ExportsOutputFnGetAttGatewayABCDEF12GatewayUrl34567890' }, '"}]']] };
      const node = makeRuntimeNode({ GATEWAY_ENDPOINTS: gatewayImport }, 'AlphaStack');
      const ctx: RuleContext = {
        findContainer: (p) => p.includes('Gateway') ? { ...container('GwStack/Gateway/Resource'), containerType: 'agentcore-gateway' } : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when resolved container is not an agentcore-gateway', () => {
      const runtime = container('AlphaStack/AgentCoreRuntime');
      const notAGateway = container('GwStack/Gateway/Resource'); // containerType: 'test', not 'agentcore-gateway'
      const gatewayImport = { 'Fn::Join': ['', ['[{"url":"', { 'Fn::ImportValue': 'GwStack:ExportsOutputFnGetAttGatewayABCDEF12GatewayUrl34567890' }, '"}]']] };
      const node = makeRuntimeNode({ GATEWAY_ENDPOINTS: gatewayImport }, 'AlphaStack');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'AlphaStack/AgentCoreRuntime') return runtime;
          if (p === 'GwStack/Gateway/Resource') return notAGateway;
          return undefined;
        },
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('resolves gateway via Fn::ImportValue nested in Fn::Join', () => {
      const runtime = container('AlphaStack/AgentCoreRuntime');
      const gateway = { ...container('GwStack/Gateway/Resource'), containerType: 'agentcore-gateway' };
      const gatewayImport = { 'Fn::Join': ['', ['[{"url":"', { 'Fn::ImportValue': 'GwStack:ExportsOutputFnGetAttGatewayABCDEF12GatewayUrl34567890' }, '"}]']] };
      const node = makeRuntimeNode({ GATEWAY_ENDPOINTS: gatewayImport }, 'AlphaStack');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'AlphaStack/AgentCoreRuntime') return runtime;
          if (p === 'GwStack/Gateway/Resource') return gateway;
          return undefined;
        },
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeGatewayEdgeRule.apply(node, ctx)).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'AlphaStack/AgentCoreRuntime', targetId: 'GwStack/Gateway/Resource', label: 'invokes' }],
      });
    });
  });
});

// --- agentcoreGatewayMcpEdgeRule ---

function makeGatewayTargetNode(props: Record<string, unknown>, stack = 'MyStack'): CdkNode {
  return {
    id: 'GatewayTarget',
    path: `${stack}/GatewayTarget`,
    fqn: 'aws-cdk-lib.aws_bedrockagentcore.CfnGatewayTarget',
    children: [],
    attributes: { 'aws:cdk:cloudformation:props': props },
  };
}

function makeAliasNode(functionNameRef: string, stack = 'McpStack'): CdkNode {
  const resource: CdkNode = {
    id: 'Resource',
    path: `${stack}/LiveAlias/Resource`,
    fqn: 'aws-cdk-lib.aws_lambda.CfnAlias',
    children: [],
    attributes: {
      'aws:cdk:cloudformation:props': { functionName: { Ref: functionNameRef } },
    },
  };
  return {
    id: 'LiveAlias',
    path: `${stack}/LiveAlias`,
    fqn: 'aws-cdk-lib.aws_lambda.Alias',
    children: [resource],
    attributes: {},
  };
}

const validProps = {
  gatewayIdentifier: { 'Fn::GetAtt': ['GatewayABCDEF12', 'GatewayIdentifier'] },
  targetConfiguration: {
    mcp: { lambda: { lambdaArn: { 'Fn::ImportValue': 'McpStack:ExportsOutputRefLiveAliasABCDEF1234567890' } } },
  },
};

describe('agentcoreGatewayMcpEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_bedrockagentcore.CfnGatewayTarget', () => {
      expect(agentcoreGatewayMcpEdgeRule.match(makeGatewayTargetNode({}))).toBe(true);
    });
    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'X', path: 'S/X', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(agentcoreGatewayMcpEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when gatewayIdentifier Fn::GetAtt is absent', () => {
      const node = makeGatewayTargetNode({ targetConfiguration: validProps.targetConfiguration });
      expect(agentcoreGatewayMcpEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when gateway container is not found', () => {
      const node = makeGatewayTargetNode(validProps, 'MyStack');
      expect(agentcoreGatewayMcpEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when Fn::ImportValue is absent', () => {
      const node = makeGatewayTargetNode({ gatewayIdentifier: validProps.gatewayIdentifier }, 'MyStack');
      const ctx: RuleContext = {
        findContainer: () => container('MyStack/Gateway/Resource'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreGatewayMcpEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when parseCrossStackRef fails', () => {
      const node = makeGatewayTargetNode({
        ...validProps,
        targetConfiguration: { mcp: { lambda: { lambdaArn: { 'Fn::ImportValue': 'no-colon-here' } } } },
      }, 'MyStack');
      const ctx: RuleContext = {
        findContainer: () => container('MyStack/Gateway/Resource'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreGatewayMcpEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when alias is found but functionName.Ref is not a string', () => {
      const gw = container('MyStack/Gateway/Resource');
      const aliasNodeNoRef: CdkNode = {
        id: 'LiveAlias', path: 'McpStack/LiveAlias', fqn: 'aws-cdk-lib.aws_lambda.Alias',
        children: [{
          id: 'Resource', path: 'McpStack/LiveAlias/Resource', fqn: 'aws-cdk-lib.aws_lambda.CfnAlias',
          children: [], attributes: { 'aws:cdk:cloudformation:props': { functionName: { 'Fn::GetAtt': ['X', 'Arn'] } } },
        }],
        attributes: {},
      };
      const ctx: RuleContext = {
        findContainer: () => gw,
        findNode: () => aliasNodeNoRef,
        findNodeWhere: () => undefined,
      };
      expect(agentcoreGatewayMcpEdgeRule.apply(makeGatewayTargetNode(validProps, 'MyStack'), ctx)).toBeNull();
    });

    it('returns null when lambda container is not found after resolving fnRef', () => {
      const gw = container('MyStack/Gateway/Resource');
      const aliasNode = makeAliasNode('McpLambdaABCDEF12', 'McpStack');
      const ctx: RuleContext = {
        findContainer: (p) => p === 'MyStack/Gateway/Resource' ? gw : undefined,
        findNode: () => aliasNode,
        findNodeWhere: () => undefined,
      };
      expect(agentcoreGatewayMcpEdgeRule.apply(makeGatewayTargetNode(validProps, 'MyStack'), ctx)).toBeNull();
    });

    it('returns an edge from gateway to lambda', () => {
      const gw = container('MyStack/Gateway/Resource');
      const lambda = container('McpStack/McpLambda');
      const aliasNode = makeAliasNode('McpLambdaABCDEF12', 'McpStack');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'MyStack/Gateway/Resource') return gw;
          if (p === 'McpStack/McpLambda') return lambda;
          return undefined;
        },
        findNode: (p) => p.includes('LiveAlias') ? aliasNode : undefined,
        findNodeWhere: () => undefined,
      };
      const node = makeGatewayTargetNode(validProps, 'MyStack');
      expect(agentcoreGatewayMcpEdgeRule.apply(node, ctx)).toEqual({
        kind: 'edge',
        sourceId: 'MyStack/Gateway/Resource',
        targetId: 'McpStack/McpLambda',
        label: 'invokes',
      });
    });
  });
});
