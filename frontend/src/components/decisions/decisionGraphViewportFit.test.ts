import { viewportToFitBounds } from '@/components/decisions/decisionGraphViewportFit';

describe('decisionGraphViewportFit', () => {
  it('zooms out enough to fit wide graphs in small containers', () => {
    const viewport = viewportToFitBounds(
      { minX: 0, minY: 0, maxX: 2800, maxY: 800, width: 2800, height: 800 },
      600,
      400,
      { padding: 0.12, minZoom: 0.12, maxZoom: 1 },
    );

    expect(viewport.zoom).toBeLessThan(0.3);
    expect(viewport.zoom).toBeGreaterThanOrEqual(0.12);
  });
});
