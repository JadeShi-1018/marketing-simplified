import type { Edge, Node } from 'reactflow';
import {
  FIT_ALL_MAX_NODES,
  FIT_LARGEST_MAX_NODES,
  pickInitialFitNodeIds,
  pickLargestLinkedComponentIds,
  pickRootSubtreeNodeIds,
  neighborNodeIds,
} from '@/components/decisions/decisionGraphViewport';

const makeNode = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });

describe('decisionGraphViewport', () => {
  it('fits all nodes when graph is small', () => {
    const nodes = Array.from({ length: FIT_ALL_MAX_NODES }, (_, i) => makeNode(`n${i}`));
    expect(pickInitialFitNodeIds(nodes, []).length).toBe(FIT_ALL_MAX_NODES);
  });

  it('fits largest linked component without orphans for medium graphs', () => {
    const linked = ['a', 'b', 'c', 'd'].map(makeNode);
    const orphans = Array.from({ length: 20 }, (_, index) => makeNode(`o${index}`));
    const nodes = [...linked, ...orphans];
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'd' },
    ];
    const fitIds = pickInitialFitNodeIds(nodes, edges);
    expect(fitIds).toEqual(['a', 'b', 'c', 'd']);
    expect(fitIds).not.toContain('o1');
  });

  it('uses root subtree for large graphs', () => {
    const core = ['root', 'c1', 'c2', 'deep'].map(makeNode);
    const extras = Array.from({ length: FIT_LARGEST_MAX_NODES }, (_, index) => makeNode(`x${index}`));
    const nodes = [...core, ...extras];
    const edges: Edge[] = [
      { id: 'e1', source: 'root', target: 'c1' },
      { id: 'e2', source: 'root', target: 'c2' },
      { id: 'e3', source: 'c1', target: 'deep' },
    ];
    const fitIds = pickRootSubtreeNodeIds(nodes, edges, 2);
    expect(fitIds).toContain('root');
    expect(fitIds).toContain('c1');
    expect(fitIds).toContain('c2');
    expect(fitIds).toContain('deep');
  });

  it('includes direct neighbors for focus fit', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];
    expect(neighborNodeIds('b', edges, 1).sort()).toEqual(['a', 'b', 'c']);
  });

  it('pickLargestLinkedComponentIds falls back to all nodes when only orphans', () => {
    const nodes = ['a', 'b'].map(makeNode);
    expect(pickLargestLinkedComponentIds(nodes, [])).toEqual(['a', 'b']);
  });
});
