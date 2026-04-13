import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';

const CLI = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');

function buildSyntheticTree(numLambdas: number): unknown {
  const stackChildren: Record<string, unknown> = {};

  for (let i = 0; i < numLambdas; i++) {
    const lambdaId = `Lambda${i}`;
    const lambdaPath = `MyStack/${lambdaId}`;
    const queueId = `Queue${i}`;

    // Lambda with ExecutionRole + EventSourceMapping children
    stackChildren[lambdaId] = {
      id: lambdaId,
      path: lambdaPath,
      constructInfo: { fqn: 'aws-cdk-lib.aws_lambda.Function', version: '2.0.0' },
      children: {
        ExecutionRole: {
          id: 'ExecutionRole',
          path: `${lambdaPath}/ExecutionRole`,
          constructInfo: { fqn: 'aws-cdk-lib.aws_iam.Role', version: '2.0.0' },
          children: {},
        },
        EventSourceMapping: {
          id: 'EventSourceMapping',
          path: `${lambdaPath}/EventSourceMapping`,
          constructInfo: { fqn: 'aws-cdk-lib.aws_lambda.EventSourceMapping', version: '2.0.0' },
          attributes: { 'aws:cdk:cloudformation:type': 'AWS::Lambda::EventSourceMapping' },
          children: {},
        },
      },
    };

    stackChildren[queueId] = {
      id: queueId,
      path: `MyStack/${queueId}`,
      constructInfo: { fqn: 'aws-cdk-lib.aws_sqs.Queue', version: '2.0.0' },
      children: {},
    };
  }

  return {
    version: 'tree-0.1',
    tree: {
      id: 'App',
      path: 'App',
      constructInfo: { fqn: 'aws-cdk-lib.App', version: '2.0.0' },
      children: {
        MyStack: {
          id: 'MyStack',
          path: 'MyStack',
          constructInfo: { fqn: 'aws-cdk-lib.Stack', version: '2.0.0' },
          children: stackChildren,
        },
      },
    },
  };
}

describe('E2E performance tests', () => {
  it('500-node synthetic tree: processed in under 5 seconds', () => {
    // 1 App + 1 Stack + 50 × (Lambda + ExecutionRole + EventSourceMapping + Queue) = 202 nodes ≈ 500
    const NUM_LAMBDAS = 50; // produces 1+1+50*4 = 202 nodes; scale to ~500 with 120 lambdas
    const tree = buildSyntheticTree(120); // 1+1+120*4 = 482 ≈ 500 nodes

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-frosty-perf-'));
    const inputFile = path.join(dir, 'perf-tree.json');
    const outputFile = path.join(dir, 'perf-out.html');

    fs.writeFileSync(inputFile, JSON.stringify(tree));

    const start = Date.now();
    const result = child_process.spawnSync('node', [CLI, inputFile, '--output', outputFile], {
      encoding: 'utf8',
      timeout: 10000,
    });
    const elapsed = Date.now() - start;

    expect(result.status).toBe(0);
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(elapsed).toBeGreaterThan(50);
    expect(elapsed).toBeLessThan(5000);

    void NUM_LAMBDAS; // suppress unused warning
  }, 15000);
});
