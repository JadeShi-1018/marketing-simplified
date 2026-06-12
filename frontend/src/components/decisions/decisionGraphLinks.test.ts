import { buildSequentialChainEdges } from '@/components/decisions/decisionGraphLinks';
import type { DecisionGraphNode } from '@/types/decision';

const node = (id: number, seq: number): DecisionGraphNode => ({
  id,
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  projectSeq: seq,
  projectId: 1,
});

describe('buildSequentialChainEdges', () => {
  it('links consecutive project sequence numbers', () => {
    const nodes = [node(3, 3), node(1, 1), node(2, 2)];
    const edges = buildSequentialChainEdges(nodes, []);

    expect(edges).toEqual([
      { from: 1, to: 2, edgeType: 'RELATED' },
      { from: 2, to: 3, edgeType: 'RELATED' },
    ]);
  });

  it('skips pairs that are already linked', () => {
    const nodes = [node(1, 1), node(2, 2), node(3, 3)];
    const edges = buildSequentialChainEdges(nodes, [{ from: 1, to: 2, edgeType: 'RELATED' }]);

    expect(edges).toHaveLength(2);
    expect(edges[1]).toEqual({ from: 2, to: 3, edgeType: 'RELATED' });
  });
});
