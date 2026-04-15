import { ssmParameterRule, lambdaSsmEdgeRule } from './ssm';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

function container(id: string): ArchContainer {
  return { id, label: id, containerType: 'ssm-parameter', cdkPath: id, metadata: {} };
}

function makePolicyResource(statements: unknown[]): CdkNode {
  return {
    id: 'Resource', path: 'Stack/Fn/ServiceRole/DefaultPolicy/Resource',
    fqn: 'aws-cdk-lib.aws_iam.CfnPolicy', children: [], attributes: {
      'aws:cdk:cloudformation:props': { policyDocument: { Statement: statements } },
    },
  };
}

function makeLambdaNode(statements: unknown[]): CdkNode {
  const resource = makePolicyResource(statements);
  const defaultPolicy: CdkNode = { id: 'DefaultPolicy', path: 'Stack/Fn/ServiceRole/DefaultPolicy', fqn: 'x', children: [resource], attributes: {} };
  const serviceRole: CdkNode = { id: 'ServiceRole', path: 'Stack/Fn/ServiceRole', fqn: 'x', children: [defaultPolicy], attributes: {} };
  return { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [serviceRole], attributes: {} };
}

// SSM resource ARNs use Fn::Join with a Ref to the parameter logical ID
function ssmResource(paramLogicalId: string): unknown {
  return {
    'Fn::Join': ['', [
      'arn:aws:ssm:us-east-1:123456789012:parameter/',
      { Ref: paramLogicalId },
    ]],
  };
}

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

describe('ssmParameterRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_ssm.StringParameter', () => {
      const node: CdkNode = { id: 'Param', path: 'Stack/Param', fqn: 'aws-cdk-lib.aws_ssm.StringParameter', children: [], attributes: {} };
      expect(ssmParameterRule.match(node)).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(ssmParameterRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns an ssm-parameter container with node id as label', () => {
      const node: CdkNode = { id: 'MyParam', path: 'Stack/MyParam', fqn: 'aws-cdk-lib.aws_ssm.StringParameter', children: [], attributes: {} };
      expect(ssmParameterRule.apply(node, noopContext)).toEqual({ kind: 'container', label: 'MyParam', containerType: 'ssm-parameter' });
    });
  });
});

describe('lambdaSsmEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_lambda.Function', () => {
      expect(lambdaSsmEdgeRule.match(makeLambdaNode([]))).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'Q', path: 'Stack/Q', fqn: 'aws-cdk-lib.aws_sqs.Queue', children: [], attributes: {} };
      expect(lambdaSsmEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no ServiceRole/DefaultPolicy/Resource child exists', () => {
      const node: CdkNode = { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(lambdaSsmEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no ssm: actions in policy', () => {
      const node = makeLambdaNode([{
        Action: 'lambda:InvokeFunction',
        Resource: ssmResource('MyParamABCDEF12'),
      }]);
      expect(lambdaSsmEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns edges for ssm:PutParameter resolved via Fn::Join Ref', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:PutParameter',
        Resource: ssmResource('MyParamABCDEF12'),
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'MyParam' ? container('Stack/MyParam') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = lambdaSsmEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edges', items: [{ sourceId: 'Stack/Fn', targetId: 'Stack/MyParam', label: 'writes' }] });
    });

    it('returns edges for ssm:GetParameter', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:GetParameter',
        Resource: ssmResource('MyParamABCDEF12'),
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'MyParam' ? container('Stack/MyParam') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = lambdaSsmEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edges', items: [{ sourceId: 'Stack/Fn', targetId: 'Stack/MyParam' }] });
    });

    it('handles Resource as an array', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:GetParameter',
        Resource: [ssmResource('MyParamABCDEF12')],
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'MyParam' ? container('Stack/MyParam') : undefined,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const result = lambdaSsmEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edges', items: [{ targetId: 'Stack/MyParam' }] });
    });

    it('skips resources that are not objects', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:GetParameter',
        Resource: 'arn:aws:ssm:us-east-1:123:parameter/MyParam',
      }]);
      expect(lambdaSsmEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('skips resources that are objects without Fn::Join', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:GetParameter',
        Resource: { 'Fn::GetAtt': ['MyParamABCDEF12', 'Arn'] },
      }]);
      expect(lambdaSsmEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('skips Fn::Join parts that have no Ref key', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:GetParameter',
        Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['MyParamABCDEF12', 'Arn'] }]] },
      }]);
      expect(lambdaSsmEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when parameter container not found', () => {
      const node = makeLambdaNode([{
        Action: 'ssm:PutParameter',
        Resource: ssmResource('UnknownParamABCDEF12'),
      }]);
      expect(lambdaSsmEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('deduplicates multiple references to the same parameter', () => {
      const node = makeLambdaNode([
        { Action: 'ssm:GetParameter', Resource: ssmResource('MyParamABCDEF12') },
        { Action: 'ssm:PutParameter', Resource: ssmResource('MyParamABCDEF12') },
      ]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'MyParam' ? container('Stack/MyParam') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = lambdaSsmEdgeRule.apply(node, ctx) as { kind: 'edges'; items: unknown[] };
      expect(result.items).toHaveLength(1);
    });
  });
});
