import { Rule } from '../../engine/types';
import { lambdaRule } from './lambda';
import { sqsRule } from './sqs';
import { iamRoleRule } from './iam-role';
import { eventSourceMappingRule } from './event-source-mapping';

export const defaultRules: Rule[] = [lambdaRule, sqsRule, iamRoleRule, eventSourceMappingRule];
