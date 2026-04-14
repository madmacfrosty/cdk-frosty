import { Rule } from '../../engine/types';

export const dynamodbRule: Rule = {
  id: 'default/dynamodb',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_dynamodb.Table';
  },
  apply(node) {
    return { kind: 'container', label: node.id, containerType: 'dynamodb' };
  },
};
