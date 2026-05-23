import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditLogTimeline from '@/components/audit/AuditLogTimeline';
import type { AuditLogEntry } from '@/types/audit';

const makeEntry = (id: string, timestamp: string, eventType: AuditLogEntry['event_type'] = 'meeting.title_changed'): AuditLogEntry => ({
  id,
  event_type: eventType,
  timestamp,
  actor: { id: 1, display_name: 'Alice', email: 'alice@example.com' },
  before: null,
  after: null,
  context: null,
});

describe('AuditLogTimeline', () => {
  it('shows empty state when entries is empty', () => {
    render(<AuditLogTimeline entries={[]} />);
    expect(screen.getByText(/No audit log entries found/i)).toBeInTheDocument();
  });

  it('shows skeleton rows while loading', () => {
    const { container } = render(<AuditLogTimeline entries={[]} isLoading />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders entries correctly', () => {
    const entries = [
      makeEntry('1', '2026-05-24T10:00:00Z'),
      makeEntry('2', '2026-05-24T11:00:00Z'),
    ];
    render(<AuditLogTimeline entries={entries} />);
    // Both actors should appear (Alice × 2)
    expect(screen.getAllByText('Alice').length).toBe(2);
  });

  it('groups entries under a date divider', () => {
    const entries = [
      makeEntry('1', '2026-05-24T10:00:00Z'),
      makeEntry('2', '2026-05-24T12:00:00Z'),
    ];
    render(<AuditLogTimeline entries={entries} />);
    expect(screen.getByText('May 24, 2026')).toBeInTheDocument();
  });

  it('creates separate date dividers for entries on different days', () => {
    const entries = [
      makeEntry('1', '2026-05-24T10:00:00Z'),
      makeEntry('2', '2026-05-23T10:00:00Z'),
    ];
    render(<AuditLogTimeline entries={entries} />);
    expect(screen.getByText('May 24, 2026')).toBeInTheDocument();
    expect(screen.getByText('May 23, 2026')).toBeInTheDocument();
  });

  it('does not show Load More button when hasMore is false', () => {
    const entries = [makeEntry('1', '2026-05-24T10:00:00Z')];
    render(<AuditLogTimeline entries={entries} hasMore={false} />);
    expect(screen.queryByRole('button', { name: /Load More/i })).not.toBeInTheDocument();
  });

  it('shows Load More button when hasMore is true', () => {
    const entries = [makeEntry('1', '2026-05-24T10:00:00Z')];
    render(<AuditLogTimeline entries={entries} hasMore onLoadMore={() => {}} />);
    expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
  });

  it('calls onLoadMore when Load More is clicked', () => {
    const onLoadMore = jest.fn();
    const entries = [makeEntry('1', '2026-05-24T10:00:00Z')];
    render(<AuditLogTimeline entries={entries} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: /Load More/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disables Load More button while isLoadingMore', () => {
    const entries = [makeEntry('1', '2026-05-24T10:00:00Z')];
    render(<AuditLogTimeline entries={entries} hasMore onLoadMore={() => {}} isLoadingMore />);
    expect(screen.getByRole('button', { name: /Loading/i })).toBeDisabled();
  });
});
