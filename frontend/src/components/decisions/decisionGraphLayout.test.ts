import type { Edge, Node } from 'reactflow';
import {
  layoutDecisionGraphNodes,
  mergePinnedLayout,
} from '@/components/decisions/decisionGraphLayout';

const NODE_OPTS = { nodeWidth: 280, nodeHeight: 108 };

const makeNode = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });

describe('layoutDecisionGraphNodes', () => {
  it('lays orphan nodes in a serpentine grid', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(makeNode);
    const layouted = layoutDecisionGraphNodes(nodes, [], NODE_OPTS);
    const byId = new Map(layouted.map((node) => [node.id, node.position]));

    expect(byId.get('a')!.y).toBe(byId.get('b')!.y);
    expect(byId.get('a')!.x).toBeLessThan(byId.get('b')!.x);
    expect(byId.get('e')!.y).toBeGreaterThan(byId.get('a')!.y);
  });

  it('lays chain components left-to-right', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(makeNode);
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'd' },
    ];
    const layouted = layoutDecisionGraphNodes(nodes, edges, NODE_OPTS);
    const byId = new Map(layouted.map((node) => [node.id, node.position]));

    expect(byId.get('a')!.x).toBeLessThan(byId.get('b')!.x);
    expect(byId.get('b')!.x).toBeLessThan(byId.get('c')!.x);
    expect(byId.get('c')!.x).toBeLessThan(byId.get('d')!.x);
    expect(byId.get('a')!.y).toBe(byId.get('d')!.y);
  });

  it('spreads branched graphs with layered layout instead of one row', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map(makeNode);
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c' },
      { id: 'e3', source: 'a', target: 'd' },
      { id: 'e4', source: 'a', target: 'e' },
      { id: 'e5', source: 'a', target: 'f' },
    ];
    const layouted = layoutDecisionGraphNodes(nodes, edges, NODE_OPTS);
    const byId = new Map(layouted.map((node) => [node.id, node.position]));

    expect(byId.get('a')!.x).toBeLessThan(byId.get('b')!.x);
    expect(new Set(layouted.map((node) => node.position.y)).size).toBeGreaterThan(1);
  });

  it('keeps pinned nodes and places new children beside pinned parents', () => {
    const nodes = ['a', 'b', 'c'].map(makeNode);
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];
    const auto = layoutDecisionGraphNodes(nodes, edges, NODE_OPTS);
    const merged = mergePinnedLayout(
      nodes,
      edges,
      auto,
      { a: { x: 100, y: 200 }, b: { x: 500, y: 200 } },
      NODE_OPTS,
    );
    const byId = new Map(merged.map((node) => [node.id, node.position]));

    expect(byId.get('a')).toEqual({ x: 100, y: 200 });
    expect(byId.get('b')).toEqual({ x: 500, y: 200 });
    expect(byId.get('c')!.x).toBeGreaterThan(byId.get('b')!.x);
    expect(byId.get('c')!.y).toBe(byId.get('b')!.y);
  });
});
