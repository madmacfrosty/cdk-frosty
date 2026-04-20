// CLI unit tests — mock all pipeline dependencies

jest.mock('./parser', () => ({ parse: jest.fn() }));
jest.mock('./rules/registry', () => ({ loadRules: jest.fn() }));
jest.mock('./engine', () => ({ execute: jest.fn() }));
jest.mock('./renderer', () => ({ render: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

import * as fs from 'fs';
import { parse } from './parser';
import { loadRules } from './rules/registry';
import { execute } from './engine';
import { render } from './renderer';

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

const mockParse = parse as jest.MockedFunction<typeof parse>;
const mockLoadRules = loadRules as jest.MockedFunction<typeof loadRules>;
const mockRun = execute as jest.MockedFunction<typeof execute>;
const mockRender = render as jest.MockedFunction<typeof render>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;

function executeCli(args: string[]): void {
  // Reset module cache and re-require cli to re-execute main()
  jest.resetModules();
  // Re-apply mocks after resetModules
  jest.mock('./parser', () => ({ parse: mockParse }));
  jest.mock('./rules/registry', () => ({ loadRules: mockLoadRules }));
  jest.mock('./engine', () => ({ execute: mockRun }));
  jest.mock('./renderer', () => ({ render: mockRender }));
  jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFileSync: mockWriteFileSync, existsSync: mockExistsSync }));

  process.argv = ['node', 'cli.js', ...args];
  try {
    require('./cli');
  } catch {
    // commander may throw on exitOverride
  }
}

