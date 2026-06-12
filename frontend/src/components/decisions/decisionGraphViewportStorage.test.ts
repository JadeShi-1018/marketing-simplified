import {
  loadDecisionGraphViewport,
  loadRememberGraphViewport,
  saveDecisionGraphViewport,
  saveRememberGraphViewport,
} from '@/components/decisions/decisionGraphViewportStorage';

describe('decisionGraphViewportStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips viewport per project', () => {
    saveDecisionGraphViewport(3, { x: 120, y: 40, zoom: 0.8 });
    expect(loadDecisionGraphViewport(3)).toEqual({ x: 120, y: 40, zoom: 0.8 });
    expect(loadDecisionGraphViewport(4)).toBeNull();
  });

  it('persists remember-viewport preference', () => {
    expect(loadRememberGraphViewport()).toBe(false);
    saveRememberGraphViewport(true);
    expect(loadRememberGraphViewport()).toBe(true);
  });
});
