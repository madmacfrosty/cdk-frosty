import { Rule } from '../../engine/types';
import { lambdaRule } from './lambda';
import { sqsRule } from './sqs';
import { iamRoleRule } from './iam-role';
import { eventSourceMappingRule } from './event-source-mapping';
import { dynamodbRule } from './dynamodb';
import { lambdaDynamoEdgeRule } from './lambda-dynamo-edge';
import { apigwRestRule, apigwWebSocketRule } from './apigw';
import { apigwRestEdgeRule, apigwWebSocketEdgeRule } from './apigw-edge';
import { lambdaInvokeEdgeRule } from './lambda-invoke-edge';
import { agentcoreRuntimeRule, lambdaAgentcoreEdgeRule } from './agentcore';
import { agentcoreGatewayRule, agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule } from './agentcore-gateway';
import { stateMachineRule, stateMachineLambdaEdgeRule, agentcoreRuntimeStateMachineEdgeRule } from './stepfunctions';
import { ssmParameterRule, lambdaSsmEdgeRule } from './ssm';
import { agentsGroupRule, canariesGroupRule } from './groups';
import { secretsManagerRule, agentcoreSecretsEdgeRule } from './secrets-manager';

export const defaultRules: Rule[] = [
  lambdaRule, sqsRule, iamRoleRule, eventSourceMappingRule,
  dynamodbRule, lambdaDynamoEdgeRule,
  apigwRestRule, apigwWebSocketRule, apigwRestEdgeRule, apigwWebSocketEdgeRule,
  lambdaInvokeEdgeRule,
  agentcoreRuntimeRule, lambdaAgentcoreEdgeRule,
  agentcoreGatewayRule, agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule,
  stateMachineRule, stateMachineLambdaEdgeRule, agentcoreRuntimeStateMachineEdgeRule,
  ssmParameterRule, lambdaSsmEdgeRule,
  agentsGroupRule, canariesGroupRule,
  secretsManagerRule, agentcoreSecretsEdgeRule,
];
