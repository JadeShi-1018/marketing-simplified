'use client';

import { ChevronRight, Loader2, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import DecisionTree, { type DecisionTreeHandle } from '@/components/decisions/DecisionTree';
import DecisionFullscreenPanel from '@/components/decisions/DecisionFullscreenPanel';
import DecisionTreeDetailPanel from '@/components/decisions/DecisionTreeDetailPanel';
import DecisionTreeNavigator from '@/components/decisions/DecisionTreeNavigator';
import {
  formatDecisionDayKey,
  type TimelineGranularity,
} from '@/components/decisions/decisionTreeLayout';
import { useDecisionGraphLinks } from '@/components/decisions/hooks/useDecisionGraphLinks';
import { DecisionAPI } from '@/lib/api/decisionApi';
import type { DecisionGraphEdge, DecisionGraphNode, DecisionGraphResponse } from '@/types/decision';

interface Props {
  graph: DecisionGraphResponse | null;
  projectId?: number | null;
  canEdit: boolean;
  canCreate?: boolean;
  onEditDecision: (node: DecisionGraphNode) => void;
  onDeleteDecision?: (node: DecisionGraphNode) => void;
  onOpenFullPage?: (id: number, projectId?: number | null) => void;
  createRequestKey?: number;
  onDecisionUpdated?: (opts?: {
    fullReload?: boolean;
    nodePatch?: { id: number } & Partial<DecisionGraphNode>;
    edges?: DecisionGraphEdge[];
  }) => void | Promise<void>;
}

export default function DecisionsGraphSection({
  graph,
  projectId,
  canEdit,
  canCreate = false,
  onEditDecision,
  onDeleteDecision,
  onOpenFullPage,
  createRequestKey = 0,
  onDecisionUpdated,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSelectedId, setFullscreenSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [startInEditMode, setStartInEditMode] = useState(false);
  const [provisionalDecisionId, setProvisionalDecisionId] = useState<number | null>(null);
  const [focusDateKey, setFocusDateKey] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<number | null>(null);
  const [timelineMode, setTimelineMode] = useState<'auto' | TimelineGranularity>('auto');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [viewResetKey, setViewResetKey] = useState(0);
  const [embeddedZoomPercent, setEmbeddedZoomPercent] = useState(100);
  const [fullscreenZoomPercent, setFullscreenZoomPercent] = useState(100);
  const embeddedTreeRef = useRef<DecisionTreeHandle>(null);
  const fullscreenTreeRef = useRef<DecisionTreeHandle>(null);
  const nodes = useMemo(() => graph?.nodes ?? [], [graph?.nodes]);
  const serverEdges = useMemo(() => graph?.edges ?? [], [graph?.edges]);
  const topicCount = graph?.topics?.length ?? 0;

  const links = useDecisionGraphLinks(
    projectId,
    nodes,
    serverEdges,
    canEdit,
    (edges) => onDecisionUpdated?.({ edges }),
  );

  const nodeCount = nodes.length;
  const selectedGraphNode = useMemo(
    () => nodes.find((n) => n.id === fullscreenSelectedId) ?? null,
    [nodes, fullscreenSelectedId],
  );

  const handleSelectNode = (id: number) => {
    setStartInEditMode(false);
    setFullscreenSelectedId(id);
    setFullscreen(true);
  };

  const openFullscreenMap = () => {
    setSelectedTopic(null);
    setFullscreen(true);
  };

  const handleTreeCreateDecision = useCallback(async () => {
    if (!projectId || creating || !canCreate) return;
    setCreating(true);
    try {
      const draft = await DecisionAPI.createDraft(projectId);
      if (draft.id == null) {
        throw new Error('Draft created without id');
      }
      setFullscreen(true);
      setFullscreenSelectedId(draft.id);
      setProvisionalDecisionId(draft.id);
      setStartInEditMode(true);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Failed to create decision';
      toast.error(detail);
    } finally {
      setCreating(false);
    }
  }, [canCreate, creating, projectId]);

  const lastCreateRequestKey = useRef(createRequestKey);
  useEffect(() => {
    if (createRequestKey === lastCreateRequestKey.current) return;
    lastCreateRequestKey.current = createRequestKey;
    void handleTreeCreateDecision();
  }, [createRequestKey, handleTreeCreateDecision]);

  const jumpToDate = (dayKey: string) => {
    setSelectedTopic(null);
    setFocusNodeId(null);
    setFocusDateKey(dayKey);
  };

  const jumpToNode = (node: DecisionGraphNode) => {
    setSelectedTopic(null);
    setFocusDateKey(null);
    setFocusNodeId(node.id);
    if (fullscreen) {
      handleSelectNode(node.id);
    }
  };

  const jumpToTopic = (topic: string) => {
    setSelectedTopic(topic);
    setFocusDateKey(null);
    setFocusNodeId(null);
    setTimelineMode('auto');
    requestAnimationFrame(() => {
      embeddedTreeRef.current?.jumpToTopic(topic);
      fullscreenTreeRef.current?.jumpToTopic(topic);
    });
  };

  const handleTimelineModeChange = (mode: 'auto' | TimelineGranularity) => {
    setSelectedTopic(mode === 'auto' ? selectedTopic : null);
    setFocusDateKey(null);
    setFocusNodeId(null);
    setTimelineMode(mode);
    setViewResetKey((key) => key + 1);
  };

  useEffect(() => {
    if (viewResetKey === 0) return;
    requestAnimationFrame(() => {
      embeddedTreeRef.current?.resetView();
      fullscreenTreeRef.current?.resetView();
    });
  }, [timelineMode, viewResetKey]);

  const handleMoveDecisionToTopic = async (
    decisionId: number,
    fromProjectId: number,
    topic: string,
  ) => {
    try {
      await DecisionAPI.moveDecisionToTopic(decisionId, fromProjectId, topic);
      toast.success('Decision moved');
      await onDecisionUpdated?.({ fullReload: true });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string; topic?: string } } })?.response?.data?.detail ||
        (err as { response?: { data?: { topic?: string } } })?.response?.data?.topic ||
        (err as Error)?.message ||
        'Failed to move decision';
      toast.error(detail);
    }
  };

  const handleRenameTopic = async (topic: string, title: string) => {
    if (!projectId) return;
    try {
      await DecisionAPI.renameDecisionTopic(projectId, topic, title);
      toast.success('Topic renamed');
      await onDecisionUpdated?.({ fullReload: true });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string; title?: string } } })?.response?.data?.detail ||
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ||
        (err as Error)?.message ||
        'Failed to rename topic';
      toast.error(detail);
    }
  };

  const handleCreateTopic = async (title: string) => {
    if (!projectId) return;
    try {
      await DecisionAPI.createDecisionTopic(projectId, title);
      toast.success('Topic added');
      await onDecisionUpdated?.({ fullReload: true });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string; title?: string } } })?.response?.data?.detail ||
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ||
        (err as Error)?.message ||
        'Failed to add topic';
      toast.error(detail);
    }
  };

  const handleDeleteTopic = async (topic: string) => {
    if (!projectId) return;
    try {
      await DecisionAPI.deleteDecisionTopic(projectId, topic);
      toast.success('Topic deleted');
      await onDecisionUpdated?.({ fullReload: true });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Failed to delete topic';
      toast.error(detail);
    }
  };

  const treeCommon = {
    nodes,
    edges: links.edges,
    topics: graph?.topics ?? [],
    projectId,
    mode: 'viewer' as const,
    focusDateKey,
    focusNodeId,
    timelineGranularity: timelineMode === 'auto' ? null : timelineMode,
    onEditDecision,
    onCreateDecision: canCreate ? handleTreeCreateDecision : undefined,
    canDelete: canEdit,
    onDelete: onDeleteDecision,
    linkingEnabled: links.linkingEnabled,
    linkingDisabled: links.linkingDisabled,
    onCreateLink: links.handleCreateLink,
    onRemoveLink: links.handleRemoveLink,
    onMoveDecisionToTopic: canEdit ? handleMoveDecisionToTopic : undefined,
    onRenameTopic: canEdit ? handleRenameTopic : undefined,
    onCreateTopic: canEdit ? handleCreateTopic : undefined,
    onDeleteTopic: canEdit ? handleDeleteTopic : undefined,
    getDecisionUrl: (id: number, pid?: number | null) =>
      `/decisions/${id}${pid ? `?project_id=${pid}` : ''}`,
    getReviewUrl: (id: number, pid?: number | null) =>
      `/decisions/${id}${pid ? `?project_id=${pid}` : ''}`,
  };

  const embeddedViewport = {
    zoomPercent: embeddedZoomPercent,
    onZoomIn: () => embeddedTreeRef.current?.zoomIn(),
    onZoomOut: () => embeddedTreeRef.current?.zoomOut(),
    onJumpToToday: () => embeddedTreeRef.current?.jumpToToday(),
    showToday: true,
  };

  const fullscreenViewport = {
    zoomPercent: fullscreenZoomPercent,
    onZoomIn: () => fullscreenTreeRef.current?.zoomIn(),
    onZoomOut: () => fullscreenTreeRef.current?.zoomOut(),
    onJumpToToday: () => fullscreenTreeRef.current?.jumpToToday(),
    showToday: true,
  };

  const embeddedTree = (
    <DecisionTree
      ref={embeddedTreeRef}
      {...treeCommon}
      autoFocusToday={!focusDateKey && focusNodeId == null}
      onZoomPercentChange={setEmbeddedZoomPercent}
      onSelectNode={handleSelectNode}
    />
  );

  const fullscreenTree = (
    <DecisionTree
      ref={fullscreenTreeRef}
      {...treeCommon}
      autoFocusToday={!focusDateKey && focusNodeId == null && fullscreenSelectedId == null}
      onZoomPercentChange={setFullscreenZoomPercent}
      selectedNodeId={fullscreenSelectedId}
      onSelectNode={handleSelectNode}
    />
  );

  const discardProvisionalDecision = async (opts?: { closeFullscreen?: boolean }) => {
    if (provisionalDecisionId == null) return;
    const id = provisionalDecisionId;
    setProvisionalDecisionId(null);
    try {
      await DecisionAPI.deleteDecision(id, projectId ?? null);
      await onDecisionUpdated?.({ fullReload: true });
    } catch {
      toast.error('Failed to discard unsaved decision');
    } finally {
      setFullscreenSelectedId(null);
      setStartInEditMode(false);
      if (opts?.closeFullscreen) {
        setSelectedTopic(null);
        setFullscreen(false);
      }
    }
  };

  const closeFullscreen = () => {
    if (provisionalDecisionId != null) {
      void discardProvisionalDecision({ closeFullscreen: true });
      return;
    }
    setSelectedTopic(null);
    setFullscreen(false);
    setFullscreenSelectedId(null);
    setStartInEditMode(false);
  };

  if (nodeCount === 0 && topicCount === 0) {
    return null;
  }

  const heightClass = nodeCount <= 2 && topicCount <= 2 ? 'h-[360px]' : 'h-[600px]';

  return (
    <>
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="min-w-0 text-[13px] font-semibold uppercase text-slate-900" style={{ letterSpacing: 0 }}>
            Decision Tree
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={openFullscreenMap}
              aria-label="Open decision tree fullscreen"
              title="Fullscreen"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand decision tree' : 'Collapse decision tree'}
              title={collapsed ? 'Expand' : 'Collapse'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
              />
            </button>
          </div>
        </div>
        {!collapsed && (
          <>
            <div className={`relative w-full ${heightClass}`}>{embeddedTree}</div>
          </>
        )}
      </div>

      <DecisionFullscreenPanel
        open={fullscreen}
        onClose={closeFullscreen}
        onBack={closeFullscreen}
        title="Decision Tree"
        splitLayout
      >
        {creating && fullscreenSelectedId == null ? (
          <aside className="flex h-full w-[400px] shrink-0 flex-col items-center justify-center gap-2 border-r border-gray-200 bg-gray-50 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Creating decision…
          </aside>
        ) : null}
        {fullscreenSelectedId != null ? (
          <DecisionTreeDetailPanel
            key={fullscreenSelectedId}
            decisionId={fullscreenSelectedId}
            projectId={selectedGraphNode?.projectId ?? projectId ?? null}
            graphNodeStatus={selectedGraphNode?.status ?? 'DRAFT'}
            canEdit={canEdit}
            startInEditMode={startInEditMode}
            onStartInEditModeConsumed={() => setStartInEditMode(false)}
            isProvisional={fullscreenSelectedId === provisionalDecisionId}
            onProvisionalSaved={() => setProvisionalDecisionId(null)}
            onDiscardProvisional={discardProvisionalDecision}
            onClose={() => {
              if (fullscreenSelectedId === provisionalDecisionId) {
                void discardProvisionalDecision();
                return;
              }
              setSelectedTopic(null);
              setFullscreenSelectedId(null);
              setStartInEditMode(false);
            }}
            onOpenFullPage={onOpenFullPage}
            onUpdated={onDecisionUpdated}
          />
        ) : null}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <div className="shrink-0 border-b border-gray-100 bg-gray-50/80 px-3 py-2">
            <DecisionTreeNavigator
              nodes={nodes}
              topics={graph?.topics ?? []}
              onJumpToDate={jumpToDate}
              onJumpToNode={jumpToNode}
              onJumpToTopic={jumpToTopic}
              selectedTopic={selectedTopic}
              viewport={fullscreenViewport}
              timelineMode={timelineMode}
              onTimelineModeChange={handleTimelineModeChange}
            />
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">{fullscreenTree}</div>
          </div>
        </div>
      </DecisionFullscreenPanel>
    </>
  );
}
