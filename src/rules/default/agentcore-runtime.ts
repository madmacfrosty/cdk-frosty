import { Rule } from '../../engine/types';

export const agentcoreRuntimeRule: Rule = {
  id: 'default/agentcore-runtime',
  priority: 50,
  match(node) {
    return node.fqn === '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'agentcore-runtime' };
  },
};
