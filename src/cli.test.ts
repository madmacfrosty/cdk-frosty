// CLI unit tests — mock all pipeline dependencies

jest.mock('./parser', () => ({ parse: jest.fn() }));
jest.mock('./engine/registry', () => ({ loadRules: jest.fn() }));
jest.mock('./engine', () => ({ transform: jest.fn() }));
jest.mock('./graph', () => ({ buildGraph: jest.fn() }));
jest.mock('./renderer', () => ({ render: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';
import { parse } from './parser';
import { loadRules } from './engine/registry';
import { transform } from './engine';
import { buildGraph } from './graph';
import { render } from './renderer';

const mockParse = parse as jest.MockedFunction<typeof parse>;
const mockLoadRules = loadRules as jest.MockedFunction<typeof loadRules>;
const mockTransform = transform as jest.MockedFunction<typeof transform>;
const mockBuildGraph = buildGraph as jest.MockedFunction<typeof buildGraph>;
const mockRender = render as jest.MockedFunction<typeof render>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;

function runCli(args: string[]): void {
  // Reset module cache and re-require cli to re-run main()
  jest.resetModules();
  // Re-apply mocks after resetModules
  jest.mock('./parser', () => ({ parse: mockParse }));
  jest.mock('./engine/registry', () => ({ loadRules: mockLoadRules }));
  jest.mock('./engine', () => ({ transform: mockTransform }));
  jest.mock('./graph', () => ({ buildGraph: mockBuildGraph }));
  jest.mock('./renderer', () => ({ render: mockRender }));
  jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFileSync: mockWriteFileSync }));

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
    const fakeMap = new Map();
    const fakeGraph = { containers: new Map(), edges: [], roots: [] };
    mockParse.mockReturnValue(fakeTree);
    mockLoadRules.mockReturnValue(fakeRules);
    mockTransform.mockReturnValue(fakeMap);
    mockBuildGraph.mockReturnValue(fakeGraph);
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
    runCli(['/bad/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [1]');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // Test 2: parse throws exitCode 2
  it('parse() throws exitCode 2: process.exit(2) and Error [2] on stderr', () => {
    mockParse.mockImplementation(() => { throw { exitCode: 2, message: 'Invalid JSON' }; });
    runCli(['/bad/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [2]');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  // Test 3: loadRules throws exitCode 3
  it('loadRules() throws exitCode 3: process.exit(3) and Error [3] on stderr', () => {
    mockLoadRules.mockImplementation(() => { throw { exitCode: 3, message: 'Rules file not found' }; });
    runCli(['/ok/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [3]');
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  // Test 4: unhandled exception → exit 4
  it('unhandled exception: process.exit(4) and Error [4] on stderr', () => {
    mockTransform.mockImplementation(() => { throw new Error('unexpected'); });
    runCli(['/ok/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).toContain('Error [4]');
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  // Test 5: writeFileSync throws → exit 4
  it('writeFileSync throwing: process.exit(4)', () => {
    mockWriteFileSync.mockImplementation(() => { throw new Error('disk full'); });
    runCli(['/ok/tree.json']);
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  // Test 6: success — no exit call; stdout confirmation
  it('all mocks succeed: no process.exit call; stdout contains "Architecture diagram written to:"', () => {
    runCli(['/ok/tree.json', '--output', '/out/result.html']);
    const stdout = (stdoutSpy.mock.calls as string[][]).flat().join('');
    expect(stdout).toContain('Architecture diagram written to:');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Test 7: output path defaulting
  it('output path defaults to input-dir/input-basename.html', () => {
    runCli(['/a/b/tree.json']);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/a/b/tree.html'),
      expect.any(String)
    );
  });

  // Test 8: --rules flag twice — both paths passed to loadRules
  it('--rules flag twice: both paths passed to loadRules', () => {
    runCli(['/ok/tree.json', '--rules', '/rules/a.js', '--rules', '/rules/b.js']);
    expect(mockLoadRules).toHaveBeenCalledWith(['/rules/a.js', '/rules/b.js'], undefined);
  });

  // Test 9: ANSI sequences stripped from error message
  it('ANSI sequence in error message: stripped from stderr output', () => {
    mockParse.mockImplementation(() => {
      throw { exitCode: 1, message: '\x1b[31m/bad/path\x1b[0m not found' };
    });
    runCli(['/bad/tree.json']);
    const stderr = (stderrSpy.mock.calls as string[][]).flat().join('');
    expect(stderr).not.toContain('\x1b[');
    expect(stderr).toContain('/bad/path');
  });
});
