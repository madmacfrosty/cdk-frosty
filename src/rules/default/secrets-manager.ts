import { Rule } from '../../engine/types';

export const secretsManagerRule: Rule = {
  id: 'default/secrets-manager',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_secretsmanager.Secret';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'secret' };
  },
};
