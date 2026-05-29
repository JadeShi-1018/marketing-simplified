import {
  QUICK_START_FROM_CREATE_PROJECT,
  quickStartPathWithCreateProjectReturn,
  resolveQuickStartExitPath,
  selectProjectPathWithCreateChooser,
} from '@/lib/quickStartReturn';

describe('quickStartReturn', () => {
  it('builds paths for create-project flow', () => {
    expect(quickStartPathWithCreateProjectReturn()).toBe(
      `/projects/quick-start?from=${QUICK_START_FROM_CREATE_PROJECT}`
    );
    expect(selectProjectPathWithCreateChooser()).toBe('/select-project?create=chooser');
  });

  it('resolves exit path from query', () => {
    expect(resolveQuickStartExitPath(QUICK_START_FROM_CREATE_PROJECT)).toBe(
      '/select-project?create=chooser'
    );
    expect(resolveQuickStartExitPath(null)).toBe('/select-project');
  });
});
