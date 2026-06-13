import type { Node } from 'reactflow';

export type SavedGraphPositions = Record<string, { x: number; y: number }>;

const storageKey = (projectId: number) => `decision-graph-positions:v3:${projectId}`;

export function loadDecisionGraphPositions(
  projectId: number | null | undefined,
): SavedGraphPositions | null {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGraphPositions;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDecisionGraphPositions(
  projectId: number,
  positions: SavedGraphPositions,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(positions));
  } catch {
    // Quota or private mode — ignore silently.
  }
}

export function clearDecisionGraphPositions(projectId: number | null | undefined): void {
  if (!projectId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}

export function hasSavedDecisionGraphLayout(projectId: number | null | undefined): boolean {
  const saved = loadDecisionGraphPositions(projectId);
  return saved !== null && Object.keys(saved).length > 0;
}

export function applySavedPositions<T>(
  nodes: Node<T>[],
  saved: SavedGraphPositions | null,
): Node<T>[] {
  if (!saved) return nodes;
  return nodes.map((node) => {
    const point = saved[node.id];
    if (!point) return node;
    return {
      ...node,
      position: { x: point.x, y: point.y },
    };
  });
}

export function positionsFromNodes(nodes: Node[]): SavedGraphPositions {
  const positions: SavedGraphPositions = {};
  nodes.forEach((node) => {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  });
  return positions;
}
