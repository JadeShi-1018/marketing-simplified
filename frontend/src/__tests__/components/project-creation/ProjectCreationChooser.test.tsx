import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectCreationChooser from '@/components/project-creation/ProjectCreationChooser';

describe('ProjectCreationChooser', () => {
  it('calls handlers for quick start and classic', async () => {
    const onQuickStart = jest.fn();
    const onClassic = jest.fn();
    const user = userEvent.setup();

    render(
      <ProjectCreationChooser
        title="Create a project"
        description="Pick a path"
        onQuickStart={onQuickStart}
        onClassic={onClassic}
      />
    );

    expect(screen.getByRole('heading', { name: /create a project/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /get started/i }));
    expect(onQuickStart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /use classic wizard/i }));
    expect(onClassic).toHaveBeenCalledTimes(1);
  });
});
