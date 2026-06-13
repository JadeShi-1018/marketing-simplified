import type { DecisionGraphEdge, DecisionGraphNode } from '@/types/decision';

export interface DecisionGraphStats {
  nodeCount: number;
  edgeCount: number;
  rootCount: number;
  orphanCount: number;
  followUpCount: number;
  relatedCount: number;
}

/** Summarize graph structure for the decision map toolbar. */
export function computeDecisionGraphStats(
  nodes: DecisionGraphNode[],
  edges: DecisionGraphEdge[],
): DecisionGraphStats {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map<number, number>();
  const outgoing = new Map<number, number>();

  nodeIds.forEach((id) => {
    incoming.set(id, 0);
    outgoing.set(id, 0);
  });

  let followUpCount = 0;
  let relatedCount = 0;

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    if (edge.edgeType === 'FOLLOW_UP') followUpCount += 1;
    else relatedCount += 1;
  });

  let rootCount = 0;
  let orphanCount = 0;
  nodeIds.forEach((id) => {
    const inDeg = incoming.get(id) ?? 0;
    const outDeg = outgoing.get(id) ?? 0;
    if (inDeg === 0 && outDeg > 0) rootCount += 1;
    if (inDeg === 0 && outDeg === 0) orphanCount += 1;
  });

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    rootCount,
    orphanCount,
    followUpCount,
    relatedCount,
  };
}
