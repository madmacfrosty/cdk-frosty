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
import { lambdaApiInvokeEdgeRule } from './lambda-apigw-invoke-edge';
import { agentcoreRuntimeRule } from './agentcore-runtime';
import { agentcoreGatewayRule } from './agentcore-gateway';
import { agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule } from './agentcore-gateway-edge';
import { agentcoreRuntimeResourceEdgeRule } from './agentcore-runtime-resource-edge';
import { agentcoreRuntimeStateMachineEdgeRule } from './agentcore-runtime-statemachine-edge';
import { lambdaAgentcoreEdgeRule } from './agentcore-lambda-edge';
import { stateMachineRule, stateMachineLambdaEdgeRule } from './stepfunctions';
import { ssmParameterRule, lambdaSsmEdgeRule } from './ssm';
import { secretsManagerRule } from './secrets-manager';

export const defaultRules: Rule[] = [
  lambdaRule, sqsRule, iamRoleRule, eventSourceMappingRule,
  dynamodbRule, lambdaDynamoEdgeRule,
  apigwRestRule, apigwWebSocketRule, apigwRestEdgeRule, apigwWebSocketEdgeRule,
  lambdaInvokeEdgeRule, lambdaApiInvokeEdgeRule,
  agentcoreRuntimeRule, agentcoreGatewayRule,
  agentcoreRuntimeGatewayEdgeRule, agentcoreGatewayMcpEdgeRule,
  agentcoreRuntimeResourceEdgeRule, agentcoreRuntimeStateMachineEdgeRule, lambdaAgentcoreEdgeRule,
  stateMachineRule, stateMachineLambdaEdgeRule,
  ssmParameterRule, lambdaSsmEdgeRule,
  secretsManagerRule,
];
