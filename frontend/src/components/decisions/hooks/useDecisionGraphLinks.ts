'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  hasEdge,
  normalizeUndirectedEdge,
  persistGraphLinkChanges,
} from '@/components/decisions/decisionGraphLinks';
import type { DecisionGraphEdge, DecisionGraphNode } from '@/types/decision';
import { Id } from '@/types/common';

export function useDecisionGraphLinks(
  projectId: Id | null | undefined,
  nodes: DecisionGraphNode[],
  serverEdges: DecisionGraphEdge[],
  enabled: boolean,
  onEdgesSaved?: (edges: DecisionGraphEdge[]) => void,
) {
  const [edges, setEdges] = useState<DecisionGraphEdge[]>(serverEdges);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEdges(serverEdges);
  }, [serverEdges]);

  const idToNode = useMemo(() => {
    const map = new Map<number, DecisionGraphNode>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  const applyEdgeChange = useCallback(
    async (nextEdges: DecisionGraphEdge[], prevEdges: DecisionGraphEdge[]) => {
      if (!projectId || !enabled) return;
      setSaving(true);
      try {
        await persistGraphLinkChanges(nodes, nextEdges, prevEdges, projectId);
        setEdges(nextEdges);
        onEdgesSaved?.(nextEdges);
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (err as Error)?.message ||
          'Failed to save link';
        toast.error(detail);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [projectId, enabled, nodes, onEdgesSaved],
  );

  const handleCreateLink = useCallback(
    async (fromId: number, toId: number) => {
      if (!enabled || !projectId) return;
      const newEdge = normalizeUndirectedEdge(fromId, toId, idToNode);
      if (!newEdge) {
        toast.error('Cannot link these decisions.');
        return;
      }
      if (hasEdge(edges, newEdge.from, newEdge.to)) {
        return;
      }
      const nextEdges = [...edges, newEdge];
      try {
        await applyEdgeChange(nextEdges, edges);
        toast.success('Link added');
      } catch {
        // toast shown in applyEdgeChange
      }
    },
    [enabled, projectId, idToNode, edges, applyEdgeChange],
  );

  const handleRemoveLink = useCallback(
    async (fromId: number, toId: number) => {
      if (!enabled || !projectId) return;
      const nextEdges = edges.filter(
        (e) =>
          !(e.from === fromId && e.to === toId) && !(e.from === toId && e.to === fromId),
      );
      if (nextEdges.length === edges.length) return;
      try {
        await applyEdgeChange(nextEdges, edges);
        toast.success('Link removed');
      } catch {
        // toast shown in applyEdgeChange
      }
    },
    [enabled, projectId, edges, applyEdgeChange],
  );

  return {
    edges,
    linkingEnabled: enabled && Boolean(projectId),
    linkingDisabled: saving,
    handleCreateLink,
    handleRemoveLink,
  };
}
