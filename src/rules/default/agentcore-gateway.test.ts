import { agentcoreGatewayRule } from './agentcore-gateway';
import { CdkNode } from '../../parser/types';

const noopContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function makeNode(fqn: string, id = 'Resource', parentPath = 'Stack/MyGateway'): CdkNode {
  return { id, path: parentPath + '/' + id, fqn, parentPath, children: [], attributes: {} };
}

describe('agentcoreGatewayRule', () => {
  describe('match', () => {
    it('matches aws-cdk-lib.aws_bedrockagentcore.CfnGateway', () => {
      expect(agentcoreGatewayRule.match(makeNode('aws-cdk-lib.aws_bedrockagentcore.CfnGateway'))).toBe(true);
    });

    it('does not match other fqns', () => {
      expect(agentcoreGatewayRule.match(makeNode('aws-cdk-lib.aws_lambda.Function'))).toBe(false);
    });
  });

  describe('apply', () => {
    it('uses the parent path segment as label (not node.id which is "Resource")', () => {
      const result = agentcoreGatewayRule.apply(makeNode('aws-cdk-lib.aws_bedrockagentcore.CfnGateway', 'Resource', 'Stack/MyGateway'), noopContext);
      expect(result).toEqual({ kind: 'container', label: 'MyGateway', containerType: 'agentcore-gateway' });
    });

    it('falls back to node.id when parentPath is undefined', () => {
      const node: CdkNode = { id: 'Resource', path: 'Resource', fqn: 'aws-cdk-lib.aws_bedrockagentcore.CfnGateway', children: [], attributes: {} };
      const result = agentcoreGatewayRule.apply(node, noopContext);
      expect(result).toEqual({ kind: 'container', label: 'Resource', containerType: 'agentcore-gateway' });
    });
  });
});
