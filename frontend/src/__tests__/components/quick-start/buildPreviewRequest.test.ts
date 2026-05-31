import { buildQuickStartPreviewRequest } from '@/components/quick-start/buildPreviewRequest';
import { INITIAL_QUICK_START_WIZARD_STATE } from '@/components/quick-start/constants';

describe('buildQuickStartPreviewRequest', () => {
  it('builds step 1 request with prompt and modules', () => {
    const state = {
      ...INITIAL_QUICK_START_WIZARD_STATE,
      prompt: 'US Meta Q2 campaign with $30k monthly budget for six weeks',
      chips: { channels: ['Meta'], objectives: ['Awareness'] },
    };

    const request = buildQuickStartPreviewRequest(state, 1);

    expect(request.step).toBe(1);
    expect(request.prompt).toBe(state.prompt);
    expect(request.chips).toEqual({ channels: ['meta'], objectives: ['awareness'] });
    expect(request.supplement).toBeUndefined();
  });

  it('builds step 2 request with supplement', () => {
    const state = {
      ...INITIAL_QUICK_START_WIZARD_STATE,
      prompt: 'US Meta Q2 campaign with $30k monthly budget for six weeks',
      supplement: 'Focus on prospecting',
    };

    const request = buildQuickStartPreviewRequest(state, 2);

    expect(request.step).toBe(2);
    expect(request.supplement).toBe('Focus on prospecting');
  });
});
