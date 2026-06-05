import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MeetingFSMActionBar from '@/components/meetings/detail/MeetingFSMActionBar';
import { MeetingsAPI } from '@/lib/api/meetingsApi';
import toast from 'react-hot-toast';

jest.mock('@/lib/api/meetingsApi', () => ({
  MeetingsAPI: {
    executeTransition: jest.fn(),
  },
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const mockExecuteTransition = MeetingsAPI.executeTransition as jest.Mock;
const mockToastError = toast.error as jest.Mock;
const mockToastSuccess = toast.success as jest.Mock;

const defaultProps = {
  projectId: 1,
  meetingId: 2,
  currentStatus: 'draft' as const,
  availableTransitions: ['planned'],
  preCheck: jest.fn().mockReturnValue(null),
  onTransitioned: jest.fn(),
};

describe('MeetingFSMActionBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultProps.preCheck.mockReturnValue(null);
  });

  test('renders one button per available transition with correct labels', () => {
    render(
      <MeetingFSMActionBar
        {...defaultProps}
        availableTransitions={['planned', 'in_progress', 'completed', 'archived', 'draft']}
      />
    );
    expect(screen.getByRole('button', { name: /plan meeting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start meeting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete meeting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive meeting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move to draft/i })).toBeInTheDocument();
  });

  test('renders nothing when availableTransitions is empty', () => {
    const { container } = render(
      <MeetingFSMActionBar {...defaultProps} availableTransitions={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('calls executeTransition with correct projectId, meetingId, and toState', async () => {
    mockExecuteTransition.mockResolvedValueOnce({
      status: 'planned',
      available_transitions: ['in_progress', 'draft'],
    });

    render(<MeetingFSMActionBar {...defaultProps} availableTransitions={['planned']} />);
    fireEvent.click(screen.getByRole('button', { name: /plan meeting/i }));

    await waitFor(() =>
      expect(mockExecuteTransition).toHaveBeenCalledWith(1, 2, 'planned')
    );
  });

  test('calls onTransitioned with res.status and res.available_transitions on success', async () => {
    mockExecuteTransition.mockResolvedValueOnce({
      status: 'planned',
      available_transitions: ['in_progress', 'draft'],
    });

    render(<MeetingFSMActionBar {...defaultProps} availableTransitions={['planned']} />);
    fireEvent.click(screen.getByRole('button', { name: /plan meeting/i }));

    await waitFor(() =>
      expect(defaultProps.onTransitioned).toHaveBeenCalledWith('planned', ['in_progress', 'draft'])
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Meeting moved to planned');
  });

  test('preCheck reason disables button with tooltip; executeTransition not called', () => {
    const preCheck = jest.fn().mockReturnValue('Meeting must have an objective');

    render(
      <MeetingFSMActionBar
        {...defaultProps}
        availableTransitions={['planned']}
        preCheck={preCheck}
      />
    );

    const btn = screen.getByRole('button', { name: /plan meeting/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Meeting must have an objective');
    // Disabled buttons do not fire onClick in React, so executeTransition is never called.
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });

  test('clicked button is disabled during API call; other buttons remain enabled', async () => {
    let resolveTransition!: (value: { status: string; available_transitions: string[] }) => void;
    mockExecuteTransition.mockImplementationOnce(
      () => new Promise(resolve => { resolveTransition = resolve; })
    );

    render(
      <MeetingFSMActionBar
        {...defaultProps}
        availableTransitions={['planned', 'in_progress']}
        preCheck={() => null}
      />
    );

    const planBtn = screen.getByRole('button', { name: /plan meeting/i });
    const startBtn = screen.getByRole('button', { name: /start meeting/i });

    fireEvent.click(planBtn);

    await waitFor(() => expect(planBtn).toBeDisabled());
    expect(startBtn).not.toBeDisabled();

    await act(async () => {
      resolveTransition({ status: 'planned', available_transitions: [] });
    });
  });

  test('shows normalized toast error and does not call onTransitioned when API rejects', async () => {
    mockExecuteTransition.mockRejectedValueOnce({ message: 'Network error' });

    render(<MeetingFSMActionBar {...defaultProps} availableTransitions={['planned']} />);
    fireEvent.click(screen.getByRole('button', { name: /plan meeting/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Network error'));
    expect(defaultProps.onTransitioned).not.toHaveBeenCalled();
  });

  test('normalizes transition field array from server error', async () => {
    mockExecuteTransition.mockRejectedValueOnce({
      response: { data: { transition: ['Cannot transition.', 'Invalid state.'] } },
    });

    render(<MeetingFSMActionBar {...defaultProps} availableTransitions={['planned']} />);
    fireEvent.click(screen.getByRole('button', { name: /plan meeting/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Cannot transition. · Invalid state.')
    );
  });
});
