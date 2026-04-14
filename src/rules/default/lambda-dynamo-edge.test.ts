import { lambdaDynamoEdgeRule } from './lambda-dynamo-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

function container(id: string): ArchContainer {
  return { id, label: id, containerType: 'dynamodb', cdkPath: id, metadata: {} };
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

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined };

describe('lambdaDynamoEdgeRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_lambda.Function', () => {
      expect(lambdaDynamoEdgeRule.match(makeLambdaNode([]))).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'Q', path: 'Stack/Q', fqn: 'aws-cdk-lib.aws_sqs.Queue', children: [], attributes: {} };
      expect(lambdaDynamoEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no ServiceRole/DefaultPolicy/Resource child exists', () => {
      const node: CdkNode = { id: 'Fn', path: 'Stack/Fn', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(lambdaDynamoEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when no dynamodb: actions in policy', () => {
      const node = makeLambdaNode([{
        Action: 's3:GetObject',
        Resource: { 'Fn::GetAtt': ['MyTableABCDEF12', 'Arn'] },
      }]);
      expect(lambdaDynamoEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns edges for statements with dynamodb: actions resolved via Fn::GetAtt', () => {
      const node = makeLambdaNode([{
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        Resource: { 'Fn::GetAtt': ['MyTableABCDEF12', 'Arn'] },
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'MyTable' ? container('Stack/MyTable') : undefined,
        findNode: () => undefined,
      };
      const result = lambdaDynamoEdgeRule.apply(node, ctx);
      expect(result).toMatchObject({ kind: 'edges', items: [{ sourceId: 'Stack/Fn', targetId: 'Stack/MyTable', label: 'reads/writes' }] });
    });

    it('returns null when table container not found', () => {
      const node = makeLambdaNode([{
        Action: 'dynamodb:GetItem',
        Resource: { 'Fn::GetAtt': ['UnknownTableABCDEF12', 'Arn'] },
      }]);
      expect(lambdaDynamoEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('deduplicates multiple references to the same table', () => {
      const node = makeLambdaNode([
        { Action: 'dynamodb:GetItem', Resource: { 'Fn::GetAtt': ['MyTableABCDEF12', 'Arn'] } },
        { Action: 'dynamodb:PutItem', Resource: { 'Fn::GetAtt': ['MyTableABCDEF12', 'Arn'] } },
      ]);
      const ctx: RuleContext = {
        findContainer: (id) => id === 'MyTable' ? container('Stack/MyTable') : undefined,
        findNode: () => undefined,
      };
      const result = lambdaDynamoEdgeRule.apply(node, ctx) as { kind: 'edges'; items: unknown[] };
      expect(result.items).toHaveLength(1);
    });

    it('handles multiple tables in the same policy', () => {
      const node = makeLambdaNode([{
        Action: 'dynamodb:GetItem',
        Resource: [
          { 'Fn::GetAtt': ['TableAABCDEF12', 'Arn'] },
          { 'Fn::GetAtt': ['TableBABCDEF12', 'Arn'] },
        ],
      }]);
      const ctx: RuleContext = {
        findContainer: (id) => {
          if (id === 'TableA') return container('Stack/TableA');
          if (id === 'TableB') return container('Stack/TableB');
          return undefined;
        },
        findNode: () => undefined,
      };
      const result = lambdaDynamoEdgeRule.apply(node, ctx) as { kind: 'edges'; items: unknown[] };
      expect(result.items).toHaveLength(2);
    });
  });
});
