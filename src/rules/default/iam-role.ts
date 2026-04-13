import { Rule } from '../../engine/types';

export const iamRoleRule: Rule = {
  id: 'default/iam-role',
  priority: 20,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_iam.Role';
  },
  apply() {
    return null;
  },
};
