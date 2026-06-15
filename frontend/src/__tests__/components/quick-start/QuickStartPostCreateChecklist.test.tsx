import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickStartPostCreateChecklist from '@/components/quick-start/QuickStartPostCreateChecklist';
import { saveQuickStartPostCreateGuide, readQuickStartChecklistProgress } from '@/lib/quickStartPostCreate';
import {
  OVERVIEW_PENDING_SECTION_KEY,
  queueOverviewSectionScroll,
  scrollOverviewMainToSectionWithRetry,
} from '@/lib/overviewScroll';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/tasks',
}));

jest.mock('@/lib/overviewScroll', () => {
  const actual = jest.requireActual('@/lib/overviewScroll');
  return {
    ...actual,
    scrollOverviewMainToSectionWithRetry: jest.fn(),
    queueOverviewSectionScroll: jest.fn((sectionId: string) => {
      sessionStorage.setItem(actual.OVERVIEW_PENDING_SECTION_KEY, sectionId);
    }),
  };
});

jest.mock('@/lib/projectStore', () => ({
  useProjectStore: (selector: (state: { activeProject: { id: number } | null }) => unknown) =>
    selector({ activeProject: { id: 7 } }),
}));

describe('QuickStartPostCreateChecklist', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockClear();
  });

  it('shows floating checklist when guide matches active project', () => {
    saveQuickStartPostCreateGuide({
      projectId: 7,
      projectName: 'Summer Campaign',
      summary: {
        tasks: 5,
        spreadsheets: 1,
        calendar_events: 1,
        decisions: 0,
        miro_boards: 0,
      },
      enabledModules: {
        tasks: true,
        spreadsheet: true,
        calendar: true,
        decisions: false,
        miro: false,
      },
      spreadsheetId: 'april-budget',
      miroBoardId: null,
      createdAt: Date.now(),
    });

    render(<QuickStartPostCreateChecklist />);

    expect(screen.getByTestId('quick-start-checklist')).toBeInTheDocument();
    expect(screen.getByText(/summer campaign is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review 5 generated tasks/i })).toHaveAttribute(
      'href',
      '/tasks'
    );
  });

  it('navigates to overview for invite when not on overview', async () => {
    const user = userEvent.setup();
    saveQuickStartPostCreateGuide({
      projectId: 7,
      projectName: 'Summer Campaign',
      summary: {
        tasks: 1,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      enabledModules: {
        tasks: true,
        spreadsheet: false,
        calendar: false,
        decisions: false,
        miro: false,
      },
      spreadsheetId: null,
      miroBoardId: null,
      createdAt: Date.now(),
    });

    render(<QuickStartPostCreateChecklist />);

    await user.click(screen.getByRole('link', { name: /invite teammates/i }));

    expect(mockPush).toHaveBeenCalledWith('/overview#project-team');
    expect(queueOverviewSectionScroll).toHaveBeenCalledWith('project-team');
    expect(sessionStorage.getItem(OVERVIEW_PENDING_SECTION_KEY)).toBe('project-team');
    expect(scrollOverviewMainToSectionWithRetry).not.toHaveBeenCalled();
  });

  it('marks step done after click', async () => {
    const user = userEvent.setup();
    saveQuickStartPostCreateGuide({
      projectId: 7,
      projectName: 'Summer Campaign',
      summary: {
        tasks: 1,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      enabledModules: {
        tasks: true,
        spreadsheet: false,
        calendar: false,
        decisions: false,
        miro: false,
      },
      spreadsheetId: null,
      miroBoardId: null,
      createdAt: Date.now(),
    });

    render(<QuickStartPostCreateChecklist />);

    await user.click(screen.getByRole('link', { name: /invite teammates/i }));

    expect(readQuickStartChecklistProgress(7).completedStepIds).toContain('team');
  });

  it('auto-marks tasks when already on tasks route', () => {
    saveQuickStartPostCreateGuide({
      projectId: 7,
      projectName: 'Summer Campaign',
      summary: {
        tasks: 3,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      enabledModules: {
        tasks: true,
        spreadsheet: false,
        calendar: false,
        decisions: false,
        miro: false,
      },
      spreadsheetId: null,
      miroBoardId: null,
      createdAt: Date.now(),
    });

    render(<QuickStartPostCreateChecklist />);

    expect(readQuickStartChecklistProgress(7).completedStepIds).toContain('tasks');
  });

  it('hides after dismiss', async () => {
    const user = userEvent.setup();
    saveQuickStartPostCreateGuide({
      projectId: 7,
      projectName: 'Summer Campaign',
      summary: {
        tasks: 1,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      enabledModules: {
        tasks: true,
        spreadsheet: false,
        calendar: false,
        decisions: false,
        miro: false,
      },
      spreadsheetId: null,
      miroBoardId: null,
      createdAt: Date.now(),
    });

    render(<QuickStartPostCreateChecklist />);

    await user.click(screen.getByRole('button', { name: /dismiss quick start guide/i }));

    expect(screen.queryByTestId('quick-start-checklist')).not.toBeInTheDocument();
  });
});
