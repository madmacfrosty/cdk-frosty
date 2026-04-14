import { CdkNode } from '../../parser/types';
import { Rule, RuleOutput } from '../../engine/types';

export const eventSourceMappingRule: Rule = {
  id: 'default/event-source-mapping',
  priority: 70,
  match(node) {
    return node.attributes?.['aws:cdk:cloudformation:type'] === 'AWS::Lambda::EventSourceMapping';
  },
  apply(node: CdkNode, context): RuleOutput {
    const props = node.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    if (!props) return null;

    // Resolve Lambda from functionName: { Ref: "LambdaFnABCDEF12" }
    const fnRef = (props.functionName as Record<string, unknown> | undefined)?.['Ref'];
    if (typeof fnRef !== 'string') return null;
    const lambda = context.findContainer(fnRef.replace(/[A-F0-9]{8}$/, ''));
    if (!lambda) return null;

    // Resolve event source from eventSourceArn: { Fn::GetAtt: ["QueueABCDEF12", "Arn"] }
    const getAtt = (props.eventSourceArn as Record<string, unknown> | undefined)?.['Fn::GetAtt'];
    if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') return null;
    const source = context.findContainer((getAtt[0] as string).replace(/[A-F0-9]{8}$/, ''));
    if (!source) return null;

    return { kind: 'edge', sourceId: source.id, targetId: lambda.id, label: 'triggers' };
  },
};
