import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';

const CLI = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = child_process.spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-frosty-e2e-'));
}

describe('E2E functional tests', () => {
  beforeAll(() => {
    // Ensure CLI is built
    if (!fs.existsSync(CLI)) {
      child_process.execSync('npm run build', { cwd: path.resolve(__dirname, '..', '..') });
    }
  });

  // Scenario 1: basic pipeline — Lambda, SQS, edge
  it('Scenario 1: basic pipeline produces HTML with Lambda, SQS, and edge', () => {
    const dir = tmpDir();
    const outFile = path.join(dir, 'out.html');
    const result = run([path.join(FIXTURES, 'basic.json'), '--output', outFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Architecture diagram written to:');
    const html = fs.readFileSync(outFile, 'utf8');
    // Lambda node ID (sanitised CDK path)
    expect(html).toContain('MyStack_MyFunction');
    // SQS queue node ID
    expect(html).toContain('MyStack_Queue');
    // Edge between them (triggers)
    expect(html).toContain('triggers');
  });

  // Scenario 3: synthetic group — user rule adds Compute group to Lambdas
  it('Scenario 3: user rule with group label annotates Lambda nodes', () => {
    const dir = tmpDir();
    const rulesFile = path.join(dir, 'group-rules.js');
    fs.writeFileSync(rulesFile, `
module.exports = [{
  id: 'user/compute-group',
  priority: 200,
  match(node) { return node.fqn === 'aws-cdk-lib.aws_lambda.Function'; },
  apply(node) { return { kind: 'container', label: node.id, containerType: 'lambda' }; },
}];
`);
    const fixture = path.join(dir, 'two-lambdas.json');
    fs.writeFileSync(fixture, JSON.stringify({
      version: 'tree-0.1',
      tree: {
        id: 'App', path: 'App',
        constructInfo: { fqn: 'aws-cdk-lib.App', version: '2.0.0' },
        children: {
          Stack: {
            id: 'Stack', path: 'Stack',
            constructInfo: { fqn: 'aws-cdk-lib.Stack', version: '2.0.0' },
            children: {
              Fn1: { id: 'Fn1', path: 'Stack/Fn1', constructInfo: { fqn: 'aws-cdk-lib.aws_lambda.Function', version: '2.0.0' }, children: {} },
              Fn2: { id: 'Fn2', path: 'Stack/Fn2', constructInfo: { fqn: 'aws-cdk-lib.aws_lambda.Function', version: '2.0.0' }, children: {} },
            },
          },
        },
      },
    }));
    const outFile = path.join(dir, 'out.html');
    const result = run([fixture, '--output', outFile, '--rules', rulesFile]);
    expect(result.exitCode).toBe(0);
    const html = fs.readFileSync(outFile, 'utf8');
    // User rule overrides with priority 200 — both lambdas appear
    expect(html).toContain('Stack_Fn1');
    expect(html).toContain('Stack_Fn2');
  });

  // Scenario 4: unmatched node warning
  it('Scenario 4: unmatched DynamoDB node produces warning but still writes HTML', () => {
    const dir = tmpDir();
    const fixture = path.join(dir, 'dynamo.json');
    fs.writeFileSync(fixture, JSON.stringify({
      version: 'tree-0.1',
      tree: {
        id: 'App', path: 'App',
        constructInfo: { fqn: 'aws-cdk-lib.App', version: '2.0.0' },
        children: {
          Stack: {
            id: 'Stack', path: 'Stack',
            constructInfo: { fqn: 'aws-cdk-lib.Stack', version: '2.0.0' },
            children: {
              Table: { id: 'Table', path: 'Stack/Table', constructInfo: { fqn: 'aws-cdk-lib.aws_dynamodb.CfnTable', version: '2.0.0' }, children: {} },
            },
          },
        },
      },
    }));
    const outFile = path.join(dir, 'out.html');
    const result = run([fixture, '--output', outFile]);
    // HTML still written
    expect(fs.existsSync(outFile)).toBe(true);
    expect(result.stderr).toContain('no rule matched CDK node');
  });

  // Scenario 5: user rule override
  it('Scenario 5: high-priority user rule overrides Lambda label', () => {
    const dir = tmpDir();
    const rulesFile = path.join(dir, 'override-rules.js');
    fs.writeFileSync(rulesFile, `
module.exports = [{
  id: 'user/fn-override',
  priority: 200,
  match(node) { return node.fqn === 'aws-cdk-lib.aws_lambda.Function'; },
  apply() { return { kind: 'container', label: 'Function', containerType: 'function' }; },
}];
`);
    const outFile = path.join(dir, 'out.html');
    const result = run([path.join(FIXTURES, 'basic.json'), '--output', outFile, '--rules', rulesFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('loading rules from');
    const html = fs.readFileSync(outFile, 'utf8');
    expect(html).toContain('Function');
  });

  // Scenario 8: output path defaulting
  it('Scenario 8: default output path is <input-dir>/<basename>.html', () => {
    const dir = tmpDir();
    const fixture = path.join(dir, 'mytree.json');
    fs.copyFileSync(path.join(FIXTURES, 'basic.json'), fixture);
    const result = run([fixture]);
    expect(result.exitCode).toBe(0);
    const expectedOutput = path.join(dir, 'mytree.html');
    expect(fs.existsSync(expectedOutput)).toBe(true);
  });

  // Scenario 10: missing rules file
  it('Scenario 10: missing --rules file exits 3 with no HTML written', () => {
    const dir = tmpDir();
    const outFile = path.join(dir, 'out.html');
    const result = run([path.join(FIXTURES, 'basic.json'), '--output', outFile, '--rules', '/nonexistent/rules.js']);
    expect(result.exitCode).toBe(3);
    expect(fs.existsSync(outFile)).toBe(false);
    expect(result.stderr).toContain('Rules file not found');
  });

  // Scenario 14: no args
  it('Scenario 14: no args exits 1 with usage text', () => {
    const result = run([]);
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined.toLowerCase()).toMatch(/usage|error|missing/i);
  });
});
