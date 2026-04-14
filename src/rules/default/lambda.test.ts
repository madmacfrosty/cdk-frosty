import { lambdaRule } from './lambda';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function makeNode(fqn: string, id = 'Fn', path = 'Stack/Fn'): CdkNode {
  return { id, path, fqn, children: [], attributes: {} };
}

describe('lambdaRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_lambda.Function', () => {
      expect(lambdaRule.match(makeNode('aws-cdk-lib.aws_lambda.Function'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(lambdaRule.match(makeNode('aws-cdk-lib.aws_sqs.Queue'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns a lambda container with the node id as label', () => {
      const result = lambdaRule.apply(makeNode('aws-cdk-lib.aws_lambda.Function', 'MyFn'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'MyFn', containerType: 'lambda' });
    });
  });
});
