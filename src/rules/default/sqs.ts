import { Rule } from '../../engine/types';

export const sqsRule: Rule = {
  id: 'default/sqs',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_sqs.Queue';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'queue' };
  },
};
