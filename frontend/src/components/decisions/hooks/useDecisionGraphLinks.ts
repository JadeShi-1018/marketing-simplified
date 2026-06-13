'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  buildSequentialChainEdges,
  hasEdge,
  normalizeDirectedEdge,
  persistGraphLinkChanges,
} from '@/components/decisions/decisionGraphLinks';
import type { DecisionGraphEdge, DecisionGraphNode } from '@/types/decision';

export function useDecisionGraphLinks(
  projectId: number | null | undefined,
  nodes: DecisionGraphNode[],
  serverEdges: DecisionGraphEdge[],
  enabled: boolean,
  onEdgesSaved?: (edges: DecisionGraphEdge[]) => void,
) {
  const [edges, setEdges] = useState<DecisionGraphEdge[]>(serverEdges);
  const [saving, setSaving] = useState(false);
  const pendingLinksRef = useRef<Set<string>>(new Set());

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
      if (!enabled || !projectId || saving) return;
      const pendingKey = `${fromId}->${toId}`;
      if (pendingLinksRef.current.has(pendingKey)) return;

      const newEdge = normalizeDirectedEdge(fromId, toId, idToNode, 'RELATED');
      if (!newEdge) {
        toast.error('Cannot link these decisions.');
        return;
      }
      if (hasEdge(edges, newEdge.from, newEdge.to)) {
        return;
      }

      pendingLinksRef.current.add(pendingKey);
      const nextEdges = [...edges, newEdge];
      try {
        await applyEdgeChange(nextEdges, edges);
        toast.success('Link added');
      } catch {
        // toast shown in applyEdgeChange
      } finally {
        pendingLinksRef.current.delete(pendingKey);
      }
    },
    [enabled, projectId, saving, idToNode, edges, applyEdgeChange],
  );

  const handleAutoLinkSequence = useCallback(async (): Promise<boolean> => {
    if (!enabled || !projectId || nodes.length < 2) return false;
    const nextEdges = buildSequentialChainEdges(nodes, edges);
    if (nextEdges.length === edges.length) return false;
    try {
      await applyEdgeChange(nextEdges, edges);
      return true;
    } catch {
      return false;
    }
  }, [enabled, projectId, nodes, edges, applyEdgeChange]);

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
    handleAutoLinkSequence,
    handleRemoveLink,
  };
}
