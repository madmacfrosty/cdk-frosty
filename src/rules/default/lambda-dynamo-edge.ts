import { CdkNode } from '../../parser/types';
import { Rule, RuleContext, RuleOutput } from '../../engine/types';
import { stripCdkHash, parseCrossStackRef } from '../utils';

function findChild(node: CdkNode, id: string): CdkNode | undefined {
  return node.children.find(c => c.id === id);
}

function extractImportValue(resource: unknown): string | undefined {
  if (!resource || typeof resource !== 'object') return undefined;
  const r = resource as Record<string, unknown>;
  if (typeof r['Fn::ImportValue'] === 'string') return r['Fn::ImportValue'];
  const join = r['Fn::Join'];
  if (Array.isArray(join) && Array.isArray(join[1])) {
    for (const part of join[1] as unknown[]) {
      const nested = extractImportValue(part);
      if (nested) return nested;
    }
  }
  return undefined;
}

function extractGetAttLogicalIds(resource: unknown): string[] {
  if (!resource || typeof resource !== 'object') return [];
  const r = resource as Record<string, unknown>;
  if (Array.isArray(r['Fn::GetAtt'])) {
    const [logicalId] = r['Fn::GetAtt'] as [string, ...unknown[]];
    if (typeof logicalId === 'string') return [logicalId];
  }
  return [];
}

function findDynamoTables(node: CdkNode, context: RuleContext): string[] {
  const policyResource =
    findChild(findChild(findChild(node, 'ServiceRole') ?? node, 'DefaultPolicy') ?? node, 'Resource');
  if (!policyResource) return [];

  const props = policyResource.attributes?.['aws:cdk:cloudformation:props'] as Record<string, unknown> | undefined;
  const statements = (props?.policyDocument as { Statement?: unknown[] } | undefined)?.Statement;
  if (!statements) return [];

  const tableIds = new Set<string>();

  for (const stmt of statements) {
    const s = stmt as Record<string, unknown>;
    const actions = Array.isArray(s['Action']) ? s['Action'] : [s['Action']];
    const hasDynamo = actions.some((a: unknown) => typeof a === 'string' && a.startsWith('dynamodb:'));
    if (!hasDynamo) continue;

    const resources = Array.isArray(s['Resource']) ? s['Resource'] : [s['Resource']];
    for (const res of resources) {
      for (const logicalId of extractGetAttLogicalIds(res)) {
        const constructId = stripCdkHash(logicalId);
        const table = context.findContainer(constructId);
        if (table) tableIds.add(table.id);
      }
      const importValue = extractImportValue(res);
      if (importValue) {
        const ref = parseCrossStackRef(importValue);
        if (ref) {
          const table = context.findContainer(ref.stackName + '/' + ref.constructId);
          if (table) tableIds.add(table.id);
        }
      }
    }
  }

  return [...tableIds];
}

export const lambdaDynamoEdgeRule: Rule = {
  id: 'default/lambda-dynamo-edge',
  priority: 50,
  match(node) {
    return node.fqn === 'aws-cdk-lib.aws_lambda.Function';
  },
  apply(node: CdkNode, context: RuleContext): RuleOutput {
    const tableIds = findDynamoTables(node, context);
    if (tableIds.length === 0) return null;
    return {
      kind: 'edges',
      items: tableIds.map(tableId => ({ sourceId: node.path, targetId: tableId, label: 'reads/writes' })),
    };
  },
};
