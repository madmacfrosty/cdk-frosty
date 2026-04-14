import * as fs from 'fs';
import * as path from 'path';
import { Rule } from '../engine/types';
import { stackFilter } from './filters/stack';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function validateRule(rule: unknown, index: number, filePath: string): Rule {
  const r = rule as Record<string, unknown>;
  for (const field of ['id', 'priority', 'match', 'apply'] as const) {
    const val = r[field];
    if (field === 'id' && typeof val !== 'string') {
      throw { exitCode: 3, message: `Rule export in ${filePath} is invalid: rule at index ${index} is missing required field "id"` };
    }
    if (field === 'priority' && typeof val !== 'number') {
      throw { exitCode: 3, message: `Rule export in ${filePath} is invalid: rule at index ${index} is missing required field "priority"` };
    }
    if ((field === 'match' || field === 'apply') && typeof val !== 'function') {
      throw { exitCode: 3, message: `Rule export in ${filePath} is invalid: rule at index ${index} is missing required field "${field}"` };
    }
  }
  return rule as Rule;
}

export function loadRules(userRulesPaths: string[], stackPattern?: string): Rule[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { defaultRules } = require('./default/index') as { defaultRules: Rule[] };
  const rules: Rule[] = [...defaultRules];

  if (stackPattern) {
    rules.push(stackFilter(stackPattern));
  }

  for (const rawPath of userRulesPaths) {
    const cleanPath = stripAnsi(rawPath);
    process.stderr.write(`Warning: loading rules from ${cleanPath} (rules are executed as trusted code)\n`);

    if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).isFile()) {
      throw { exitCode: 3, message: `Rules file not found: ${cleanPath}` };
    }

    let exported: unknown;
    try {
      exported = require(path.resolve(rawPath));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw { exitCode: 3, message: `Failed to load rules from ${cleanPath}: ${msg}` };
    }

    if (!Array.isArray(exported)) {
      throw { exitCode: 3, message: `Rule export in ${cleanPath} is invalid: expected an array` };
    }

    const validated = (exported as unknown[]).map((r, i) => validateRule(r, i, cleanPath));
    rules.push(...validated);
  }

  // Scan for ID collisions — warn; earlier rule wins (both retained)
  const seen = new Map<string, number>(); // id -> first index
  for (let i = 0; i < rules.length; i++) {
    const id = rules[i].id;
    if (seen.has(id)) {
      process.stderr.write(`Warning: rule ID collision: "${id}" — duplicate at index ${i} shadows an earlier rule with the same ID\n`);
    } else {
      seen.set(id, i);
    }
  }

  return rules;
}
