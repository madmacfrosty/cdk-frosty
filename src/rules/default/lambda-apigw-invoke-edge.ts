import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { parseCrossStackRef } from '../utils';

function extractFnImportValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v['Fn::ImportValue'] === 'string') return v['Fn::ImportValue'];
  const join = v['Fn::Join'];
  if (Array.isArray(join) && Array.isArray(join[1])) {
    for (const part of join[1] as unknown[]) {
      const nested = extractFnImportValue(part);
      if (nested) return nested;
    }
  }
  return undefined;
}

export const lambdaApiInvokeEdgeRule: Rule = {
  id: 'default/lambda-apigw-invoke-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const serviceRole = node.children.find(c => c.id === 'ServiceRole');
    const defaultPolicy = serviceRole?.children.find(c => c.id === 'DefaultPolicy');
    const policyResource = defaultPolicy?.children.find(c => c.id === 'Resource');
    if (!policyResource) return null;

    const props = policyResource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
    const statements = (props?.policyDocument as { Statement?: unknown[] } | undefined)?.Statement;
    if (!statements) return null;

    const targetIds = new Set<string>();

    for (const stmt of statements) {
      const s = stmt as Record<string, unknown>;
      const actions = Array.isArray(s['Action']) ? s['Action'] : [s['Action']];
      if (!actions.some((a: unknown) => a === 'execute-api:Invoke')) continue;

      const resources = Array.isArray(s['Resource']) ? s['Resource'] : [s['Resource']];
      for (const res of resources) {
        const fnImport = extractFnImportValue(res);
        if (!fnImport) continue;

        const ref = parseCrossStackRef(fnImport);
        if (!ref) continue;

        const api = context.findContainer(ref.stackName + '/' + ref.constructId);
        if (api) targetIds.add(api.id);
      }
    }

    if (targetIds.size === 0) return null;
    return {
      kind: 'edges',
      items: [...targetIds].map(targetId => ({ sourceId: node.path, targetId, label: 'invokes' })),
    };
  },
};
