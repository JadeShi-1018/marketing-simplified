import { computeDecisionGraphStats } from '@/components/decisions/decisionGraphStats';
import type { DecisionGraphEdge, DecisionGraphNode } from '@/types/decision';

const node = (id: number): DecisionGraphNode => ({
  id,
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  projectSeq: id,
});

describe('computeDecisionGraphStats', () => {
  it('counts roots, orphans, and edge types', () => {
    const nodes = [node(1), node(2), node(3), node(4)];
    const edges: DecisionGraphEdge[] = [
      { from: 1, to: 2, edgeType: 'FOLLOW_UP' },
      { from: 2, to: 3, edgeType: 'RELATED' },
    ];

    expect(computeDecisionGraphStats(nodes, edges)).toEqual({
      nodeCount: 4,
      edgeCount: 2,
      rootCount: 1,
      orphanCount: 1,
      followUpCount: 1,
      relatedCount: 1,
    });
  });
});
