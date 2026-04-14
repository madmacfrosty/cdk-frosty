import { Rule } from '../../engine/types';
import { lambdaSuppressionsRule } from './lambda-suppressions';
import { lambdaAgentcoreEdgeRule, agentcoreRuntimeStateMachineEdgeRule, agentcoreSecretsEdgeRule } from './agentcore';
import { agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule } from './agentcore-gateway';
import { agentsGroupRule, canariesGroupRule } from './groups';

export const projectRules: Rule[] = [
  lambdaSuppressionsRule,
  lambdaAgentcoreEdgeRule,
  agentcoreRuntimeStateMachineEdgeRule, agentcoreSecretsEdgeRule,
  agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule,
  agentsGroupRule, canariesGroupRule,
];
