import {
  applySavedPositions,
  clearDecisionGraphPositions,
  loadDecisionGraphPositions,
  saveDecisionGraphPositions,
} from '@/components/decisions/decisionGraphLayoutStorage';
import type { Node } from 'reactflow';

describe('decisionGraphLayoutStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips node positions per project', () => {
    const nodes: Node[] = [
      { id: 'decision-1', position: { x: 10, y: 20 }, data: {} },
      { id: 'decision-2', position: { x: 300, y: 40 }, data: {} },
    ];

    saveDecisionGraphPositions(7, {
      'decision-1': { x: 10, y: 20 },
      'decision-2': { x: 300, y: 40 },
    });

    const saved = loadDecisionGraphPositions(7);
    const applied = applySavedPositions(nodes, saved);

    expect(applied[0].position).toEqual({ x: 10, y: 20 });
    expect(applied[1].position).toEqual({ x: 300, y: 40 });
    expect(loadDecisionGraphPositions(8)).toBeNull();
  });

  it('clears saved positions for a project', () => {
    saveDecisionGraphPositions(7, { 'decision-1': { x: 1, y: 2 } });
    clearDecisionGraphPositions(7);
    expect(loadDecisionGraphPositions(7)).toBeNull();
  });
});
