import type { Node, Viewport } from 'reactflow';

export type GraphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

export function boundsForNodes(
  nodes: Node[],
  nodeIds: string[],
  nodeWidth: number,
  nodeHeight: number,
): GraphBounds | null {
  if (nodeIds.length === 0) return null;
  const idSet = new Set(nodeIds);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    if (!idSet.has(node.id)) return;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeWidth);
    maxY = Math.max(maxY, node.position.y + nodeHeight);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Fit node bounds into container — avoids React Flow fitView minZoom quirks. */
export function viewportToFitBounds(
  bounds: GraphBounds,
  containerWidth: number,
  containerHeight: number,
  {
    padding = 0.12,
    minZoom = 0.15,
    maxZoom = 1,
  }: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): Viewport {
  const padX = containerWidth * padding;
  const padY = containerHeight * padding;
  const innerW = Math.max(containerWidth - padX * 2, 1);
  const innerH = Math.max(containerHeight - padY * 2, 1);
  const zoom = clamp(
    minZoom,
    Math.min(innerW / Math.max(bounds.width, 1), innerH / Math.max(bounds.height, 1)),
    maxZoom,
  );
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;
  return {
    x: containerWidth / 2 - centerX * zoom,
    y: containerHeight / 2 - centerY * zoom,
    zoom,
  };
}

export function readContainerSize(element: HTMLElement | null): { width: number; height: number } {
  if (!element) return { width: 0, height: 0 };
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1),
  };
}
