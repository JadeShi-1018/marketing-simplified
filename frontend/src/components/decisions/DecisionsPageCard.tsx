'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import DecisionsCardHeader from './DecisionsCardHeader';
import DecisionsGraphSection from './DecisionsGraphSection';
import DecisionsEmptyState from './DecisionsEmptyState';
import DecisionDeleteDialog from './DecisionDeleteDialog';
import { readDecisionMapUrlState } from '@/components/decisions/decisionMapUrlState';
import { DecisionAPI } from '@/lib/api/decisionApi';
import type {
  DecisionGraphEdge,
  DecisionGraphNode,
  DecisionGraphResponse,
  DecisionListItem,
} from '@/types/decision';

interface Props {
  projectId: number | string | null;
  role?: string | null;
  canCreate: boolean;
  canDelete: boolean;
  onNavigateToDecision: (id: number | string, projectId?: number | string | null) => void;
}

export default function DecisionsPageCard({
  projectId,
  role,
  canCreate,
  canDelete,
  onNavigateToDecision,
}: Props) {
  const searchParams = useSearchParams();
  const mapFullscreen = readDecisionMapUrlState(searchParams).fullscreen;
  const [items, setItems] = useState<DecisionListItem[]>([]);
  const [graph, setGraph] = useState<DecisionGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DecisionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createRequestKey, setCreateRequestKey] = useState(0);
  useEffect(() => {
    if (!projectId) {
      setItems([]);
      setGraph(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [listRes, graphRes] = await Promise.all([
          DecisionAPI.listDecisions(projectId),
          DecisionAPI.getDecisionGraph(projectId, { scope: 'project' }).catch(() => null),
        ]);
        if (cancelled) return;
        setItems(listRes.items ?? []);
        setGraph(graphRes ?? null);
      } catch (err) {
        if (!cancelled) {
          const detail =
            (err as any)?.response?.data?.detail ||
            (err as any)?.response?.data?.error?.message ||
            (err as Error)?.message ||
            'Failed to load decisions';
          toast.error(detail);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleCreateFullPage = async () => {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const draft = await DecisionAPI.createDraft(projectId);
      if (draft.id == null) {
        throw new Error('Draft created without id');
      }
      onNavigateToDecision(draft.id, projectId);
    } catch (err) {
      const detail =
        (err as any)?.response?.data?.detail ||
        (err as any)?.response?.data?.error?.message ||
        (err as Error)?.message ||
        'Failed to create decision';
      toast.error(detail);
      setCreating(false);
    }
  };

  const handleCreateInTree = () => {
    if (!projectId || creating) return;
    setCreateRequestKey((key) => key + 1);
  };

  const handleDelete = async () => {
    if (!pendingDelete || !projectId) return;
    const deleteProjectId = pendingDelete.projectId ?? projectId;
    setDeleting(true);
    try {
      await DecisionAPI.deleteDecision(pendingDelete.slug ?? pendingDelete.id, deleteProjectId);
      toast.success('Decision deleted');
      setItems((prev) => prev.filter((d) => d.id !== pendingDelete.id));
      setGraph((prev) =>
        prev
          ? {
              nodes: prev.nodes.filter((n) => n.id !== pendingDelete.id),
              edges: prev.edges.filter(
                (e) => e.from !== pendingDelete.id && e.to !== pendingDelete.id,
              ),
            }
          : prev,
      );
      setPendingDelete(null);
    } catch (err) {
      const detail =
        (err as any)?.response?.data?.detail ||
        (err as any)?.response?.data?.error?.message ||
        (err as Error)?.message ||
        'Failed to delete decision';
      toast.error(detail);
    } finally {
      setDeleting(false);
    }
  };

  const graphDecisionCount = graph?.nodes.length ?? 0;
  const graphTopicCount = graph?.topics?.length ?? 0;
  const decisionCount = graphDecisionCount || items.length;
  const hasItems = decisionCount > 0 || graphTopicCount > 0;
  const hasGraphItems = graphDecisionCount > 0 || graphTopicCount > 0;
  const showGraphSection = hasItems || mapFullscreen;
  const graphNodeForDelete = (node: DecisionGraphNode) => {
    const listItem = items.find((i) => i.id === node.id);
    setPendingDelete(
      listItem ?? {
        id: node.id,
        title: node.title,
        status: node.status,
        riskLevel: node.riskLevel,
        projectId: node.projectId,
        projectSeq: node.projectSeq,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      },
    );
  };

  const refreshGraph = async (opts?: {
    fullReload?: boolean;
    nodePatch?: { id: number } & Partial<DecisionGraphNode>;
    edges?: DecisionGraphEdge[];
  }) => {
    if (!projectId) return;
    if (opts?.edges && !opts.fullReload) {
      setGraph((prev) => (prev ? { ...prev, edges: opts.edges! } : prev));
      return;
    }
    if (opts?.nodePatch && !opts.fullReload) {
      const { id, ...patch } = opts.nodePatch;
      setGraph((prev) =>
        prev
          ? {
              ...prev,
              nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
            }
          : prev,
      );
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      return;
    }
    try {
      const graphRes = await DecisionAPI.getDecisionGraph(projectId, { scope: 'project' });
      setGraph(graphRes ?? null);
      const listRes = await DecisionAPI.listDecisions(projectId);
      setItems(listRes.items ?? []);
    } catch {
      // Non-blocking; panel already saved
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-100 sm:rounded-xl">
        <DecisionsCardHeader
          decisionCount={decisionCount}
          role={role}
          canCreate={canCreate}
          creating={creating}
          onCreate={handleCreateFullPage}
        />

        {loading && !hasItems && !mapFullscreen ? (
          <div className="flex items-center justify-center px-3 py-12 text-gray-500 sm:px-6 sm:py-16">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading decisions…
          </div>
        ) : !hasItems && !mapFullscreen ? (
          <DecisionsEmptyState onCreate={handleCreateFullPage} canCreate={canCreate} />
        ) : showGraphSection ? (
          <DecisionsGraphSection
            graph={graph}
            projectId={projectId}
            canEdit={canDelete}
            onEditDecision={(node) => onNavigateToDecision(node.slug ?? node.id, node.projectId ?? projectId)}
            canCreate={canCreate}
            onDeleteDecision={graphNodeForDelete}
            onOpenFullPage={onNavigateToDecision}
            createRequestKey={createRequestKey}
            onDecisionUpdated={refreshGraph}
          />
        ) : null}
      </section>

      <DecisionDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(v) => {
          if (!v) setPendingDelete(null);
        }}
        title={pendingDelete?.title ?? ''}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
