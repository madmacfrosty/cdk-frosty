import { Rule } from '../../engine/types';

export const lambdaSuppressionsRule: Rule = {
  id: 'project/lambda-suppressions',
  priority: 60,
  match(node) {
    if (node.fqn !== 'aws-cdk-lib.aws_lambda.Function') return false;
    if (node.id === 'framework-onEvent') return true;
    if (node.id === 'Lambda' && node.parentPath?.endsWith('/CustomCopy')) return true;
    return false;
  },
  apply() {
    return null;
  },
};
