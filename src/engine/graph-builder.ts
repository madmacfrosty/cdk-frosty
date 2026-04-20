import { RuleOutput, RuleOutputMap, ArchContainer, ArchEdge, ArchGraph, ContainerOrigin } from './types';
import { CdkNode } from '../parser/types';

export function inferOrigin(node: CdkNode): ContainerOrigin {
  const hasImportSentinel = node.children.some(
    c => c.id.startsWith('Import') &&
         c.fqn === 'aws-cdk-lib.Resource' &&
         c.children.length === 0
  );
  return hasImportSentinel ? 'imported' : 'synthesized';
}

export function buildGraph(outputMap: RuleOutputMap): ArchGraph {
  const containers = new Map<string, ArchContainer>();
  const archEdges: ArchEdge[] = [];

  // Collect group assignments keyed by the cdkPath of the node that produced the group output
  const groupEntriesClean: Array<{ cdkPath: string; groupLabel: string }> = [];

  // --- Pass 1: Build containers and collect group outputs ---
  for (const [cdkPath, entry] of outputMap) {
    const { primary, metadata } = entry;

    if (primary && primary.kind === 'container') {
      const origin: ContainerOrigin = entry.node ? inferOrigin(entry.node) : 'synthetic';
      const container: ArchContainer = {
        id: cdkPath,
        label: primary.label,
        containerType: primary.containerType,
        cdkPath,
        origin,
        metadata: {},
      };
      for (const m of metadata) {
        if (m && m.kind === 'metadata') {
          container.metadata[m.key] = m.value;
        }
      }
      containers.set(cdkPath, container);
    }

    const all: RuleOutput[] = [primary, ...metadata];
    for (const output of all) {
      if (output && output.kind === 'group') {
        groupEntriesClean.push({ cdkPath, groupLabel: output.groupLabel });
      }
    }
  }

  // --- Pass 2: Assign hierarchy (parentId) ---
  for (const [cdkPath, container] of containers) {
    const parts = cdkPath.split('/');
    let parentId: string | undefined;

    for (let len = parts.length - 1; len >= 1; len--) {
      const candidate = parts.slice(0, len).join('/');
      if (containers.has(candidate)) {
        parentId = candidate;
        break;
      }
    }

    container.parentId = parentId;
  }

  // --- Pass 3: Assign groups ---
  for (const [cdkPath, container] of containers) {
    const match = groupEntriesClean.find(g => g.cdkPath === cdkPath);
    if (match) {
      container.groupId = match.groupLabel;
      container.groupLabel = match.groupLabel;
    }
  }

  // --- Pass 4: Build edges ---
  const edgeIdCount = new Map<string, number>();

  for (const [, entry] of outputMap) {
    const { edges, metadata } = entry;

    for (const item of edges) {
      const baseId = `${item.sourceId}--${item.targetId}`;
      const count = edgeIdCount.get(baseId) ?? 0;
      const edgeId = count === 0 ? baseId : `${baseId}--${count + 1}`;
      edgeIdCount.set(baseId, count + 1);

      const edge: ArchEdge = {
        id: edgeId,
        sourceId: item.sourceId,
        targetId: item.targetId,
        label: item.label,
        style: item.style,
        metadata: {},
      };

      for (const m of metadata) {
        if (m && m.kind === 'metadata' &&
            m.targetEdgeSourceId === item.sourceId &&
            m.targetEdgeTargetId === item.targetId) {
          edge.metadata[m.key] = m.value;
        }
      }

      archEdges.push(edge);
    }
  }

  // --- Pass 5: Validate orphaned metadata ---
  for (const [, entry] of outputMap) {
    const { edges: entryEdges, metadata } = entry;
    if (entryEdges.length > 0) continue;

    for (const m of metadata) {
      if (m && m.kind === 'metadata') {
        const baseId = `${m.targetEdgeSourceId}--${m.targetEdgeTargetId}`;
        const exists = archEdges.some(e => e.id === baseId || e.id.startsWith(baseId + '--'));
        if (!exists) {
          process.stderr.write(
            `Warning: rule produced metadata targeting edge ${m.targetEdgeSourceId} --> ${m.targetEdgeTargetId}, but that edge does not exist\n`
          );
        }
      }
    }
  }

  // --- Roots: containers with no parentId ---
  const roots: string[] = [];
  for (const [id, container] of containers) {
    if (!container.parentId) roots.push(id);
  }

  return { containers, edges: archEdges, roots };
}
