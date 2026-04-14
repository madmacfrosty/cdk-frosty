import { Rule } from '../../engine/types';
import { lambdaSuppressionsRule } from './lambda-suppressions';
import { agentcoreRuntimeRule, lambdaAgentcoreEdgeRule, agentcoreRuntimeStateMachineEdgeRule, agentcoreSecretsEdgeRule } from './agentcore';
import { agentcoreGatewayRule, agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule } from './agentcore-gateway';
import { agentsGroupRule, canariesGroupRule } from './groups';
import { eventSourceMappingRule } from './event-source-mapping';

export const projectRules: Rule[] = [
  lambdaSuppressionsRule,
  agentcoreRuntimeRule, lambdaAgentcoreEdgeRule,
  agentcoreRuntimeStateMachineEdgeRule, agentcoreSecretsEdgeRule,
  agentcoreGatewayRule, agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule,
  agentsGroupRule, canariesGroupRule,
  eventSourceMappingRule,
];
