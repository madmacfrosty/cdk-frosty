import { Rule, RuleOutput } from '../../engine/types';

export const agentsGroupRule: Rule = {
  id: 'project/agents-group',
  priority: 30,
  match(node) {
    return (
      node.fqn === '@aws-cdk/aws-bedrock-agentcore-alpha.Runtime' ||
      node.fqn === 'aws-cdk-lib.aws_bedrockagentcore.CfnGateway' ||
      node.fqn === 'aws-cdk-lib.aws_stepfunctions.StateMachine' ||
      (node.fqn === 'aws-cdk-lib.aws_lambda.Function' &&
        (node.id === 'McpLambda' || node.id === 'LifecycleLambda')) ||
      node.fqn === 'aws-cdk-lib.aws_secretsmanager.Secret'
    );
  },
  apply(): RuleOutput {
    return { kind: 'group', groupLabel: 'agents' };
  },
};

export const canariesGroupRule: Rule = {
  id: 'project/canaries-group',
  priority: 30,
  match(node) {
    return (
      node.fqn === 'aws-cdk-lib.aws_lambda.Function' ||
      node.fqn === 'aws-cdk-lib.aws_ssm.StringParameter'
    ) && node.id.toLowerCase().includes('canary');
  },
  apply(): RuleOutput {
    return { kind: 'group', groupLabel: 'canaries' };
  },
};
