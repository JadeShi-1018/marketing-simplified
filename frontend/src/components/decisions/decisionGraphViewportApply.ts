import type { Node } from 'reactflow';
import {
  boundsForNodes,
  readContainerSize,
  viewportToFitBounds,
} from '@/components/decisions/decisionGraphViewportFit';
import {
  FIT_ALL_MAX_NODES,
  FIT_ALL_MIN_ZOOM,
  PARTIAL_FIT_MIN_ZOOM,
  neighborNodeIds,
  pickInitialFitNodeIds,
} from '@/components/decisions/decisionGraphViewport';
import {
  isValidSavedViewport,
  loadDecisionGraphViewport,
} from '@/components/decisions/decisionGraphViewportStorage';

const NODE_WIDTH = 320;
const NODE_HEIGHT = 128;

/** True when most nodes are visible at this viewport (guards stale saved views). */
export function savedViewportShowsNodes(
  viewport: { x: number; y: number; zoom: number },
  nodes: Node[],
  containerWidth: number,
  containerHeight: number,
  nodeWidth = NODE_WIDTH,
  nodeHeight = NODE_HEIGHT,
): boolean {
  if (nodes.length === 0) return false;
  let visible = 0;
  nodes.forEach((node) => {
    const left = node.position.x * viewport.zoom + viewport.x;
    const top = node.position.y * viewport.zoom + viewport.y;
    const right = left + nodeWidth * viewport.zoom;
    const bottom = top + nodeHeight * viewport.zoom;
    if (right > 0 && left < containerWidth && bottom > 0 && top < containerHeight) {
      visible += 1;
    }
  });
  const threshold = nodes.length <= 3 ? nodes.length : Math.ceil(nodes.length * 0.6);
  return visible >= threshold;
}

export type ViewportApplyInput = {
  nodes: Node[];
  edges: Parameters<typeof neighborNodeIds>[1];
  /** Layout-engine positions for auto-fit — ignores user-dragged coordinates. */
  layoutNodesForFit?: Node[];
  container: HTMLElement | null;
  projectId: number | null | undefined;
  rememberViewport: boolean;
  selectedNodeId: number | null | undefined;
  focusNodeId: number | null | undefined;
  flowNodeIdForDecision: (id: number) => string;
};

export function resolveDecisionGraphViewport(input: ViewportApplyInput) {
  const {
    nodes,
    edges,
    layoutNodesForFit,
    container,
    projectId,
    rememberViewport,
    selectedNodeId,
    focusNodeId,
    flowNodeIdForDecision,
  } = input;

  const nodesForBounds = layoutNodesForFit ?? nodes;

  const { width, height } = readContainerSize(container);
  if (width <= 1 || height <= 1) return null;

  if (rememberViewport && projectId && !selectedNodeId && !focusNodeId) {
    const saved = loadDecisionGraphViewport(projectId);
    if (isValidSavedViewport(saved)) {
      return saved;
    }
  }

  let targetIds: string[];
  if (selectedNodeId) {
    targetIds = neighborNodeIds(flowNodeIdForDecision(selectedNodeId), edges, 1);
  } else if (focusNodeId) {
    targetIds = neighborNodeIds(flowNodeIdForDecision(focusNodeId), edges, 1);
  } else {
    targetIds = pickInitialFitNodeIds(nodes, edges);
  }

  const bounds = boundsForNodes(nodesForBounds, targetIds, NODE_WIDTH, NODE_HEIGHT);
  if (!bounds) return null;

  const fitAll = !selectedNodeId && !focusNodeId && targetIds.length === nodes.length;
  const shouldKeepReadable = fitAll && nodesForBounds.length > FIT_ALL_MAX_NODES;
  return viewportToFitBounds(bounds, width, height, {
    padding: selectedNodeId || focusNodeId ? 0.2 : fitAll ? 0.12 : 0.14,
    minZoom: shouldKeepReadable ? PARTIAL_FIT_MIN_ZOOM : fitAll ? FIT_ALL_MIN_ZOOM : PARTIAL_FIT_MIN_ZOOM,
    maxZoom: 1,
  });
}
