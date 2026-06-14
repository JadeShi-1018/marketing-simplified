import type { Edge, Node } from 'reactflow';

export const FIT_ALL_MAX_NODES = 20;
export const FIT_LARGEST_MAX_NODES = 60;
export const ROOT_SUBTREE_MAX_DEPTH = 2;
/** Do not zoom out below this when focusing a subset — keeps cards readable on wide graphs. */
export const PARTIAL_FIT_MIN_ZOOM = 0.6;
export const FIT_ALL_MIN_ZOOM = 0.12;

export const findConnectedComponents = (nodeIds: string[], edges: Edge[]): string[][] => {
  const adjacency = new Map<string, Set<string>>();
  nodeIds.forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const visited = new Set<string>();
  const components: string[][] = [];

  nodeIds.forEach((id) => {
    if (visited.has(id)) return;
    const stack = [id];
    const component: string[] = [];
    visited.add(id);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        stack.push(neighbor);
      });
    }

    components.push(component);
  });

  return components;
};

/** Largest linked group only — excludes standalone orphan nodes. */
export const pickLargestLinkedComponentIds = (nodes: Node[], edges: Edge[]): string[] => {
  if (nodes.length === 0) return [];
  const components = findConnectedComponents(
    nodes.map((node) => node.id),
    edges,
  );
  const linked = components.filter((component) => component.length > 1);
  if (linked.length === 0) return nodes.map((node) => node.id);
  linked.sort((a, b) => b.length - a.length);
  return linked[0];
};

/** Root nodes (in-degree 0, out-degree > 0) plus downstream nodes up to maxDepth. */
export const pickRootSubtreeNodeIds = (
  nodes: Node[],
  edges: Edge[],
  maxDepth: number,
): string[] => {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach((node) => {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  });

  const roots = nodes.filter(
    (node) => (incoming.get(node.id) ?? 0) === 0 && (outgoing.get(node.id)?.length ?? 0) > 0,
  );
  if (roots.length === 0) {
    return pickLargestLinkedComponentIds(nodes, edges);
  }

  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = roots.map((node) => ({ id: node.id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (depth >= maxDepth) continue;
    for (const childId of outgoing.get(id) ?? []) {
      if (!visited.has(childId)) {
        queue.push({ id: childId, depth: depth + 1 });
      }
    }
  }

  return [...visited];
};

/**
 * Tiered initial fit:
 * - ≤20 nodes: entire graph
 * - 21–60: largest linked component (no orphans)
 * - >60: root subtrees depth ≤ 2
 */
export const pickInitialFitNodeIds = (nodes: Node[], edges: Edge[]): string[] => {
  const count = nodes.length;
  if (count === 0) return [];
  if (count <= FIT_ALL_MAX_NODES) {
    return nodes.map((node) => node.id);
  }
  if (count <= FIT_LARGEST_MAX_NODES) {
    return pickLargestLinkedComponentIds(nodes, edges);
  }
  return pickRootSubtreeNodeIds(nodes, edges, ROOT_SUBTREE_MAX_DEPTH);
};

/** Node id plus direct neighbors (for search / URL focus). */
export const neighborNodeIds = (nodeId: string, edges: Edge[], hops = 1): string[] => {
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);

  for (let hop = 0; hop < hops; hop += 1) {
    const next = new Set<string>();
    edges.forEach((edge) => {
      if (frontier.has(edge.source) && !visited.has(edge.target)) {
        visited.add(edge.target);
        next.add(edge.target);
      }
      if (frontier.has(edge.target) && !visited.has(edge.source)) {
        visited.add(edge.source);
        next.add(edge.source);
      }
    });
    frontier = next;
  }

  return [...visited];
};
