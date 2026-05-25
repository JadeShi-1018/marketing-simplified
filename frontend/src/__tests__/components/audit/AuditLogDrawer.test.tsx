import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditLogDrawer from '@/components/audit/AuditLogDrawer';
import type { AuditLogResponse } from '@/types/audit';

jest.mock('@/lib/api/auditLogApi', () => ({
  fetchAuditLog: jest.fn(),
}));

import { fetchAuditLog } from '@/lib/api/auditLogApi';

const mockFetch = fetchAuditLog as jest.MockedFunction<typeof fetchAuditLog>;

const emptyResponse: AuditLogResponse = { count: 0, next: null, previous: null, results: [] };

const onePageResponse: AuditLogResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 'e1',
      event_type: 'meeting.title_changed',
      timestamp: '2026-05-24T10:00:00Z',
      actor: { id: 1, display_name: 'Alice', email: 'alice@example.com' },
      before: null,
      after: null,
      context: null,
    },
  ],
};

const pagedResponse: AuditLogResponse = {
  count: 2,
  next: 'http://api/next',
  previous: null,
  results: [
    {
      id: 'e2',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T09:00:00Z',
      actor: { id: 2, display_name: 'Bob', email: 'bob@example.com' },
      before: null,
      after: null,
      context: null,
    },
  ],
};

describe('AuditLogDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(emptyResponse);
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <AuditLogDrawer isOpen={false} onClose={() => {}} projectId={1} meetingId={2} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the drawer panel when isOpen is true', async () => {
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it('calls onClose when the X button is clicked', async () => {
    const onClose = jest.fn();
    render(<AuditLogDrawer isOpen onClose={onClose} projectId={1} meetingId={2} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('Close audit log'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay is clicked', async () => {
    const onClose = jest.fn();
    render(<AuditLogDrawer isOpen onClose={onClose} projectId={1} meetingId={2} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const overlay = document.querySelector('.absolute.inset-0.bg-black\\/40') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = jest.fn();
    render(<AuditLogDrawer isOpen onClose={onClose} projectId={1} meetingId={2} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fetches audit log on open with projectId and meetingId', async () => {
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={5} meetingId={10} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(5, 10, {}, 1);
    });
  });

  it('shows empty state when no entries are returned', async () => {
    mockFetch.mockResolvedValue(emptyResponse);
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => {
      expect(screen.getByText(/No audit log entries found/i)).toBeInTheDocument();
    });
  });

  it('renders entries returned by the API', async () => {
    mockFetch.mockResolvedValue(onePageResponse);
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => {
      expect(screen.getByText(/Alice · /)).toBeInTheDocument();
    });
  });

  it('shows Load More button when API response has next page', async () => {
    mockFetch.mockResolvedValue(pagedResponse);
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
    });
  });

  it('fetches next page when Load More is clicked', async () => {
    const page2: AuditLogResponse = { count: 2, next: null, previous: 'x', results: [] };
    mockFetch
      .mockResolvedValueOnce(pagedResponse)
      .mockResolvedValueOnce(page2);

    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => screen.getByRole('button', { name: /Load More/i }));
    fireEvent.click(screen.getByRole('button', { name: /Load More/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(1, 2, {}, 2);
    });
  });

  it('re-fetches from page 1 when filters change', async () => {
    mockFetch.mockResolvedValue(emptyResponse);
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Open the filter dropdown first
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));

    // Wait for the dropdown to appear, then change actor input
    const actorInput = await screen.findByPlaceholderText(/e\.g\. 42/i);
    fireEvent.change(actorInput, { target: { value: '3' } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockFetch).toHaveBeenLastCalledWith(1, 2, expect.objectContaining({ actor_id: 3 }), 1);
  });

  it('shows an error message when the API call fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('shows a Retry button on error', async () => {
    mockFetch.mockRejectedValue(new Error('Timeout'));
    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch when Retry is clicked', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce(emptyResponse);

    render(<AuditLogDrawer isOpen onClose={() => {}} projectId={1} meetingId={2} />);
    await waitFor(() => screen.getByRole('button', { name: /Retry/i }));
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
