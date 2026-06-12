import { DecisionAPI } from '@/lib/api/decisionApi';
import type { DecisionGraphEdge, DecisionGraphNode } from '@/types/decision';
import { Id } from '@/types/common';

export function normalizeDirectedEdge(
  fromId: number,
  toId: number,
  idToNode: Map<number, DecisionGraphNode>,
  edgeType: DecisionGraphEdge['edgeType'] = 'RELATED',
): DecisionGraphEdge | null {
  const fromNode = idToNode.get(fromId);
  const toNode = idToNode.get(toId);
  if (!fromNode?.projectSeq || !toNode?.projectSeq) return null;
  if (fromId === toId) return null;
  return { from: fromId, to: toId, edgeType: edgeType ?? 'RELATED' };
}

/** @deprecated Prefer normalizeDirectedEdge — kept for connection editor compatibility. */
export function normalizeUndirectedEdge(
  fromId: number,
  toId: number,
  idToNode: Map<number, DecisionGraphNode>,
): DecisionGraphEdge | null {
  return normalizeDirectedEdge(fromId, toId, idToNode, 'RELATED');
}

export function directedEdgeKey(edge: DecisionGraphEdge): string {
  return `${edge.from}->${edge.to}:${edge.edgeType ?? 'RELATED'}`;
}

export function edgeKey(edge: DecisionGraphEdge): string {
  return edge.from < edge.to ? `${edge.from},${edge.to}` : `${edge.to},${edge.from}`;
}

export function hasEdge(edges: DecisionGraphEdge[], fromId: number, toId: number): boolean {
  return edges.some(
    (edge) =>
      (edge.from === fromId && edge.to === toId) ||
      (edge.from === toId && edge.to === fromId),
  );
}

const sortNodesForChain = (nodes: DecisionGraphNode[]) =>
  [...nodes].sort((a, b) => {
    const aSeq = a.projectSeq ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.projectSeq ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

/** Connect each decision to the next in project sequence (#1 → #2 → #3 …). */
export function buildSequentialChainEdges(
  nodes: DecisionGraphNode[],
  existingEdges: DecisionGraphEdge[] = [],
): DecisionGraphEdge[] {
  if (nodes.length < 2) return existingEdges;

  const idToNode = new Map(nodes.map((node) => [node.id, node]));
  const nextEdges = [...existingEdges];
  const sorted = sortNodesForChain(nodes);

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (hasEdge(nextEdges, from.id, to.id)) continue;
    const edge = normalizeDirectedEdge(from.id, to.id, idToNode, 'RELATED');
    if (edge) nextEdges.push(edge);
  }

  return nextEdges;
}

function connectedIdsFromEdges(
  edges: DecisionGraphEdge[],
  idToNode: Map<number, DecisionGraphNode>,
): Map<number, number[]> {
  const byNode = new Map<number, Set<number>>();
  edges.forEach((e) => {
    const fromNode = idToNode.get(e.from);
    const toNode = idToNode.get(e.to);
    if (fromNode && toNode) {
      if (!byNode.has(e.from)) byNode.set(e.from, new Set());
      byNode.get(e.from)!.add(toNode.id);
      if (!byNode.has(e.to)) byNode.set(e.to, new Set());
      byNode.get(e.to)!.add(fromNode.id);
    }
  });
  const result = new Map<number, number[]>();
  byNode.forEach((set, nodeId) => {
    result.set(nodeId, Array.from(set).sort((a, b) => a - b));
  });
  return result;
}

/** Persist link diffs via decision connections API (one PUT per edge owner). */
export async function persistGraphLinkChanges(
  nodes: DecisionGraphNode[],
  nextEdges: DecisionGraphEdge[],
  prevEdges: DecisionGraphEdge[],
  projectId: Id,
): Promise<void> {
  const idToNode = new Map<number, DecisionGraphNode>();
  nodes.forEach((n) => idToNode.set(n.id, n));

  const currentByNode = connectedIdsFromEdges(nextEdges, idToNode);
  const initialByNode = connectedIdsFromEdges(prevEdges, idToNode);
  const updates: { decisionId: number; connectedIds: number[]; projectId: Id }[] = [];

  nodes.forEach((node) => {
    if (!node.projectId) return;
    const current = currentByNode.get(node.id) ?? [];
    const initial = initialByNode.get(node.id) ?? [];
    const setCurrent = new Set(current);
    const setInitial = new Set(initial);
    if (setCurrent.size !== setInitial.size || current.some((s) => !setInitial.has(s))) {
      updates.push({ decisionId: node.id, connectedIds: current, projectId: node.projectId });
    }
  });

  const currentKeys = new Set(nextEdges.map(edgeKey));
  const initialKeys = new Set(prevEdges.map(edgeKey));
  const changedEdges: DecisionGraphEdge[] = [
    ...nextEdges.filter((e) => !initialKeys.has(edgeKey(e))),
    ...prevEdges.filter((e) => !currentKeys.has(edgeKey(e))),
  ];

  const ownerNodeIds = new Set<number>();
  for (const e of changedEdges) {
    ownerNodeIds.add(e.from <= e.to ? e.from : e.to);
  }

  const filteredUpdates = updates.filter((u) => ownerNodeIds.has(u.decisionId));
  for (const u of filteredUpdates) {
    await DecisionAPI.updateConnectionsById(u.decisionId, u.connectedIds, u.projectId || projectId);
  }
}
