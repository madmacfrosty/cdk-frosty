import { Rule } from '../../engine/types';

export const lambdaRule: Rule = {
  id: 'default/lambda',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'lambda' };
  },
};
