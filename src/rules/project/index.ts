import { Rule } from '../../engine/types';
import { lambdaSuppressionsRule } from './lambda-suppressions';
import { agentsGroupRule, canariesGroupRule } from './groups';

export const projectRules: Rule[] = [
  lambdaSuppressionsRule,
  agentsGroupRule, canariesGroupRule,
];
