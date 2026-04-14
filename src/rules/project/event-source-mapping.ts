import { Rule } from '../../engine/types';

export const eventSourceMappingRule: Rule = {
  id: 'project/event-source-mapping',
  priority: 70,
  match(node) {
    return node.attributes?.['aws:cdk:cloudformation:type'] === 'AWS::Lambda::EventSourceMapping';
  },
  apply(node, context) {
    const lambdaPath = node.path.split('/').slice(0, -1).join('/');
    const lambda = context.findContainer(lambdaPath);
    if (!lambda) return null;

    const stackPath = node.path.split('/')[0];
    const queue = context.findContainer(stackPath + '/Queue');
    if (!queue) return null;

    return { kind: 'edge', sourceId: queue.id, targetId: lambda.id, label: 'triggers' };
  },
};
