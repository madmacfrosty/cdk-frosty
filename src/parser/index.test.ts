import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from './index';

function writeTmp(content: string): string {
  const p = path.join(os.tmpdir(), `cdk-frosty-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(p, content);
  return p;
}

function makeTree(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 'tree-0.1',
    tree: {
      id: 'App',
      path: 'App',
      constructInfo: { fqn: 'aws-cdk-lib.App', version: '2.0.0' },
      children: {
        Stack: {
          id: 'Stack',
          path: 'Stack',
          constructInfo: { fqn: 'aws-cdk-lib.Stack', version: '2.0.0' },
          children: {
            L2: {
              id: 'L2',
              path: 'Stack/L2',
              constructInfo: { fqn: 'aws-cdk-lib.Construct', version: '2.0.0' },
              children: {
                Fn: {
                  id: 'Fn',
                  path: 'Stack/L2/Fn',
                  constructInfo: { fqn: 'aws-cdk-lib.aws_lambda.Function', version: '2.0.0' },
                  children: {},
                },
              },
            },
            Fn2: {
              id: 'Fn2',
              path: 'Stack/Fn2',
              constructInfo: { fqn: 'aws-cdk-lib.aws_lambda.Function', version: '2.0.0' },
              children: {},
            },
          },
        },
      },
    },
    ...overrides,
  };
}

describe('parse', () => {
  // Test 1: 3-level nesting + siblings
  it('returns all nodes with correct parentPath for 3-level nesting', () => {
    const p = writeTmp(JSON.stringify(makeTree()));
    const tree = parse(p);
    const fn = tree.root.children[0].children[0].children[0]; // App/Stack/L2/Fn
    expect(fn.path).toBe('Stack/L2/Fn');
    expect(fn.parentPath).toBe('Stack/L2');
    expect(fn.id).toBe('Fn');
    expect(tree.root.parentPath).toBeUndefined();
    const fn2 = tree.root.children[0].children[1]; // App/Stack/Fn2
    expect(fn2.parentPath).toBe('Stack');
  });

  // Test 2: Multiple siblings at same level
  it('includes all siblings with same parentPath', () => {
    const p = writeTmp(JSON.stringify(makeTree()));
    const tree = parse(p);
    const stackChildren = tree.root.children[0].children;
    expect(stackChildren.length).toBe(2);
    expect(stackChildren.every(c => c.parentPath === 'Stack')).toBe(true);
  });

  // Test 3: File not found
  it('throws exitCode 1 for non-existent file', () => {
    expect(() => parse('/nonexistent/path/tree.json')).toThrow(
      expect.objectContaining({ exitCode: 1 })
    );
  });

  // Test 4: Invalid JSON
  it('throws exitCode 2 for invalid JSON', () => {
    const p = writeTmp('not valid json {{{');
    expect(() => parse(p)).toThrow(expect.objectContaining({ exitCode: 2 }));
  });

  // Test 5: Missing tree field
  it('throws exitCode 2 and names "tree" for missing tree field', () => {
    const p = writeTmp(JSON.stringify({ version: 'tree-0.1', notTree: {} }));
    let err: unknown;
    try { parse(p); } catch (e) { err = e; }
    expect(err).toMatchObject({ exitCode: 2 });
    expect((err as { message: string }).message).toContain('tree');
  });

  // Test 6: Missing tree.children
  it('throws exitCode 2 and names "tree.children" for missing children', () => {
    const p = writeTmp(JSON.stringify({ version: 'tree-0.1', tree: { id: 'App', path: 'App' } }));
    let err: unknown;
    try { parse(p); } catch (e) { err = e; }
    expect(err).toMatchObject({ exitCode: 2 });
    expect((err as { message: string }).message).toContain('tree.children');
  });

  // Test 7: Node missing constructInfo
  it('returns node with fqn "unknown" and writes warning when constructInfo missing', () => {
    const data = {
      version: 'tree-0.1',
      tree: {
        id: 'App',
        path: 'App',
        // no constructInfo
        children: {},
      },
    };
    const p = writeTmp(JSON.stringify(data));
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const tree = parse(p);
      expect(tree.root.fqn).toBe('unknown');
      const warnings = (stderrSpy.mock.calls as string[][]).flat().join('');
      expect(warnings).toContain('App');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  // Test 8: Node missing id
  it('skips node missing id, warns, and returns remaining nodes', () => {
    const data = {
      version: 'tree-0.1',
      tree: {
        id: 'App',
        path: 'App',
        constructInfo: { fqn: 'aws-cdk-lib.App', version: '2.0.0' },
        children: {
          Bad: { path: 'App/Bad', constructInfo: { fqn: 'x' }, children: {} },
          Good: { id: 'Good', path: 'App/Good', constructInfo: { fqn: 'y' }, children: {} },
        },
      },
    };
    const p = writeTmp(JSON.stringify(data));
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const tree = parse(p);
      expect(tree.root.children.length).toBe(1);
      expect(tree.root.children[0].id).toBe('Good');
      const warnings = (stderrSpy.mock.calls as string[][]).flat().join('');
      expect(warnings).toContain('"id"');
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
