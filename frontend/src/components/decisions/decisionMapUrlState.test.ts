import {
  buildDecisionMapSearchParams,
  decisionMapModeToUrl,
  mergeDecisionMapUrlState,
  parseDecisionMapModeFromUrl,
  readDecisionMapUrlState,
} from '@/components/decisions/decisionMapUrlState';

describe('decisionMapUrlState', () => {
  it('maps graph url mode to internal tree mode', () => {
    expect(parseDecisionMapModeFromUrl('graph')).toBe('tree');
    expect(decisionMapModeToUrl('tree')).toBe('graph');
  });

  it('round-trips map url params', () => {
    const current = new URLSearchParams('project_id=1');
    const next = buildDecisionMapSearchParams(current, {
      mode: 'tree',
      fullscreen: true,
      decisionId: 42,
    });
    expect(next.toString()).toBe('map=graph&fullscreen=1&decision=42');
    expect(readDecisionMapUrlState(next)).toEqual({
      mode: 'tree',
      fullscreen: true,
      decisionId: 42,
    });
  });

  it('clears decision id when leaving fullscreen', () => {
    const current = new URLSearchParams('project_id=1&map=graph&fullscreen=1&decision=42');
    const next = buildDecisionMapSearchParams(
      current,
      mergeDecisionMapUrlState(readDecisionMapUrlState(current), {
        fullscreen: false,
      }),
    );
    expect(next.get('decision')).toBeNull();
    expect(next.get('fullscreen')).toBeNull();
  });
});
