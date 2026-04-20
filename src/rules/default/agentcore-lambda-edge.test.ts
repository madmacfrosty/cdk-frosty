import { lambdaAgentcoreEdgeRule } from './agentcore-lambda-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function makeRuntime(id: string): ArchContainer {
  return { id, label: id.split('/').at(-1) ?? id, containerType: 'agentcore-runtime', cdkPath: id, origin: 'synthesized', metadata: {} };
}

function makeLambdaNode(policyStatements: unknown[], id = 'MyFunction', stackName = 'AppStack'): CdkNode {
  const policyResource: CdkNode = {
    id: 'Resource',
    path: `${stackName}/${id}/ServiceRole/DefaultPolicy/Resource`,
    fqn: 'aws-cdk-lib.aws_iam.CfnPolicy',
    children: [],
    attributes: {
      'aws:cdk:cloudformation:props': {
        policyDocument: { Statement: policyStatements },
      },
    },
  };
  const defaultPolicy: CdkNode = {
    id: 'DefaultPolicy',
    path: `${stackName}/${id}/ServiceRole/DefaultPolicy`,
    fqn: 'aws-cdk-lib.aws_iam.Policy',
    children: [policyResource],
    attributes: {},
  };
  const serviceRole: CdkNode = {
    id: 'ServiceRole',
    path: `${stackName}/${id}/ServiceRole`,
    fqn: 'aws-cdk-lib.aws_iam.Role',
    children: [defaultPolicy],
    attributes: {},
  };
  return {
    id,
    path: `${stackName}/${id}`,
    fqn: 'aws-cdk-lib.aws_lambda.Function',
    children: [serviceRole],
    attributes: {},
  };
}

const invokeStatement = (resource: unknown) => ({
  Action: ['bedrock-agentcore:Invoke', 'bedrock-agentcore:InvokeStream'],
  Effect: 'Allow',
  Resource: resource,
});

const importValue = (v: string) => ({ 'Fn::ImportValue': v });

const importValueInJoin = (v: string) => ({
  'Fn::Join': ['', ['prefix', { 'Fn::ImportValue': v }]],
});

describe('lambdaAgentcoreEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_lambda.Function', () => {
      const node = makeLambdaNode([]);
      expect(lambdaAgentcoreEdgeRule.match(node)).toBe(true);
    });

    it('does not match other fqns', () => {
      const node = { id: 'X', path: 'S/X', fqn: 'aws-cdk-lib.aws_sqs.Queue', children: [], attributes: {} };
      expect(lambdaAgentcoreEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when there is no policy resource', () => {
      const node: CdkNode = {
        id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {},
      };
      expect(lambdaAgentcoreEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when policyDocument has no Statement', () => {
      const policyResource: CdkNode = {
        id: 'Resource', path: 'AppStack/MyFunction/ServiceRole/DefaultPolicy/Resource',
        fqn: 'aws-cdk-lib.aws_iam.CfnPolicy', children: [],
        attributes: { 'aws:cdk:cloudformation:props': { policyDocument: {} } },
      };
      const defaultPolicy: CdkNode = { id: 'DefaultPolicy', path: 'AppStack/MyFunction/ServiceRole/DefaultPolicy', fqn: 'x', children: [policyResource], attributes: {} };
      const serviceRole: CdkNode = { id: 'ServiceRole', path: 'AppStack/MyFunction/ServiceRole', fqn: 'x', children: [defaultPolicy], attributes: {} };
      const node: CdkNode = { id: 'MyFunction', path: 'AppStack/MyFunction', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [serviceRole], attributes: {} };
      expect(lambdaAgentcoreEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no bedrock-agentcore:Invoke action is present', () => {
      const node = makeLambdaNode([{ Action: 's3:GetObject', Effect: 'Allow', Resource: '*' }]);
      expect(lambdaAgentcoreEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when Fn::Join parts contain no Fn::ImportValue', () => {
      const node = makeLambdaNode([
        invokeStatement({ 'Fn::Join': ['', ['arn:aws:bedrock:us-east-1:123:runtime/abc', { Ref: 'SomeLogicalId' }]] }),
      ]);
      expect(lambdaAgentcoreEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when Fn::ImportValue does not match a CDK export pattern', () => {
      const node = makeLambdaNode([
        invokeStatement(importValue('InfraStack:SomeRandomExportName')),
      ]);
      expect(lambdaAgentcoreEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when Fn::ImportValue does not parse to a known container', () => {
      const node = makeLambdaNode([
        invokeStatement(importValue('InfraStack:ExportsOutputRefAgentCoreRuntimeABCDEF1234567890')),
      ]);
      expect(lambdaAgentcoreEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns edges for a single runtime resolved via Fn::ImportValue', () => {
      const runtime = makeRuntime('InfraStack/AgentCoreRuntime');
      const context: RuleContext = {
        findContainer: (path) => path.includes('AgentCoreRuntime') ? runtime : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([
        invokeStatement(importValue('InfraStack:ExportsOutputRefAgentCoreRuntimeABCDEF1234567890')),
      ]);
      const result = lambdaAgentcoreEdgeRule.apply(node, context);
      expect(result).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'AppStack/MyFunction', targetId: 'InfraStack/AgentCoreRuntime', label: 'invokes' }],
      });
    });

    it('resolves Fn::ImportValue nested inside Fn::Join', () => {
      const runtime = makeRuntime('InfraStack/AgentCoreRuntime');
      const context: RuleContext = {
        findContainer: (path) => path.includes('AgentCoreRuntime') ? runtime : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([
        invokeStatement(importValueInJoin('InfraStack:ExportsOutputRefAgentCoreRuntimeABCDEF1234567890')),
      ]);
      const result = lambdaAgentcoreEdgeRule.apply(node, context);
      expect(result).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'AppStack/MyFunction', targetId: 'InfraStack/AgentCoreRuntime', label: 'invokes' }],
      });
    });

    it('emits one edge per distinct runtime when multiple are referenced', () => {
      const runtimeA = makeRuntime('InfraStack/RuntimeA');
      const runtimeB = makeRuntime('InfraStack/RuntimeB');
      const context: RuleContext = {
        findContainer: (path) => {
          if (path.includes('RuntimeA')) return runtimeA;
          if (path.includes('RuntimeB')) return runtimeB;
          return undefined;
        },
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const node = makeLambdaNode([
        invokeStatement([
          importValue('InfraStack:ExportsOutputRefRuntimeAABCDEF1234567890'),
          importValue('InfraStack:ExportsOutputRefRuntimeBABCDEF1234567890'),
        ]),
      ]);
      const result = lambdaAgentcoreEdgeRule.apply(node, context) as { kind: string; items: unknown[] };
      expect(result?.kind).toBe('edges');
      expect(result?.items).toHaveLength(2);
    });
  });
});
