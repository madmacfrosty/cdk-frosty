import { sqsRule } from './sqs';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function makeNode(fqn: string, id = 'Queue'): CdkNode {
  return { id, path: 'Stack/Queue', fqn, children: [], attributes: {} };
}

describe('sqsRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_sqs.Queue', () => {
      expect(sqsRule.match(makeNode('aws-cdk-lib.aws_sqs.Queue'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(sqsRule.match(makeNode('aws-cdk-lib.aws_lambda.Function'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns a queue container with the node id as label', () => {
      const result = sqsRule.apply(makeNode('aws-cdk-lib.aws_sqs.Queue', 'MyQueue'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'MyQueue', containerType: 'queue' });
    });
  });
});
