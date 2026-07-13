import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskParentPicker from '@/components/tasks/TaskParentPicker';
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

const parentA: TaskData = {
  id: 9,
  slug: 'final-campaign-performance-summary',
  project_id: 1,
  type: 'asset',
  summary: 'Final Campaign Performance Summary',
  is_subtask: false,
};

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
