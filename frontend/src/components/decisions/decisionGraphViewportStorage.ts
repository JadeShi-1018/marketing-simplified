export type SavedGraphViewport = { x: number; y: number; zoom: number };

export function isValidSavedViewport(
  viewport: SavedGraphViewport | null | undefined,
): viewport is SavedGraphViewport {
  if (!viewport) return false;
  return (
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom >= 0.05 &&
    viewport.zoom <= 10
  );
}

const viewportKey = (projectId: number) => `decision-graph-viewport:v1:${projectId}`;
const rememberKey = () => 'decision-graph-remember-viewport:v1';

export function loadRememberGraphViewport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(rememberKey()) === '1';
  } catch {
    return false;
  }
}

export function saveRememberGraphViewport(remember: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(rememberKey(), remember ? '1' : '0');
  } catch {
    // ignore
  }
}

export function loadDecisionGraphViewport(
  projectId: number | null | undefined,
): SavedGraphViewport | null {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(viewportKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGraphViewport;
    if (
      typeof parsed?.x !== 'number' ||
      typeof parsed?.y !== 'number' ||
      typeof parsed?.zoom !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDecisionGraphViewport(
  projectId: number,
  viewport: SavedGraphViewport,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(viewportKey(projectId), JSON.stringify(viewport));
  } catch {
    // ignore
  }
}

export function clearDecisionGraphViewport(projectId: number | null | undefined): void {
  if (!projectId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(viewportKey(projectId));
  } catch {
    // ignore
  }
}
