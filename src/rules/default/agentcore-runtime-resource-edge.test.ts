import { agentcoreRuntimeResourceEdgeRule } from './agentcore-runtime-resource-edge';
import { CdkNode } from '../../parser/types';
import { ArchContainer, RuleContext } from '../../engine/types';

const noopContext: RuleContext = { findContainer: () => undefined, findNode: () => undefined, findNodeWhere: () => undefined };

function container(id: string): ArchContainer {
  return { id, label: id.split('/').at(-1) ?? id, containerType: 'test', cdkPath: id, origin: 'synthesized', metadata: {} };
}

function makeRuntimeNode(envVars: Record<string, unknown>, stack = 'AppStack'): CdkNode {
  const resource: CdkNode = {
    id: 'Resource',
    path: `${stack}/AgentCoreRuntime/Resource`,
    fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.CfnRuntime',
    children: [],
    attributes: { 'aws:cdk:cloudformation:props': { environmentVariables: envVars } },
  };
  return {
    id: 'AgentCoreRuntime',
    path: `${stack}/AgentCoreRuntime`,
    fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime',
    children: [resource],
    attributes: {},
  };
}

describe('agentcoreRuntimeResourceEdgeRule', () => {
  describe('match', () => {
    it('matches @aws-cdk/aws-bedrock-agentcore-alpha.Runtime', () => {
      expect(agentcoreRuntimeResourceEdgeRule.match(makeRuntimeNode({}))).toBe(true);
    });

    it('does not match other fqns', () => {
      const node: CdkNode = { id: 'X', path: 'S/X', fqn: 'aws-cdk-lib.aws_lambda.Function', children: [], attributes: {} };
      expect(agentcoreRuntimeResourceEdgeRule.match(node)).toBe(false);
    });
  });

  describe('apply', () => {
    it('returns null when no Resource child', () => {
      const node: CdkNode = { id: 'R', path: 'S/R', fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime', children: [], attributes: {} };
      expect(agentcoreRuntimeResourceEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('returns null when environmentVariables key is absent from props', () => {
      const resource: CdkNode = {
        id: 'Resource', path: 'AppStack/AgentCoreRuntime/Resource',
        fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.CfnRuntime', children: [],
        attributes: { 'aws:cdk:cloudformation:props': {} },
      };
      const node: CdkNode = {
        id: 'AgentCoreRuntime', path: 'AppStack/AgentCoreRuntime',
        fqn: '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime', children: [resource], attributes: {},
      };
      const ctx: RuleContext = {
        findContainer: () => container('AppStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeResourceEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when no Fn::ImportValue values in env vars', () => {
      const node = makeRuntimeNode({ PLAIN_VAR: 'some-value', OTHER: { Ref: 'Something' } });
      const ctx: RuleContext = {
        findContainer: () => container('AppStack/AgentCoreRuntime'),
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      expect(agentcoreRuntimeResourceEdgeRule.apply(node, ctx)).toBeNull();
    });

    it('returns null when runtime container is not found', () => {
      const node = makeRuntimeNode({
        SECRET_ARN: { 'Fn::ImportValue': 'SecretsStack:ExportsOutputRefMySecretABCDEF1234567890' },
      });
      expect(agentcoreRuntimeResourceEdgeRule.apply(node, noopContext)).toBeNull();
    });

    it('emits a reads edge for a single imported resource', () => {
      const runtime = container('AppStack/AgentCoreRuntime');
      const secret = container('SecretsStack/MySecret');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'AppStack/AgentCoreRuntime') return runtime;
          if (p === 'SecretsStack/MySecret') return secret;
          return undefined;
        },
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeRuntimeNode({
        SECRET_ARN: { 'Fn::ImportValue': 'SecretsStack:ExportsOutputRefMySecretABCDEF1234567890' },
      });
      expect(agentcoreRuntimeResourceEdgeRule.apply(node, ctx)).toEqual({
        kind: 'edges',
        items: [{ sourceId: 'AppStack/AgentCoreRuntime', targetId: 'SecretsStack/MySecret', label: 'reads' }],
      });
    });

    it('emits one edge per distinct imported resource', () => {
      const runtime = container('AppStack/AgentCoreRuntime');
      const secretA = container('SecretsStack/SecretA');
      const secretB = container('SecretsStack/SecretB');
      const ctx: RuleContext = {
        findContainer: (p) => {
          if (p === 'AppStack/AgentCoreRuntime') return runtime;
          if (p === 'SecretsStack/SecretA') return secretA;
          if (p === 'SecretsStack/SecretB') return secretB;
          return undefined;
        },
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeRuntimeNode({
        SECRET_A: { 'Fn::ImportValue': 'SecretsStack:ExportsOutputRefSecretAABCDEF1234567890' },
        SECRET_B: { 'Fn::ImportValue': 'SecretsStack:ExportsOutputRefSecretBABCDEF1234567890' },
      });
      const result = agentcoreRuntimeResourceEdgeRule.apply(node, ctx) as { kind: string; items: unknown[] };
      expect(result?.kind).toBe('edges');
      expect(result?.items).toHaveLength(2);
    });

    it('does not emit a self-edge when an env var imports the runtime itself', () => {
      const runtime = container('AppStack/AgentCoreRuntime');
      const ctx: RuleContext = {
        findContainer: () => runtime,
        findNode: () => undefined, findNodeWhere: () => undefined,
      };
      const node = makeRuntimeNode({
        SELF_REF: { 'Fn::ImportValue': 'AppStack:ExportsOutputRefAgentCoreRuntimeABCDEF1234567890' },
      });
      expect(agentcoreRuntimeResourceEdgeRule.apply(node, ctx)).toBeNull();
    });
  });
});
