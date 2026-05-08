import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import BoardView from '@/components/tasks/BoardView';
import type { TaskData } from '@/types/task';

const makeTask = (id: number, type: string, summary: string): TaskData =>
  ({
    id,
    type,
    summary,
    status: 'DRAFT',
    priority: 'MEDIUM',
    owner: { id: 1, username: 'alice', email: 'alice@test.com' },
  }) as TaskData;

describe('BoardView', () => {
  it('sorts columns by descending task count and keeps original type order for ties', () => {
    const tasks = [
      ...Array.from({ length: 7 }, (_, index) =>
        makeTask(index + 1, 'asset', `Asset task ${index + 1}`)
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makeTask(100 + index, 'budget', `Budget task ${index + 1}`)
      ),
      makeTask(200, 'report', 'Report task 1'),
    ];

    render(<BoardView tasks={tasks} loading={false} error={null} />);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings.slice(0, 3)).toEqual(['Asset', 'Budget', 'Report']);
    expect(headings.slice(3, 6)).toEqual(['Retrospective', 'Execution', 'Scaling']);
  });

  it('paginates each populated column independently', () => {
    const tasks = [
      ...Array.from({ length: 11 }, (_, index) =>
        makeTask(index + 1, 'asset', `Asset task ${index + 1}`)
      ),
      makeTask(100, 'budget', 'Budget task 1'),
    ];

    render(<BoardView tasks={tasks} loading={false} error={null} />);

    expect(screen.getByText('Asset task 1')).toBeInTheDocument();
    expect(screen.getByText('Asset task 10')).toBeInTheDocument();
    expect(screen.queryByText('Asset task 11')).not.toBeInTheDocument();
    expect(screen.getByText('Budget task 1')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.queryByText('Asset task 1')).not.toBeInTheDocument();
    expect(screen.getByText('Asset task 11')).toBeInTheDocument();
    expect(screen.getByText('Budget task 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });
});
