# cdk-frosty

Visualizes AWS CDK architecture from a `tree.json` file. It reads the CDK construct tree produced by `cdk synth`, applies rules to identify meaningful architecture components, and renders an interactive HTML diagram using [Mermaid](https://mermaid.js.org/).

## Installation

```bash
npm install
npm run build
```

Or run directly without building:

```bash
npm run dev -- tree.json
```

## Usage

```
cdk-frosty [options] <input>

Arguments:
  input                  Path to CDK tree.json file

Options:
  --output <path>        Output HTML file path (default: <input>.html)
  --rules <path>         Additional rules file (repeatable)
  --stack <pattern>      Only include stacks whose name contains this pattern (case-insensitive)
```

### Examples

```bash
# Generate diagram from tree.json
cdk-frosty tree.json

# Write to a specific output file
cdk-frosty tree.json --output architecture.html

# Filter to a single stage
cdk-frosty tree.json --stack gamma

# Add project-specific rules on top of the defaults
cdk-frosty tree.json --rules src/rules/project/index.js
```

### Generating tree.json

```bash
cdk synth --no-staging 2>/dev/null
# tree.json is written to cdk.out/
cdk-frosty cdk.out/tree.json
```

## How it works

```
tree.json  →  Parser  →  CdkTree
                              │
                              ▼
                     Rules Engine (match + apply)
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                Containers           Edges
                     └────────┬────────┘
                              ▼
                         ArchGraph
                              │
                              ▼
                  Mermaid renderer → HTML
```

1. **Parser** — reads `tree.json` and builds a typed tree of CDK nodes
2. **Rules engine** — each rule matches a CDK node by FQN and emits containers and/or edges into an architecture graph
3. **Graph builder** — resolves parent/child relationships and deduplicates edges
4. **Renderer** — converts the graph to a Mermaid flowchart embedded in a self-contained HTML file

## Built-in rules

### Containers

| Rule | CDK construct | containerType |
|---|---|---|
| lambda | `aws-cdk-lib.aws_lambda.Function` | `lambda` |
| sqs | `aws-cdk-lib.aws_sqs.Queue` | `queue` |
| dynamodb | `aws-cdk-lib.aws_dynamodb.Table` | `dynamodb` |
| apigw | `aws-cdk-lib.aws_apigateway.RestApi` | `apigw-rest` |
| apigw | `aws-cdk-lib.aws_apigatewayv2.WebSocketApi` | `apigw-websocket` |
| stepfunctions | `aws-cdk-lib.aws_stepfunctions.StateMachine` | `state-machine` |
| ssm | `aws-cdk-lib.aws_ssm.StringParameter` | `ssm-parameter` |
| secrets-manager | `aws-cdk-lib.aws_secretsmanager.Secret` | `secret` |
| agentcore-runtime | `@aws-cdk/aws-bedrock-agentcore-alpha.Runtime` | `agentcore-runtime` |
| agentcore-gateway | `@aws-cdk/aws-bedrock-agentcore-alpha.Gateway` | `agentcore-gateway` |

### Edges

| Rule | Relationship detected |
|---|---|
| event-source-mapping | SQS → Lambda trigger |
| lambda-invoke-edge | Lambda → Lambda (cross-stack IAM) |
| lambda-dynamo-edge | Lambda → DynamoDB (same-stack and cross-stack) |
| lambda-apigw-invoke-edge | Lambda → API Gateway (`execute-api:Invoke`) |
| apigw-edge | API Gateway → Lambda integration |
| agentcore-lambda-edge | Lambda → AgentCore Runtime (IAM policy) |
| agentcore-gateway-edge | Runtime → Gateway; Gateway → MCP Lambda |
| agentcore-runtime-resource-edge | Runtime → cross-stack resource (env var) |
| agentcore-runtime-statemachine-edge | Runtime → Step Functions (env var ARN) |

## Diagram shapes

Containers are rendered with shapes that reflect their type:

| Shape | Types |
|---|---|
| Rectangle `[label]` | Lambda, IAM Role, AgentCore Runtime/Gateway |
| Cylinder `[(label)]` | DynamoDB, Secrets Manager, SSM Parameter |
| Stadium `([label])` | SQS Queue |
| Subroutine `[[label]]` | Step Functions State Machine |
| Parallelogram `[/label/]` | API Gateway (REST and WebSocket) |

## Custom rules

Rules are plain TypeScript/JavaScript objects implementing the `Rule` interface:

```typescript
import { Rule } from 'cdk-frosty/engine/types';

export const myRule: Rule = {
  id: 'my-rules/my-resource',
  priority: 50,
  match(node) {
    return node.fqn === 'my-constructs.MyResource';
  },
  apply(node, context) {
    return { kind: 'container', label: node.id, containerType: 'my-resource' };
  },
};

export default [myRule];
```

Pass the compiled file via `--rules path/to/my-rules.js`.

## Development

```bash
npm test          # run all tests
npm run build     # compile TypeScript
npm run dev       # run with ts-node (no build step)
```

## License

MIT © Mick Frost
