import { secretsManagerRule } from './secrets-manager';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined };

function makeNode(fqn: string, id = 'MySecret'): CdkNode {
  return { id, path: 'Stack/MySecret', fqn, children: [], attributes: {} };
}

describe('secretsManagerRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_secretsmanager.Secret', () => {
      expect(secretsManagerRule.match(makeNode('aws-cdk-lib.aws_secretsmanager.Secret'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(secretsManagerRule.match(makeNode('aws-cdk-lib.aws_lambda.Function'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns a secret container with the node id as label', () => {
      const result = secretsManagerRule.apply(makeNode('aws-cdk-lib.aws_secretsmanager.Secret', 'ApiKey'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'ApiKey', containerType: 'secret' });
    });
  });
});
