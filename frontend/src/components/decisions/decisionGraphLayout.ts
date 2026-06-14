import { Position, type Edge, type Node } from 'reactflow';
import {
  layoutLinkedComponent,
  layoutLinkedWithDagre,
  type LayoutEngineOptions,
} from '@/components/decisions/decisionGraphLayoutEngine';
import type { SavedGraphPositions } from '@/components/decisions/decisionGraphLayoutStorage';
import { findConnectedComponents } from '@/components/decisions/decisionGraphViewport';

const GRID_COLUMNS = 4;
const GRID_GAP_X = 40;
const GRID_GAP_Y = 40;
const COMPONENT_GAP = 72;

export type LayoutOptions = LayoutEngineOptions;

const componentBounds = (nodes: Node[], nodeWidth: number, nodeHeight: number) => {
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + nodeWidth;
  const maxY = Math.max(...ys) + nodeHeight;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const offsetNodes = <T>(nodes: Node<T>[], dx: number, dy: number): Node<T>[] =>
  nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + dx,
      y: node.position.y + dy,
    },
  }));

/** Snake layout for unlinked cards — reads left-to-right, then back on the next row. */
const layoutInSerpentine = <T>(
  nodes: Node<T>[],
  originX: number,
  originY: number,
  { nodeWidth, nodeHeight }: LayoutOptions,
): Node<T>[] =>
  nodes.map((node, index) => {
    const row = Math.floor(index / GRID_COLUMNS);
    const colInRow = index % GRID_COLUMNS;
    const column = row % 2 === 0 ? colInRow : GRID_COLUMNS - 1 - colInRow;
    return {
      ...node,
      position: {
        x: originX + column * (nodeWidth + GRID_GAP_X),
        y: originY + row * (nodeHeight + GRID_GAP_Y),
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

const layoutLinkedGroups = async <T>(
  nodes: Node<T>[],
  edges: Edge[],
  options: LayoutOptions,
  engine: 'elk' | 'dagre',
): Promise<Node<T>[]> => {
  if (nodes.length === 0) return nodes;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const components = findConnectedComponents(
    nodes.map((node) => node.id),
    edges,
  );

  const orphanIds: string[] = [];
  const linkedComponents: string[][] = [];
  components.forEach((component) => {
    if (component.length === 1) orphanIds.push(component[0]);
    else linkedComponents.push(component);
  });

  const positioned = new Map<string, Node<T>>();
  let cursorY = 40;

  if (orphanIds.length > 0) {
    orphanIds.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    const orphanNodes = orphanIds.map((id) => nodeById.get(id)!);
    layoutInSerpentine(orphanNodes, 40, cursorY, options).forEach((node) => positioned.set(node.id, node));
    const rows = Math.ceil(orphanNodes.length / GRID_COLUMNS);
    cursorY += rows * (options.nodeHeight + GRID_GAP_Y) + COMPONENT_GAP;
  }

  const sortedLinked = [...linkedComponents].sort((a, b) => b.length - a.length);
  for (const componentIds of sortedLinked) {
    const componentNodes = componentIds.map((id) => nodeById.get(id)!);
    const componentEdges = edges.filter(
      (edge) => componentIds.includes(edge.source) && componentIds.includes(edge.target),
    );
    const layouted = await layoutLinkedComponent(componentNodes, componentEdges, options, engine);
    const bounds = componentBounds(layouted, options.nodeWidth, options.nodeHeight);
    offsetNodes(layouted, 40 - bounds.minX, cursorY - bounds.minY).forEach((node) =>
      positioned.set(node.id, node),
    );
    cursorY += bounds.height + COMPONENT_GAP;
  }

  return nodes.map((node) => positioned.get(node.id) ?? node);
};

/** Place unpinned nodes near pinned anchors; fall back to auto layout coordinates. */
export function mergePinnedLayout<T>(
  nodes: Node<T>[],
  edges: Edge[],
  autoLayoutNodes: Node<T>[],
  pinnedPositions: SavedGraphPositions | null | undefined,
  options: LayoutOptions,
): Node<T>[] {
  if (!pinnedPositions || Object.keys(pinnedPositions).length === 0) {
    return autoLayoutNodes;
  }

  const autoById = new Map(autoLayoutNodes.map((node) => [node.id, node.position]));
  const placed = new Map<string, { x: number; y: number }>();

  nodes.forEach((node) => {
    const pinned = pinnedPositions[node.id];
    if (pinned) placed.set(node.id, pinned);
  });

  const unpinnedIds = nodes.filter((node) => !placed.has(node.id)).map((node) => node.id);
  if (unpinnedIds.length === 0) {
    return nodes.map((node) => ({
      ...node,
      position: placed.get(node.id) ?? node.position,
    }));
  }

  const { nodeWidth, nodeHeight } = options;
  const hGap = nodeWidth + GRID_GAP_X;
  const vGap = nodeHeight + GRID_GAP_Y;
  const unpinnedSet = new Set(unpinnedIds);
  const inScope = (id: string) => unpinnedSet.has(id) || placed.has(id);
  const componentEdges = edges.filter((edge) => inScope(edge.source) && inScope(edge.target));

  let progress = true;
  while (progress) {
    progress = false;
    for (const id of unpinnedIds) {
      if (placed.has(id)) continue;

      const parents = componentEdges
        .filter((edge) => edge.target === id && placed.has(edge.source))
        .map((edge) => edge.source);
      if (parents.length > 0) {
        const parentId = parents[0];
        const parentPos = placed.get(parentId)!;
        const childTargets = componentEdges
          .filter((edge) => edge.source === parentId)
          .map((edge) => edge.target)
          .filter((target) => unpinnedSet.has(target) || placed.has(target))
          .sort();
        const siblingIndex = Math.max(0, childTargets.indexOf(id));
        placed.set(id, {
          x: parentPos.x + hGap,
          y: parentPos.y + siblingIndex * vGap,
        });
        progress = true;
        continue;
      }

      const children = componentEdges
        .filter((edge) => edge.source === id && placed.has(edge.target))
        .map((edge) => edge.target);
      if (children.length > 0) {
        const childPos = placed.get(children[0])!;
        placed.set(id, { x: childPos.x - hGap, y: childPos.y });
        progress = true;
      }
    }
  }

  for (const id of unpinnedIds) {
    if (!placed.has(id)) {
      placed.set(id, autoById.get(id) ?? { x: 0, y: 0 });
    }
  }

  return nodes.map((node) => ({
    ...node,
    position: placed.get(node.id) ?? autoById.get(node.id) ?? node.position,
  }));
}

const finalizeLayout = <T>(
  nodes: Node<T>[],
  edges: Edge[],
  autoLayout: Node<T>[],
  pinnedPositions?: SavedGraphPositions | null,
  options?: LayoutOptions,
) => {
  if (!pinnedPositions || Object.keys(pinnedPositions).length === 0 || !options) {
    return autoLayout;
  }
  return mergePinnedLayout(nodes, edges, autoLayout, pinnedPositions, options);
};

/** Sync auto layout (Dagre) — tests and immediate paint before ELK completes. */
export function layoutDecisionGraphNodes<T>(
  nodes: Node<T>[],
  edges: Edge[],
  options: LayoutOptions,
  pinnedPositions?: SavedGraphPositions | null,
): Node<T>[] {
  const autoLayout = layoutLinkedWithDagreOnlyGraph(nodes, edges, options);
  return finalizeLayout(nodes, edges, autoLayout, pinnedPositions, options);
}

/** Product layout: orphans serpentine, linked ELK (Dagre fallback), optional pinned merge. */
export async function layoutDecisionGraphNodesAsync<T>(
  nodes: Node<T>[],
  edges: Edge[],
  options: LayoutOptions,
  pinnedPositions?: SavedGraphPositions | null,
): Promise<Node<T>[]> {
  const autoLayout = await layoutLinkedGroups(nodes, edges, options, 'elk');
  return finalizeLayout(nodes, edges, autoLayout, pinnedPositions, options);
}

/** Dagre-only orchestration for synchronous callers. */
function layoutLinkedWithDagreOnlyGraph<T>(
  nodes: Node<T>[],
  edges: Edge[],
  options: LayoutOptions,
): Node<T>[] {
  if (nodes.length === 0) return nodes;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const components = findConnectedComponents(
    nodes.map((node) => node.id),
    edges,
  );

  const orphanIds: string[] = [];
  const linkedComponents: string[][] = [];
  components.forEach((component) => {
    if (component.length === 1) orphanIds.push(component[0]);
    else linkedComponents.push(component);
  });

  const positioned = new Map<string, Node<T>>();
  let cursorY = 40;

  if (orphanIds.length > 0) {
    orphanIds.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    const orphanNodes = orphanIds.map((id) => nodeById.get(id)!);
    layoutInSerpentine(orphanNodes, 40, cursorY, options).forEach((node) => positioned.set(node.id, node));
    const rows = Math.ceil(orphanNodes.length / GRID_COLUMNS);
    cursorY += rows * (options.nodeHeight + GRID_GAP_Y) + COMPONENT_GAP;
  }

  linkedComponents
    .sort((a, b) => b.length - a.length)
    .forEach((componentIds) => {
      const componentNodes = componentIds.map((id) => nodeById.get(id)!);
      const componentEdges = edges.filter(
        (edge) => componentIds.includes(edge.source) && componentIds.includes(edge.target),
      );
      const layouted = layoutLinkedWithDagre(componentNodes, componentEdges, options);
      const bounds = componentBounds(layouted, options.nodeWidth, options.nodeHeight);
      offsetNodes(layouted, 40 - bounds.minX, cursorY - bounds.minY).forEach((node) =>
        positioned.set(node.id, node),
      );
      cursorY += bounds.height + COMPONENT_GAP;
    });

  return nodes.map((node) => positioned.get(node.id) ?? node);
}
