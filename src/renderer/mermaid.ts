import { ArchContainer, ArchEdge, ArchGraph } from '../graph/types';

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
  const base = escapeLabel(container.label);
  if (container.groupLabel) {
    return `[${escapeLabel(container.groupLabel)}] ${base}`;
  }
  return base;
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
      lines.push(`${indent}${nodeId}["${label}"]`);
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

  // Render root containers (and their subtrees)
  const rootContents = renderContainers(graph.roots, graph.containers, '  ');
  if (rootContents) {
    lines.push(rootContents);
  }

  // Render edges after all nodes/subgraphs
  for (const edge of graph.edges) {
    lines.push(renderEdge(edge));
  }

  return lines.join('\n');
}
