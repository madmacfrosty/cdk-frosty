import { lambdaInvokeEdgeRule } from './lambda-invoke-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

function container(id: string): ArchContainer {
  return { id, label: id, containerType: 'lambda', cdkPath: id, origin: 'synthesized', metadata: {} };
}

function makePolicyResource(statements: unknown[]): CdkNode {
  return {
    id: 'Resource', path: 'Stack/Fn/ServiceRole/DefaultPolicy/Resource',
    fqn: 'aws-cdk-lib.aws_iam.CfnPolicy', children: [], attributes: {
      'aws:cdk:cloudformation:props': { policyDocument: { Statement: statements } },
    },
  };
}

function makeLambdaNode(path: string, statements: unknown[]): CdkNode {
  const resource = makePolicyResource(statements);
  const defaultPolicy: CdkNode = { id: 'DefaultPolicy', path: path + '/ServiceRole/DefaultPolicy', fqn: 'x', children: [resource], attributes: {} };
  const serviceRole: CdkNode = { id: 'ServiceRole', path: path + '/ServiceRole', fqn: 'x', children: [defaultPolicy], attributes: {} };
  return { id: path.split('/').pop()!, path, fqn: 'aws-cdk-lib.aws_lambda.Function', children: [serviceRole], attributes: {} };
}

// Cross-stack alias: Fn::ImportValue referencing an alias construct
function importValueResource(stackName: string, aliasConstructId: string): unknown {
  return {
    'Fn::ImportValue': `${stackName}:ExportsOutputRef${aliasConstructId}ABCDEF12ABCDEF12`,
  };
}

function makeAliasNode(path: string, lambdaLogicalId: string): CdkNode {
  const resource: CdkNode = {
    id: 'Resource', path: path + '/Resource', fqn: 'aws-cdk-lib.aws_lambda.CfnAlias', children: [], attributes: {
      'aws:cdk:cloudformation:props': { functionName: { Ref: lambdaLogicalId } },
    },
  };
  return { id: path.split('/').pop()!, path, fqn: 'aws-cdk-lib.aws_lambda.Alias', children: [resource], attributes: {} };
}

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

describe('lambdaInvokeEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_lambda.Function', () => {
      expect(lambdaInvokeEdgeRule.match(makeLambdaNode('Stack/Fn', []))).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'Q', path: 'Stack/Q', fqn: 'aws-cdk-lib.aws_sqs.Queue', children: [], attributes: {} };
      expect(lambdaInvokeEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no ServiceRole/DefaultPolicy/Resource child exists', () => {
      const node: CdkNode = { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(lambdaInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no lambda:InvokeFunction actions in policy', () => {
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'dynamodb:GetItem',
        Resource: { 'Fn::GetAtt': ['TargetFnABCDEF12', 'Arn'] },
      }]);
      expect(lambdaInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns edge for same-stack invoke via Fn::GetAtt', () => {
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'lambda:InvokeFunction',
        Resource: { 'Fn::GetAtt': ['TargetFnABCDEF12', 'Arn'] },
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'TargetFn' ? container('Stack/TargetFn') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = lambdaInvokeEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edges', items: [{ sourceId: 'Stack/Fn', targetId: 'Stack/TargetFn', label: 'invokes' }] });
    });

    it('does not add self-edge when Fn::GetAtt resolves to the same lambda', () => {
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'lambda:InvokeFunction',
        Resource: { 'Fn::GetAtt': ['FnABCDEF12', 'Arn'] },
      }]);
      const ctx: RuleContext = {
        // target.id === node.path → should be excluded
        findContainer: (id) => id === 'Fn' ? container('Stack/Fn') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      expect(lambdaInvokeEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when target container not found', () => {
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'lambda:InvokeFunction',
        Resource: { 'Fn::GetAtt': ['UnknownFnABCDEF12', 'Arn'] },
      }]);
      expect(lambdaInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns cross-stack edge via Fn::ImportValue alias', () => {
      // Alias in OtherStack/MyAlias — its Resource has functionName.Ref → TargetFnABCDEF12
      const aliasNode = makeAliasNode('OtherStack/MyAlias', 'TargetFnABCDEF12');
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'lambda:InvokeFunction',
        Resource: importValueResource('OtherStack', 'MyAlias'),
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'OtherStack/TargetFn' ? container('OtherStack/TargetFn') : undefined,
        findNode: (id) => id === 'OtherStack/MyAlias' ? aliasNode : undefined,
        findNodeWhere: () => undefined,
      };
      const result = lambdaInvokeEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({
        kind: 'edges',
        items: [{ sourceId: 'Stack/Fn', targetId: 'OtherStack/TargetFn', label: 'invokes (via alias)' }],
      });
    });

    it('skips resources that are not objects', () => {
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'lambda:InvokeFunction',
        Resource: 'arn:aws:lambda:us-east-1:123:function:TargetFn',
      }]);
      expect(lambdaInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('skips Fn::ImportValue with no colon separator', () => {
      const node = makeLambdaNode('Stack/Fn', [{
        Action: 'lambda:InvokeFunction',
        Resource: { 'Fn::ImportValue': 'ExportsOutputRefMyAliasABCDEF12ABCDEF12' },
      }]);
      expect(lambdaInvokeEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('deduplicates multiple invoke statements targeting the same lambda', () => {
      const node = makeLambdaNode('Stack/Fn', [
        { Action: 'lambda:InvokeFunction', Resource: { 'Fn::GetAtt': ['TargetFnABCDEF12', 'Arn'] } },
        { Action: 'lambda:InvokeFunction', Resource: { 'Fn::GetAtt': ['TargetFnABCDEF12', 'Arn'] } },
      ]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'TargetFn' ? container('Stack/TargetFn') : undefined,
        findNode: () => undefined,
        findNodeWhere: () => undefined,
      };
      const result = lambdaInvokeEdgeRule.apply(node, ctx) as { kind: 'edges'; items: unknown[] };
      expect(result.items).toHaveLength(1);
    });
  });
});
