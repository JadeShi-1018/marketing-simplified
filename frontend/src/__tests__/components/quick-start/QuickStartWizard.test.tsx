import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickStartWizard from '@/components/quick-start/QuickStartWizard';
import { ProjectAPI } from '@/lib/api/projectApi';
import { QuickStartAPI } from '@/lib/api/quickStartApi';
import { saveQuickStartPostCreateGuide } from '@/lib/quickStartPostCreate';
import { QUICK_START_BLUEPRINT_VERSION } from '@/types/quickStart';

const mockPush = jest.fn();
const mockMarkCompleted = jest.fn();
const mockRefreshProjects = jest.fn().mockResolvedValue(undefined);

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/contexts/OnboardingContext', () => ({
  useOnboarding: () => ({
    markCompleted: mockMarkCompleted,
    refreshProjects: mockRefreshProjects,
  }),
}));

jest.mock('@/lib/api/projectApi', () => ({
  ProjectAPI: {
    setActiveProject: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/lib/api/quickStartApi', () => ({
  QuickStartAPI: {
    preview: jest.fn(),
    confirm: jest.fn(),
  },
  getQuickStartErrorDetail: (_error: unknown, fallback: string) => fallback,
}));

jest.mock('@/lib/quickStartUserMessages', () => ({
  QUICK_START_PREVIEW_ERROR_FALLBACK: 'could not generate a preview',
  QUICK_START_CONFIRM_ERROR_FALLBACK: 'failed to create the project',
  resolveQuickStartError: (error: any, fallback: string) => ({
    message: error.message === 'network' ? 'could not generate a preview' : error.message === 'failed' ? 'failed to create the project' : fallback,
  }),
}));

jest.mock('@/lib/quickStartPostCreate', () => ({
  saveQuickStartPostCreateGuide: jest.fn(),
}));

const mockPreview = QuickStartAPI.preview as jest.Mock;
const mockConfirm = QuickStartAPI.confirm as jest.Mock;
const mockSetActiveProject = ProjectAPI.setActiveProject as jest.Mock;
const mockSavePostCreateGuide = saveQuickStartPostCreateGuide as jest.Mock;

const samplePreviewResponse = {
  step: 2 as const,
  outline: {
    project: { title: 'Q1 Meta Launch', description: 'Test campaign' },
    modules: {
      tasks: { enabled: true, count: 5 },
      spreadsheet: { enabled: true, count: 1 },
      calendar: { enabled: true, count: 1 },
    },
    tasks: [{ summary: 'Task 1' }],
    spreadsheets: [
      {
        name: 'Budget',
        sheet_name: 'Sheet1',
        column_names: ['A', 'B'],
        row_count: 2,
      },
    ],
    calendar_events: [{ title: 'Kickoff', start_date: '2026-04-01' }],
  },
  blueprint: {
    version: QUICK_START_BLUEPRINT_VERSION,
    project: { name: 'Q1 Meta Launch', description: 'Test campaign' },
    tasks: [{ summary: 'Task 1', type: 'execution', priority: 'MEDIUM' }],
    spreadsheets: [],
    calendar_events: [],
    decisions: [],
    miro_boards: [],
  },
};

const validPrompt = 'US Meta Q2 campaign with $30k monthly budget for six weeks';

async function reachPreviewStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/campaign prompt/i), validPrompt);
  await user.click(screen.getByRole('button', { name: /continue/i }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /add optional context/i })).toBeInTheDocument();
  });

  await user.click(screen.getByRole('button', { name: /generate preview/i }));

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: /review your project draft/i })
    ).toBeInTheDocument();
  });
}

describe('QuickStartWizard', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockMarkCompleted.mockReset();
    mockRefreshProjects.mockClear();
    mockPreview.mockReset();
    mockConfirm.mockReset();
    mockSetActiveProject.mockClear();

    mockPreview.mockImplementation(async (payload: { step: number }) => {
      if (payload.step === 1) {
        return { step: 1, outline: null, blueprint: null };
      }
      return samplePreviewResponse;
    });

    mockConfirm.mockResolvedValue({
      project: { id: 42, name: 'Q1 Meta Launch', is_active: true },
      created: {
        task_ids: [1, 2],
        spreadsheet_ids: [3],
        spreadsheet_slugs: ['q1-meta-budget'],
        calendar_event_ids: ['evt-1'],
        decision_ids: [],
        miro_board_ids: [],
        miro_board_slugs: [],
      },
      summary: {
        tasks: 2,
        spreadsheets: 1,
        calendar_events: 1,
        decisions: 0,
        miro_boards: 0,
      },
    });
  });

  it('renders step 1 prompt UI', () => {
    render(<QuickStartWizard />);

    expect(screen.getByRole('heading', { name: /describe your campaign/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/campaign prompt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('calls preview step 1 then advances to supplement', async () => {
    const user = userEvent.setup();
    render(<QuickStartWizard />);

    await user.type(screen.getByLabelText(/campaign prompt/i), validPrompt);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith(
        expect.objectContaining({ step: 1, prompt: validPrompt })
      );
    });

    expect(
      screen.getByRole('heading', { name: /add optional context/i })
    ).toBeInTheDocument();
  });

  it('calls preview step 2 and shows API preview', async () => {
    const user = userEvent.setup();
    render(<QuickStartWizard />);

    await reachPreviewStep(user);

    expect(mockPreview).toHaveBeenCalledWith(
      expect.objectContaining({ step: 2, prompt: validPrompt })
    );
    expect(screen.getByDisplayValue('Q1 Meta Launch')).toBeInTheDocument();
  });

  it('confirms project and navigates to overview', async () => {
    const user = userEvent.setup();
    render(<QuickStartWizard />);

    await reachPreviewStep(user);
    await user.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          project_title: 'Q1 Meta Launch',
          blueprint: samplePreviewResponse.blueprint,
        })
      );
    });

    expect(mockSetActiveProject).toHaveBeenCalledWith(42);
    expect(mockMarkCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, name: 'Q1 Meta Launch' })
    );
    expect(mockRefreshProjects).toHaveBeenCalled();
    expect(mockSavePostCreateGuide).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 42,
        projectName: 'Q1 Meta Launch',
        spreadsheetId: 'q1-meta-budget',
      })
    );
    expect(mockPush).toHaveBeenCalledWith('/overview');
  });

  it('shows API error on preview failure', async () => {
    mockPreview.mockImplementation(async (payload: { step: number }) => {
      if (payload.step === 1) {
        return { step: 1, outline: null, blueprint: null };
      }
      throw new Error('network');
    });

    const user = userEvent.setup();
    render(<QuickStartWizard />);

    await user.type(screen.getByLabelText(/campaign prompt/i), validPrompt);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add optional context/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /generate preview/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not generate a preview/i)).toBeInTheDocument();
    });
  });

  it('shows confirm error without navigating', async () => {
    mockConfirm.mockRejectedValue(new Error('failed'));

    const user = userEvent.setup();
    render(<QuickStartWizard />);

    await reachPreviewStep(user);
    await user.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to create the project/i)).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalledWith('/overview');
  });

  it('exits to select-project', async () => {
    const user = userEvent.setup();
    render(<QuickStartWizard />);

    await user.click(screen.getByRole('button', { name: /exit quick start/i }));

    expect(mockPush).toHaveBeenCalledWith('/select-project');
  });
});
