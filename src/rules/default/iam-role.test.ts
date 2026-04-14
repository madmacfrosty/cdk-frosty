import { iamRoleRule } from './iam-role';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function makeNode(fqn: string): CdkNode {
  return { id: 'Role', path: 'Stack/Role', fqn, children: [], attributes: {} };
}

describe('iamRoleRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_iam.Role', () => {
      expect(iamRoleRule.match(makeNode('aws-cdk-lib.aws_iam.Role'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(iamRoleRule.match(makeNode('aws-cdk-lib.aws_lambda.Function'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null — IAM roles are suppressed from the diagram', () => {
      const result = iamRoleRule.apply(makeNode('aws-cdk-lib.aws_iam.Role'), noopContext);
      expect(result).toBeNull();
    });
  });
});
