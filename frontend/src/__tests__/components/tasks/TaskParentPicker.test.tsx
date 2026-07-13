import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskParentPicker, {
  mergeParentCandidates,
  rememberParent,
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
});

describe('TaskParentPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetTasks.mockResolvedValue({
      data: { results: [parentA] },
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

  it('renders parent picker for subtasks after loading candidates', async () => {
    render(<TaskParentPicker task={subtask} onUpdated={jest.fn()} />);

    expect(screen.getByTestId('task-parent-picker')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Parent task' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Parent task' })).toHaveTextContent(
      'Final Campaign Performance Summary',
    );

    await waitFor(() => {
      expect(mockedGetTasks).toHaveBeenCalledWith({
        project_id: 1,
        include_subtasks: true,
      });
    });
  });

  it('does not fetch parent by numeric id in the URL path', async () => {
    render(<TaskParentPicker task={subtask} onUpdated={jest.fn()} />);

    await waitFor(() => {
      expect(mockedGetTasks).toHaveBeenCalled();
    });

    expect(mockedGetTask).not.toHaveBeenCalledWith(9);
  });
});
