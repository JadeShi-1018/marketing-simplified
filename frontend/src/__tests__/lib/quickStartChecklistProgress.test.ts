import { inferQuickStartStepFromPathname } from '@/lib/quickStartChecklistProgress';

describe('inferQuickStartStepFromPathname', () => {
  it('maps routes to checklist step ids', () => {
    expect(inferQuickStartStepFromPathname('/tasks', '')).toBe('tasks');
    expect(inferQuickStartStepFromPathname('/tasks/42', '')).toBe('tasks');
    expect(inferQuickStartStepFromPathname('/spreadsheets/12', '')).toBe('spreadsheet');
    expect(inferQuickStartStepFromPathname('/calendar', '')).toBe('calendar');
    expect(inferQuickStartStepFromPathname('/decisions', '')).toBe('decisions');
    expect(inferQuickStartStepFromPathname('/miro/abc', '')).toBe('miro');
    expect(inferQuickStartStepFromPathname('/overview', '#project-team')).toBe('team');
    expect(inferQuickStartStepFromPathname('/overview', '')).toBeNull();
  });
});
