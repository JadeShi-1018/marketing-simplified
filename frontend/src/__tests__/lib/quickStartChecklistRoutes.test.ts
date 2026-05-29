import { shouldRenderQuickStartChecklist } from '@/lib/quickStartChecklistRoutes';

describe('shouldRenderQuickStartChecklist', () => {
  it('hides on quick start wizard and select project', () => {
    expect(shouldRenderQuickStartChecklist('/projects/quick-start')).toBe(false);
    expect(shouldRenderQuickStartChecklist('/select-project')).toBe(false);
  });

  it('shows on normal project routes', () => {
    expect(shouldRenderQuickStartChecklist('/overview')).toBe(true);
    expect(shouldRenderQuickStartChecklist('/tasks')).toBe(true);
    expect(shouldRenderQuickStartChecklist('/spreadsheets/12')).toBe(true);
  });
});
