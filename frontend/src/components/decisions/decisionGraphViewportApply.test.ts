import type { Node } from 'reactflow';
import {
  resolveDecisionGraphViewport,
  savedViewportShowsNodes,
} from '@/components/decisions/decisionGraphViewportApply';

const node = (id: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  data: {},
});

describe('decisionGraphViewportApply', () => {
  it('detects when a saved viewport shows most nodes', () => {
    const nodes = [node('a', 100, 100), node('b', 400, 100), node('c', 700, 100)];
    expect(savedViewportShowsNodes({ x: 0, y: 0, zoom: 0.5 }, nodes, 600, 400)).toBe(true);
    expect(savedViewportShowsNodes({ x: -5000, y: -5000, zoom: 0.5 }, nodes, 600, 400)).toBe(false);
  });

  it('restores saved viewport when remember is on, even if off-screen', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 400, 0),
      node('c', 800, 0),
    ];
    const saved = { x: -9000, y: -9000, zoom: 0.86 };
    localStorage.setItem(
      'decision-graph-viewport:v1:1',
      JSON.stringify(saved),
    );

    const viewport = resolveDecisionGraphViewport({
      nodes,
      edges: [],
      container: { getBoundingClientRect: () => ({ width: 600, height: 400 }) } as HTMLElement,
      projectId: 1,
      rememberViewport: true,
      selectedNodeId: null,
      focusNodeId: null,
      flowNodeIdForDecision: (id) => `decision-${id}`,
    });

    expect(viewport).toEqual(saved);
    localStorage.clear();
  });

  it('frames largest linked component when graph has more than 20 nodes', () => {
    const main = Array.from({ length: 21 }, (_, index) => node(`m${index}`, index * 350, 0));
    const satellite = [
      node('s0', 50_000, 0),
      node('s1', 50_350, 0),
      node('s2', 50_700, 0),
      node('s3', 51_050, 0),
      node('s4', 52_000, 0),
      node('s5', 52_350, 0),
    ];
    const nodes = [...main, ...satellite];
    const edges = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `main-${index}`,
        source: `m${index}`,
        target: `m${index + 1}`,
      })),
      { id: 'sat-0', source: 's0', target: 's1' },
      { id: 'sat-1', source: 's1', target: 's2' },
      { id: 'sat-2', source: 's2', target: 's3' },
      { id: 'sat-3', source: 's4', target: 's5' },
    ];

    const viewport = resolveDecisionGraphViewport({
      nodes,
      edges,
      container: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) } as HTMLElement,
      projectId: 1,
      rememberViewport: false,
      selectedNodeId: null,
      focusNodeId: null,
      flowNodeIdForDecision: (id) => `decision-${id}`,
    });

    expect(viewport).not.toBeNull();
    // Viewport is fit to the 21-node main component — satellite cluster stays off-screen.
    expect(savedViewportShowsNodes(viewport!, satellite, 1200, 800)).toBe(false);
    const orphanScreenX = satellite[0].position.x * viewport!.zoom + viewport!.x;
    expect(orphanScreenX).toBeGreaterThan(1200);
  });

  it('uses layoutNodesForFit so dragged positions do not skew auto-fit', () => {
    const main = Array.from({ length: 21 }, (_, index) => node(`m${index}`, index * 350, 0));
    const draggedAway = node('m20', 50_000, 50_000);
    const displayNodes = [...main.slice(0, 20), draggedAway];
    const layoutNodes = [...main];
    const edges = Array.from({ length: 20 }, (_, index) => ({
      id: `e${index}`,
      source: `m${index}`,
      target: `m${index + 1}`,
    }));

    const skewed = resolveDecisionGraphViewport({
      nodes: displayNodes,
      edges,
      container: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) } as HTMLElement,
      projectId: 1,
      rememberViewport: false,
      selectedNodeId: null,
      focusNodeId: null,
      flowNodeIdForDecision: (id) => `decision-${id}`,
    });

    const layoutBased = resolveDecisionGraphViewport({
      nodes: displayNodes,
      edges,
      layoutNodesForFit: layoutNodes,
      container: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) } as HTMLElement,
      projectId: 1,
      rememberViewport: false,
      selectedNodeId: null,
      focusNodeId: null,
      flowNodeIdForDecision: (id) => `decision-${id}`,
    });

    expect(skewed).not.toBeNull();
    expect(layoutBased).not.toBeNull();
    expect(layoutBased!.x).not.toBe(skewed!.x);
    expect(Math.abs(layoutBased!.x)).toBeLessThan(Math.abs(skewed!.x));
  });
});
