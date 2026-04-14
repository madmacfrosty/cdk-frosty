import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';

function findChild(node: CdkNode, id: string): CdkNode | undefined {
  return node.children.find(c => c.id === id);
}

export const lambdaInvokeEdgeRule: Rule = {
  id: 'default/lambda-invoke-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const policyResource =
      findChild(findChild(findChild(node, 'ServiceRole') ?? node, 'DefaultPolicy') ?? node, 'Resource');
    if (!policyResource) return null;

    const props = policyResource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const statements = (props?.policyDocument as { Statement?: unknown[] } | undefined)?.Statement;
    if (!statements) return null;

    const targetIds = new Set<string>();
    const aliasTargetIds = new Set<string>();

    for (const stmt of statements) {
      const s = stmt as Record<string, unknown>;
      const actions = Array.isArray(s['Action']) ? s['Action'] : [s['Action']];
      const hasInvoke = actions.some((a: unknown) => a === 'lambda:InvokeFunction');
      if (!hasInvoke) continue;

      const resources = Array.isArray(s['Resource']) ? s['Resource'] : [s['Resource']];
      for (const res of resources) {
        if (!res || typeof res !== 'object') continue;
        const r = res as Record<string, unknown>;

        // Same-stack: Fn::GetAtt → Lambda construct
        const getAtt = r['Fn::GetAtt'];
        if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') {
          const constructId = (getAtt[0] as string).replace(/[A-F0-9]{8}$/, '');
          const target = context.findContainer(constructId);
          if (target && target.id !== node.path) targetIds.add(target.id);
        }

        // Cross-stack via alias: Fn::ImportValue export name embeds the alias construct ID.
        // We find the alias node, read its functionName.Ref to get the Lambda logical ID,
        // strip the hash, and resolve the Lambda container.
        // Format: "<StackName>:ExportsOutputRef<AliasLogicalId><OutputHash>"
        const importValue = r['Fn::ImportValue'];
        if (typeof importValue === 'string') {
          const colonIdx = importValue.indexOf(':');
          const stackName = colonIdx > 0 ? importValue.slice(0, colonIdx) : '';
          const exportName = colonIdx > 0 ? importValue.slice(colonIdx + 1) : importValue;
          const match = exportName.match(/ExportsOutputRef([A-Za-z0-9]+?)[A-F0-9]{8}[A-F0-9]{8}$/);
          if (match && stackName) {
            const aliasConstructId = match[1];
            const aliasNode = context.findNode(stackName + '/' + aliasConstructId);
            const aliasResource = aliasNode?.children.find(c => c.id === 'Resource') ?? aliasNode;
            const aliasProps = aliasResource?.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
            const fnNameRef = (aliasProps?.functionName as Record<string, unknown> | undefined)?.['Ref'];
            if (typeof fnNameRef === 'string') {
              const lambdaConstructId = fnNameRef.replace(/[A-F0-9]{8}$/, '');
              const target = context.findContainer(stackName + '/' + lambdaConstructId);
              if (target && target.id !== node.path) aliasTargetIds.add(target.id);
            }
          }
        }
      }
    }

    const items = [
      ...[...targetIds].map(targetId => ({ sourceId: node.path, targetId, label: 'invokes' })),
      ...[...aliasTargetIds].map(targetId => ({ sourceId: node.path, targetId, label: 'invokes (via alias)' })),
    ];
    if (items.length === 0) return null;
    return { kind: 'edges', items };
  },
};
