import { dynamodbRule } from './dynamodb';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined };

function makeNode(fqn: string, id = 'Table'): CdkNode {
  return { id, path: 'Stack/Table', fqn, children: [], attributes: {} };
}

describe('dynamodbRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_dynamodb.Table', () => {
      expect(dynamodbRule.match(makeNode('aws-cdk-lib.aws_dynamodb.Table'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(dynamodbRule.match(makeNode('aws-cdk-lib.aws_sqs.Queue'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns a dynamodb container with the node id as label', () => {
      const result = dynamodbRule.apply(makeNode('aws-cdk-lib.aws_dynamodb.Table', 'MyTable'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'MyTable', containerType: 'dynamodb' });
    });
  });
});
