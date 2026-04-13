import * as fs from 'fs';
import { CdkNode, CdkTree } from './types';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function buildNode(raw: Record<string, unknown>, parentPath?: string): CdkNode | null {
  if (typeof raw['id'] !== 'string' || !raw['id']) {
    process.stderr.write(`Warning: skipping malformed node: missing field "id"\n`);
    return null;
  }
  if (typeof raw['path'] !== 'string' || !raw['path']) {
    process.stderr.write(`Warning: skipping malformed node: missing field "path"\n`);
    return null;
  }

  const id = raw['id'] as string;
  const path = raw['path'] as string;

  let fqn = 'unknown';
  const constructInfo = raw['constructInfo'] as Record<string, unknown> | undefined;
  if (constructInfo && typeof constructInfo['fqn'] === 'string') {
    fqn = constructInfo['fqn'];
  } else {
    process.stderr.write(`Warning: node "${path}" has no constructInfo.fqn; using 'unknown'\n`);
  }

  const attributes = (raw['attributes'] as Record<string, unknown>) ?? {};
  const rawChildren = raw['children'] as Record<string, Record<string, unknown>> | undefined;

  const children: CdkNode[] = [];
  if (rawChildren && typeof rawChildren === 'object') {
    for (const childRaw of Object.values(rawChildren)) {
      const child = buildNode(childRaw, path);
      if (child) children.push(child);
    }
  }

  return { id, path, fqn, parentPath, children, attributes };
}

export function parse(filePath: string): CdkTree {
  const cleanPath = stripAnsi(filePath);

  if (!fs.existsSync(filePath)) {
    throw { exitCode: 1, message: `File not found: ${cleanPath}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw { exitCode: 2, message: `Invalid JSON: ${cleanPath}` };
  }

  if (!raw || typeof raw !== 'object') {
    throw { exitCode: 2, message: `Invalid JSON: ${cleanPath}` };
  }

  const parsed = raw as Record<string, unknown>;

  if (!parsed['tree']) {
    throw { exitCode: 2, message: `Input file is missing required field "tree" (file: ${cleanPath})` };
  }

  const treeRaw = parsed['tree'] as Record<string, unknown>;

  if (!treeRaw['id']) {
    throw { exitCode: 2, message: `Input file is missing required field "tree.id" (file: ${cleanPath})` };
  }

  if (!treeRaw['children']) {
    throw { exitCode: 2, message: `Input file is missing required field "tree.children" (file: ${cleanPath})` };
  }

  const version = typeof parsed['version'] === 'string' ? parsed['version'] : '';
  if (!version || !version.startsWith('tree-0.1')) {
    process.stderr.write(`Warning: unrecognised tree version "${version}"; expected CDK v2 (tree-0.1.*)\n`);
  }

  const root = buildNode(treeRaw, undefined);
  if (!root) {
    throw { exitCode: 2, message: `Invalid tree root (file: ${cleanPath})` };
  }

  return { version, root };
}
