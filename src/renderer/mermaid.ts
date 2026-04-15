import { ArchContainer, ArchEdge, ArchGraph } from '../engine/types';

function sanitizeId(cdkPath: string): string {
  return cdkPath.replace(/[^a-zA-Z0-9]/g, '_');
}

function escapeLabel(label: string): string {
  return label
    .replace(/\n/g, ' ')
    .replace(/&/g, '#amp;')
    .replace(/"/g, '#quot;')
    .replace(/\[/g, '#lsqb;')
    .replace(/\]/g, '#rsqb;')
    .replace(/\(/g, '#lpar;')
    .replace(/\)/g, '#rpar;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;');
}

function buildLabel(container: ArchContainer): string {
  return escapeLabel(container.label);
}

function nodeShape(container: ArchContainer, label: string): string {
  switch (container.containerType) {
    case 'dynamodb':
    case 'secret':
    case 'ssm-parameter':
      return `[(\"${label}\")]`;
    case 'queue':
      return `([\"${label}\"])`;
    case 'state-machine':
      return `[[\"${label}\"]]`;
    case 'apigw-rest':
    case 'apigw-websocket':
      return `[/\"${label}\"/]`;
    default:
      return `[\"${label}\"]`;
  }
}

function renderContainers(
  ids: string[],
  containers: Map<string, ArchContainer>,
  indent: string
): string {
  const lines: string[] = [];

  for (const id of ids) {
    const container = containers.get(id);
    if (!container) continue;

    const nodeId = sanitizeId(id);
    const label = buildLabel(container);

    // Find children: containers whose parentId === this container's id
    const children = [...containers.values()]
      .filter(c => c.parentId === id)
      .map(c => c.id);

    if (children.length > 0) {
      lines.push(`${indent}subgraph ${nodeId} ["${label}"]`);
      lines.push(renderContainers(children, containers, indent + '  '));
      lines.push(`${indent}end`);
    } else {
      lines.push(`${indent}${nodeId}${nodeShape(container, label)}`);
    }
  }

  return lines.join('\n');
}

function renderEdge(edge: ArchEdge): string {
  const srcId = sanitizeId(edge.sourceId);
  const tgtId = sanitizeId(edge.targetId);
  if (edge.label) {
    return `  ${srcId} -->|"${escapeLabel(edge.label)}"| ${tgtId}`;
  }
  return `  ${srcId} --> ${tgtId}`;
}

export function archGraphToMermaid(graph: ArchGraph): string {
  const lines: string[] = ['flowchart TD'];

  // Collect groups and their root members
  const groups = new Map<string, { label: string; rootIds: string[] }>();
  for (const rootId of graph.roots) {
    const container = graph.containers.get(rootId);
    if (!container?.groupId) continue;
    let group = groups.get(container.groupId);
    if (!group) {
      group = { label: container.groupLabel ?? container.groupId, rootIds: [] };
      groups.set(container.groupId, group);
    }
    group.rootIds.push(rootId);
  }

  const groupedRootIds = new Set([...groups.values()].flatMap(g => g.rootIds));

  // Render group subgraphs
  for (const [groupId, group] of groups) {
    lines.push(`  subgraph ${sanitizeId(groupId)} ["${escapeLabel(group.label)}"]`);
    lines.push(renderContainers(group.rootIds, graph.containers, '    '));
    lines.push(`  end`);
  }

  // Render ungrouped root containers
  const ungroupedRoots = graph.roots.filter(id => !groupedRootIds.has(id));
  const rootContents = renderContainers(ungroupedRoots, graph.containers, '  ');
  if (rootContents) lines.push(rootContents);

  // Render edges after all nodes/subgraphs
  for (const edge of graph.edges) {
    lines.push(renderEdge(edge));
  }

  return lines.join('\n');
}
