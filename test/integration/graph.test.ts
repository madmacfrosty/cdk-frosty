import * as path from 'path';
import { parse } from '../../src/parser';
import { execute } from '../../src/engine';
import { ArchGraph } from '../../src/engine/types';
import { defaultRules } from '../../src/rules/default/index';
import { projectRules } from '../../src/rules/project/index';

const FIXTURE = path.resolve(__dirname, 'fixtures/cdk-tree.json');

function serializeGraph(graph: ArchGraph) {
  return {
    containers: [...graph.containers.values()]
      .map(c => ({
        id: c.id,
        label: c.label,
        containerType: c.containerType,
        ...(c.parentId !== undefined && { parentId: c.parentId }),
        ...(c.groupId !== undefined && { groupId: c.groupId }),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges
      .map(e => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        ...(e.label !== undefined && { label: e.label }),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    roots: [...graph.roots].sort(),
  };
}

describe('integration: graph snapshot', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('produces a stable graph from cdk-tree.json with all default and project rules', () => {
    const tree = parse(FIXTURE);
    const rules = [...defaultRules, ...projectRules];
    const graph = execute(tree, rules);
    expect(serializeGraph(graph)).toMatchSnapshot();
  });

  it('every container in the real graph has a valid origin', () => {
    const tree = parse(FIXTURE);
    const rules = [...defaultRules, ...projectRules];
    const graph = execute(tree, rules);
    const validOrigins = new Set(['synthesized', 'imported', 'synthetic']);
    for (const container of graph.containers.values()) {
      expect(validOrigins.has(container.origin)).toBe(true);
    }
  });
});
