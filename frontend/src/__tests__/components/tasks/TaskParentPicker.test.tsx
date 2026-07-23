import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TaskParentPicker, {
  mergeParentCandidates,
  rememberParent,
  taskSummaryMatchesSearch,
} from '@/components/tasks/TaskParentPicker';
import { TaskAPI } from '@/lib/api/taskApi';
import type { TaskData } from '@/types/task';

jest.mock('@/lib/api/taskApi', () => ({
  TaskAPI: {
    getTasks: jest.fn(),
    getTask: jest.fn(),
    moveSubtask: jest.fn(),
  },
  parseTaskHierarchyApiError: jest.requireActual('@/lib/api/taskApi').parseTaskHierarchyApiError,
  TASK_HIERARCHY_CYCLE_CODE: 'task_hierarchy_cycle',
}));

const mockedGetTasks = TaskAPI.getTasks as jest.Mock;
const mockedGetTask = TaskAPI.getTask as jest.Mock;

const parentA: TaskData = {
  id: 9,
  slug: 'final-campaign-performance-summary',
  project_id: 1,
  type: 'asset',
  summary: 'Final Campaign Performance Summary',
  is_subtask: false,
};

const parentC: TaskData = {
  id: 10,
  slug: 'parent-c',
  project_id: 1,
  type: 'asset',
  summary: 'Parent C',
  is_subtask: false,
};

const subtask: TaskData = {
  id: 6,
  slug: 'weekly-performance-report-optimization-plan',
  project_id: 1,
  type: 'asset',
  summary: 'Weekly Performance Report',
  is_subtask: true,
  parent_relationship: [{
    parent_task_id: 9,
    parent_task_slug: 'final-campaign-performance-summary',
    parent_task_summary: 'Final Campaign Performance Summary',
  }],
};

describe('parent candidate helpers', () => {
  it('rememberParent keeps prior parents when adding a new one', () => {
    const kept = rememberParent([parentA], parentC);
    expect(kept).toHaveLength(2);
    expect(kept.map((row) => row.id)).toEqual(expect.arrayContaining([9, 10]));
  });

  it('mergeParentCandidates dedupes by task id', () => {
    const merged = mergeParentCandidates(
      [parentA],
      [{ ...parentA, summary: 'Duplicate label' }],
      [parentC],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.id === 9)?.summary).toBe('Final Campaign Performance Summary');
  });

  it('taskSummaryMatchesSearch matches title and numeric id', () => {
    expect(taskSummaryMatchesSearch({ id: 9, summary: 'A', type: 'asset' }, 'A')).toBe(true);
    expect(taskSummaryMatchesSearch({ id: 9, summary: 'A', type: 'asset' }, '9')).toBe(true);
    expect(taskSummaryMatchesSearch({ id: 9, summary: 'A', type: 'asset' }, 'B')).toBe(false);
  });
});

describe('TaskParentPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
    mockedGetTasks.mockResolvedValue({
      data: { results: [parentC] },
    });
    mockedGetTask.mockResolvedValue({
      data: parentA,
    });
  });

  it('renders nothing when task is not a subtask', () => {
    const { container } = render(
      <TaskParentPicker
        task={{ ...subtask, is_subtask: false, parent_relationship: null }}
        onUpdated={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows current parent on mount without fetching task lists', async () => {
    render(<TaskParentPicker task={subtask} onUpdated={jest.fn()} />);

    expect(screen.getByTestId('task-parent-picker')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Parent task' })).toHaveTextContent(
      'Final Campaign Performance Summary',
    );
    expect(mockedGetTasks).not.toHaveBeenCalled();
    expect(mockedGetTask).not.toHaveBeenCalled();
  });

  it('searches parent candidates after typing at least one character', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<TaskParentPicker task={subtask} onUpdated={jest.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'Parent task' }));
    await user.type(screen.getByTestId('task-parent-picker-search'), 'P');
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockedGetTasks).toHaveBeenCalledWith({
        project_id: 1,
        has_parent: false,
        search: 'P',
        page_size: 20,
        page: 1,
      });
    });
    jest.useRealTimers();
  });
});
