import { CdkTree } from '../parser/types';
import { RuleOutput, RuleOutputMap } from '../engine/types';
import { ArchContainer, ArchEdge, ArchGraph } from './types';

export function buildGraph(outputMap: RuleOutputMap, _tree: CdkTree): ArchGraph {
  const containers = new Map<string, ArchContainer>();
  const archEdges: ArchEdge[] = [];

  // Collect group primaries: { memberFqn, groupLabel } in evaluation order
  type GroupEntry = { memberFqn: string; groupLabel: string };
  const groupEntries: GroupEntry[] = [];

  // --- Pass 1: Build containers and collect group outputs ---
  for (const [cdkPath, entry] of outputMap) {
    const { primary, metadata } = entry;

    if (primary && primary.kind === 'container') {
      const container: ArchContainer = {
        id: cdkPath,
        label: primary.label,
        containerType: primary.containerType,
        cdkPath,
        metadata: {},
      };
      for (const m of metadata) {
        if (m && m.kind === 'metadata') {
          container.metadata[m.key] = m.value;
        }
      }
      containers.set(cdkPath, container);
    }

    // Group outputs can appear as primary or in metadata
    const all: RuleOutput[] = [primary, ...metadata];
    for (const output of all) {
      if (output && output.kind === 'group') {
        groupEntries.push({ memberFqn: output.groupLabel, groupLabel: output.groupLabel });
        // Note: memberFqn is the fqn to match; we store it separately below
      }
    }
  }

  // Collect group assignments: keyed by the cdkPath of the node that produced the group output.
  // Group rules run on the individual containers they wish to tag, so path == container id.
  const groupEntriesClean: Array<{ cdkPath: string; groupLabel: string }> = [];
  for (const [cdkPath, entry] of outputMap) {
    const all: RuleOutput[] = [entry.primary, ...entry.metadata];
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
  // For each container, find matching group entries by comparing
  // the container's sourceFqn (from outputMap) against group's memberFqn.
  // First match wins (evaluation order reflects rule priority via the evaluator).
  for (const [cdkPath, container] of containers) {
    const entry = outputMap.get(cdkPath);
    if (!entry) continue;
    const { sourceFqn } = entry;

    // Find group entry by path (the node that produced the group output is the same as this container)
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
