import { archGraphToMermaid } from './mermaid';
import { ArchGraph, ArchContainer, ArchEdge } from '../engine/types';

function makeGraph(containers: ArchContainer[], edges: ArchEdge[] = [], roots?: string[]): ArchGraph {
  const cmap = new Map<string, ArchContainer>();
  for (const c of containers) cmap.set(c.id, c);
  const r = roots ?? containers.filter(c => !c.parentId).map(c => c.id);
  return { containers: cmap, edges, roots: r };
}

function container(id: string, label: string, parentId?: string, groupId?: string): ArchContainer {
  return { id, label, containerType: 'test', cdkPath: id, origin: 'synthesized', parentId, groupId, groupLabel: groupId, metadata: {} };
}

function edge(sourceId: string, targetId: string, label?: string): ArchEdge {
  return { id: `${sourceId}--${targetId}`, sourceId, targetId, label, metadata: {} };
}

describe('archGraphToMermaid', () => {
  // Test 1: single leaf container
  it('single leaf container: flowchart TD + node definition', () => {
    const graph = makeGraph([container('MyStack_MyFn', 'MyFn')]);
    const output = archGraphToMermaid(graph);
    expect(output).toMatch(/^flowchart TD/);
    expect(output).toContain('MyStack_MyFn["MyFn"]');
  });

  // Test 2: parent with one child → subgraph block
  it('parent with child: subgraph block containing child node', () => {
    const parent = container('Stack', 'Stack');
    const child = container('Stack_Fn', 'Fn', 'Stack');
    const graph = makeGraph([parent, child]);
    const output = archGraphToMermaid(graph);
    expect(output).toContain('subgraph Stack');
    expect(output).toContain('Stack_Fn["Fn"]');
    expect(output).toContain('end');
  });

  // Test 3: group renders as a Mermaid subgraph containing its members
  it('group label: container rendered inside a named subgraph', () => {
    const c = container('Stack_Fn', 'Fn', undefined, 'Compute');
    const graph = makeGraph([c]);
    const output = archGraphToMermaid(graph);
    expect(output).toMatch(/subgraph Compute/);
    expect(output).toContain('Stack_Fn["Fn"]');
  });

  // Test 4: edges
  it('edge with label: src -->|"label"| tgt; edge without label: src --> tgt', () => {
    const src = container('Src', 'Src');
    const tgt = container('Tgt', 'Tgt');
    const graph = makeGraph([src, tgt], [
      edge('Src', 'Tgt', 'triggers'),
      edge('Tgt', 'Src'),
    ]);
    const output = archGraphToMermaid(graph);
    expect(output).toContain('Src -->|"triggers"| Tgt');
    expect(output).toContain('Tgt --> Src');
  });

  // Test 5: CDK path with / sanitised to _
  it('CDK path / sanitised to _ in node IDs', () => {
    const c = { ...container('MyStack/MyFunction', 'MyFunction') };
    const graph = makeGraph([c]);
    const output = archGraphToMermaid(graph);
    expect(output).toContain('MyStack_MyFunction');
    expect(output).not.toContain('MyStack/MyFunction["');
  });

  // Test 6: XSS label escaped
  it('XSS label: output contains Mermaid-escaped form #lt;script#gt;', () => {
    const c = container('A', '<script>alert(1)</script>');
    const graph = makeGraph([c]);
    const output = archGraphToMermaid(graph);
    expect(output).toContain('#lt;script#gt;');
    // Vendored Mermaid is a browser bundle; parse() check done via E2E in T16a
  });

  // Test 7: quote and bracket escaping
  it('label with " and [ escaped to #quot; and #lsqb;', () => {
    const c = container('A', 'My "Function" [v2]');
    const graph = makeGraph([c]);
    const output = archGraphToMermaid(graph);
    expect(output).toContain('#quot;');
    expect(output).toContain('#lsqb;');
  });

  // Test 8: edges appear after all subgraph/node definitions
  it('edges appear after all subgraph/node definitions', () => {
    const src = container('Src', 'Src');
    const tgt = container('Tgt', 'Tgt');
    const graph = makeGraph([src, tgt], [edge('Src', 'Tgt', 'go')]);
    const output = archGraphToMermaid(graph);
    const edgeIdx = output.indexOf('-->');
    const lastNodeIdx = Math.max(output.indexOf('Src["'), output.indexOf('Tgt["'));
    expect(edgeIdx).toBeGreaterThan(lastNodeIdx);
  });

  // Test 9: two groups render as separate subgraph blocks
  it('two groups render as separate subgraph blocks', () => {
    const a = container('A', 'FnA', undefined, 'GroupA');
    const b = container('B', 'FnB', undefined, 'GroupB');
    const graph = makeGraph([a, b]);
    const output = archGraphToMermaid(graph);
    expect(output).toMatch(/subgraph GroupA/);
    expect(output).toMatch(/subgraph GroupB/);
    expect(output).toContain('A["FnA"]');
    expect(output).toContain('B["FnB"]');
  });

  // Test 10: containerType-specific node shapes
  it('dynamodb, secret, ssm-parameter render as cylinder [(label)]', () => {
    const types: ArchContainer['containerType'][] = ['dynamodb', 'secret', 'ssm-parameter'];
    for (const containerType of types) {
      const c: ArchContainer = { id: 'X', label: 'X', containerType, cdkPath: 'X', origin: 'synthesized', metadata: {} };
      const output = archGraphToMermaid(makeGraph([c]));
      expect(output).toContain('X[("X")]');
    }
  });

  it('queue renders as stadium ([label])', () => {
    const c: ArchContainer = { id: 'Q', label: 'MyQueue', containerType: 'queue', cdkPath: 'Q', origin: 'synthesized', metadata: {} };
    const output = archGraphToMermaid(makeGraph([c]));
    expect(output).toContain('Q(["MyQueue"])');
  });

  it('state-machine renders as subroutine [[label]]', () => {
    const c: ArchContainer = { id: 'SM', label: 'MySM', containerType: 'state-machine', cdkPath: 'SM', origin: 'synthesized', metadata: {} };
    const output = archGraphToMermaid(makeGraph([c]));
    expect(output).toContain('SM[["MySM"]]');
  });

  it('apigw-rest and apigw-websocket render as parallelogram [/label/]', () => {
    for (const containerType of ['apigw-rest', 'apigw-websocket'] as const) {
      const c: ArchContainer = { id: 'Api', label: 'MyApi', containerType, cdkPath: 'Api', origin: 'synthesized', metadata: {} };
      const output = archGraphToMermaid(makeGraph([c]));
      expect(output).toContain('Api[/"MyApi"/]');
    }
  });

  it('unknown containerType renders as rectangle [label]', () => {
    const c: ArchContainer = { id: 'X', label: 'X', containerType: 'lambda', cdkPath: 'X', origin: 'synthesized', metadata: {} };
    const output = archGraphToMermaid(makeGraph([c]));
    expect(output).toContain('X["X"]');
  });
});