describe('CLI unit tests', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Default happy-path mock returns
    const fakeTree = { version: 'tree-0.1', root: { id: 'App', path: 'App', fqn: 'x', children: [], attributes: {} } };
    const fakeRules: never[] = [];
    const fakeGraph = { containers: new Map(), edges: [], roots: [] };
    mockParse.mockReturnValue(fakeTree);
    mockLoadRules.mockReturnValue(fakeRules);
    mockRun.mockReturnValue(fakeGraph);
    mockRender.mockReturnValue('<html>test</html>');
    mockWriteFileSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    jest.resetModules();
  });

  // Test 1: parse throws exitCode 1
  it('parse() throws exitCode 1: process.exit(1) and Error [1] on stderr', () => {
    mockParse.mockImplementation(() => { throw { exitCode: 1, message: 'File not found: /bad' }; });
    executeCli(['/bad/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [1]');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // Test 2: parse throws exitCode 2
  it('parse() throws exitCode 2: process.exit(2) and Error [2] on stderr', () => {
    mockParse.mockImplementation(() => { throw { exitCode: 2, message: 'Invalid JSON' }; });
    executeCli(['/bad/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [2]');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  // Test 3: loadRules throws exitCode 3
  it('loadRules() throws exitCode 3: process.exit(3) and Error [3] on stderr', () => {
    mockLoadRules.mockImplementation(() => { throw { exitCode: 3, message: 'Rules file not found' }; });
    executeCli(['/ok/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [3]');
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  // Test 4: unhandled exception → exit 4
  it('unhandled exception: process.exit(4) and Error [4] on stderr', () => {
    mockRun.mockImplementation(() => { throw new Error('unexpected'); });
    executeCli(['/ok/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [4]');
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  // Test 5: writeFileSync throws → exit 4
  it('writeFileSync throwing: process.exit(4)', () => {
    mockWriteFileSync.mockImplementation(() => { throw new Error('disk full'); });
    executeCli(['/ok/tree.json']);
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  // Test 6: success — no exit call; stdout confirmation
  it('all mocks succeed: no process.exit call; stdout contains "Architecture diagram written to:"', () => {
    executeCli(['/ok/tree.json', '--output', '/out/result.html']);
    const stdout = (stdoutSpy.mock.calls as string[][]).flat().join('');
    expect(stdout).toContain('Architecture diagram written to:');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Test 7: output path defaulting
  it('output path defaults to input-dir/input-basename.html', () => {
    executeCli(['/a/b/tree.json']);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/a/b/tree.html'),
      expect.any(String)
    );
  });

  // Test 8: --rules flag twice — both paths passed to loadRules
  it('--rules flag twice: both paths passed to loadRules', () => {
    executeCli(['/ok/tree.json', '--rules', '/rules/a.js', '--rules', '/rules/b.js']);
    expect(mockLoadRules).toHaveBeenCalledWith(['/rules/a.js', '/rules/b.js'], undefined);
  });

  // Test 9: ANSI sequences stripped from error message
  it('ANSI sequence in error message: stripped from stderr output', () => {
    mockParse.mockImplementation(() => {
      throw { exitCode: 1, message: '\x1b[31m/bad/path\x1b[0m not found' };
    });
    executeCli(['/bad/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).not.toContain('\x1b[');
    expect(stderr).toContain('/bad/path');
  });
});

// --- T4: --renderer CLI flag tests ---

function executeCliWithRenderer(
  args: string[],
  rendererModule: Record<string, unknown> | null,
): void {
  jest.resetModules();
  jest.mock('./parser', () => ({ parse: mockParse }));
  jest.mock('./rules/registry', () => ({ loadRules: mockLoadRules }));
  jest.mock('./engine', () => ({ execute: mockRun }));
  jest.mock('./renderer', () => ({ render: mockRender }));
  jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFileSync: mockWriteFileSync, existsSync: mockExistsSync }));
  if (rendererModule !== null) {
    jest.doMock('/mock/renderer.js', () => rendererModule, { virtual: true });
  }
  process.argv = ['node', 'cli.js', ...args];
  try {
    require('./cli');
  } catch {
    // commander may throw on exitOverride
  }
}

describe('CLI --renderer flag tests', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const fakeTree = { version: 'tree-0.1', root: { id: 'App', path: 'App', fqn: 'x', children: [], attributes: {} } };
    const fakeRules: never[] = [];
    const fakeGraph = { containers: new Map(), edges: [], roots: [] };
    mockParse.mockReturnValue(fakeTree);
    mockLoadRules.mockReturnValue(fakeRules);
    mockRun.mockReturnValue(fakeGraph);
    mockRender.mockReturnValue('<html>default</html>');
    mockWriteFileSync.mockImplementation(() => undefined);
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    jest.resetModules();
  });

  // T4-1: valid renderer — render called once with correct graph; writeFileSync receives return value
  it('valid renderer: render called once with graph; writeFileSync receives renderer output', () => {
    const fakeGraph = { containers: new Map(), edges: [], roots: [] };
    mockRun.mockReturnValue(fakeGraph);
    const mockRendererRender = jest.fn().mockReturnValue('<svg>diagram</svg>');
    executeCliWithRenderer(
      ['/ok/tree.json', '--output', '/out/result.html', '--renderer', '/mock/renderer.js'],
      { render: mockRendererRender },
    );
    expect(mockRendererRender).toHaveBeenCalledTimes(1);
    expect(mockRendererRender).toHaveBeenCalledWith(fakeGraph);
    expect(mockWriteFileSync).toHaveBeenCalledWith('/out/result.html', '<svg>diagram</svg>');
  });

  // T4-2: valid renderer — render called with deep-equal graph from execute()
  it('valid renderer: render called with the exact graph object from execute()', () => {
    const specificGraph = { containers: new Map([['a', { id: 'a', label: 'A', containerType: 'lambda', cdkPath: 'a', origin: 'synthesized' as const, metadata: {} }]]), edges: [], roots: ['a'] };
    mockRun.mockReturnValue(specificGraph);
    const mockRendererRender = jest.fn().mockReturnValue('output');
    executeCliWithRenderer(
      ['/ok/tree.json', '--output', '/out/result.html', '--renderer', '/mock/renderer.js'],
      { render: mockRendererRender },
    );
    expect(mockRendererRender).toHaveBeenCalledWith(specificGraph);
  });

  // T4-3: nonexistent renderer path — exit non-zero; stderr contains path
  it('nonexistent renderer path: exit non-zero; stderr contains path', () => {
    mockExistsSync.mockImplementation((p: unknown) => p !== '/mock/renderer.js');
    executeCliWithRenderer(
      ['/ok/tree.json', '--renderer', '/mock/renderer.js'],
      null,
    );
    expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));
    const code = (exitSpy.mock.calls[0] as number[])[0];
    expect(code).toBeGreaterThan(0);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('/mock/renderer.js');
  });

  // T4-4: module missing render export — exit non-zero; stderr describes missing export
  it('module missing render export: exit non-zero; stderr describes missing export', () => {
    executeCliWithRenderer(
      ['/ok/tree.json', '--renderer', '/mock/renderer.js'],
      { notRender: () => 'nope' },
    );
    expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));
    const code = (exitSpy.mock.calls[0] as number[])[0];
    expect(code).toBeGreaterThan(0);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('render');
  });

  // T4-5: renderer render() throws synchronously — exit non-zero
  it('renderer render() throws synchronously: exit non-zero', () => {
    executeCliWithRenderer(
      ['/ok/tree.json', '--renderer', '/mock/renderer.js'],
      { render: () => { throw new Error('renderer crash'); } },
    );
    expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));
    const code = (exitSpy.mock.calls[0] as number[])[0];
    expect(code).toBeGreaterThan(0);
  });

  // T4-6: --renderer absent — default render from ./renderer is called; no dynamic loader
  it('--renderer absent: default render called; process.exit not called', () => {
    executeCliWithRenderer(
      ['/ok/tree.json', '--output', '/out/result.html'],
      null,
    );
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // T4-7: renderer render() returns null — exit non-zero; no file written
  it('renderer render() returns null: exit non-zero; writeFileSync not called', () => {
    executeCliWithRenderer(
      ['/ok/tree.json', '--renderer', '/mock/renderer.js'],
      { render: () => null },
    );
    expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));
    const code = (exitSpy.mock.calls[0] as number[])[0];
    expect(code).toBeGreaterThan(0);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  // T4-8: renderer render() returns undefined — exit non-zero; no file written
  it('renderer render() returns undefined: exit non-zero; writeFileSync not called', () => {
    executeCliWithRenderer(
      ['/ok/tree.json', '--renderer', '/mock/renderer.js'],
      { render: () => undefined },
    );
    expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));
    const code = (exitSpy.mock.calls[0] as number[])[0];
    expect(code).toBeGreaterThan(0);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
