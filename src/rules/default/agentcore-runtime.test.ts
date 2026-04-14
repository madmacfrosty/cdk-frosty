import { agentcoreRuntimeRule } from './agentcore-runtime';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function makeNode(fqn: string, id = 'AgentCoreRuntime'): CdkNode {
  return { id, path: 'Stack/' + id, fqn, children: [], attributes: {} };
}

describe('agentcoreRuntimeRule', () => {
  describe('match', () => {
    it('matches @aws-cdk/aws-bedrock-agentcore-alpha.Runtime', () => {
      expect(agentcoreRuntimeRule.match(makeNode('@aws-cdk/aws-bedrock-agentcore-alpha.Runtime'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(agentcoreRuntimeRule.match(makeNode('aws-cdk-lib.aws_lambda.Function'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns an agentcore-runtime container with the node id as label', () => {
      const result = agentcoreRuntimeRule.apply(makeNode('@aws-cdk/aws-bedrock-agentcore-alpha.Runtime', 'MyRuntime'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'MyRuntime', containerType: 'agentcore-runtime' });
    });
  });
});
