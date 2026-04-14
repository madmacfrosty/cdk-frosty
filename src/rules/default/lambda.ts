import { Rule } from '../../engine/types';

export const lambdaRule: Rule = {
  id: 'default/lambda',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node) {
    if (node.id === 'framework-onEvent') return null;
    if (node.id === 'Lambda' && node.parentPath?.endsWith('/CustomCopy')) return null;
    return { kind: 'container', label: node.id, containerType: 'lambda' };
  },
};
