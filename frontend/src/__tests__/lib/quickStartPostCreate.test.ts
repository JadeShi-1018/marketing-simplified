import {
  clearQuickStartPostCreateGuide,
  markQuickStartChecklistStepComplete,
  readQuickStartPostCreateGuide,
  readQuickStartChecklistProgress,
  saveQuickStartPostCreateGuide,
  shouldShowQuickStartPostCreateGuide,
} from '@/lib/quickStartPostCreate';

describe('quickStartPostCreate', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('saves and reads guide for matching project', () => {
    saveQuickStartPostCreateGuide({
      projectId: 42,
      projectName: 'Q1 Launch',
      summary: {
        tasks: 5,
        spreadsheets: 1,
        calendar_events: 2,
        decisions: 0,
        miro_boards: 0,
      },
      miroBoardId: null,
      enabledModules: {
        tasks: true,
        spreadsheet: true,
        calendar: true,
        decisions: false,
        miro: false,
      },
      spreadsheetId: 'q1-launch-sheet',
      createdAt: Date.now(),
    });

    expect(shouldShowQuickStartPostCreateGuide(42)?.projectName).toBe('Q1 Launch');
    expect(shouldShowQuickStartPostCreateGuide(99)).toBeNull();
  });

  it('clears guide on dismiss', () => {
    saveQuickStartPostCreateGuide({
      projectId: 1,
      projectName: 'Test',
      summary: {
        tasks: 1,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      miroBoardId: null,
      enabledModules: {
        tasks: true,
        spreadsheet: false,
        calendar: false,
        decisions: false,
        miro: false,
      },
      spreadsheetId: null,
      createdAt: Date.now(),
    });
    markQuickStartChecklistStepComplete(1, 'tasks');

    clearQuickStartPostCreateGuide();
    expect(readQuickStartPostCreateGuide()).toBeNull();
    expect(readQuickStartChecklistProgress(1).completedStepIds).toEqual([]);
  });

  it('tracks completed checklist steps per project', () => {
    saveQuickStartPostCreateGuide({
      projectId: 5,
      projectName: 'Launch',
      summary: {
        tasks: 2,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      miroBoardId: null,
      enabledModules: {
        tasks: true,
        spreadsheet: false,
        calendar: false,
        decisions: false,
        miro: false,
      },
      spreadsheetId: null,
      createdAt: Date.now(),
    });

    expect(readQuickStartChecklistProgress(5).completedStepIds).toEqual([]);
    markQuickStartChecklistStepComplete(5, 'tasks');
    markQuickStartChecklistStepComplete(5, 'tasks');
    expect(readQuickStartChecklistProgress(5).completedStepIds).toEqual(['tasks']);
  });
});
