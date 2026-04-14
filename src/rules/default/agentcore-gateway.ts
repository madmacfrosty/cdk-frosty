import { Rule } from '../../engine/types';

export const agentcoreGatewayRule: Rule = {
  id: 'default/agentcore-gateway',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_bedrockagentcore.CfnGateway';
  },
  apply(node) {
    const label = node.parentPath?.split('/').at(-1) ?? node.id;
    return { kind: 'container', label, containerType: 'agentcore-gateway' };
  },
};
