import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditLogEntryCard from '@/components/audit/AuditLogEntryCard';
import type { AuditLogEntry } from '@/types/audit';

const baseEntry: AuditLogEntry = {
  id: 'entry-1',
  event_type: 'meeting.title_changed',
  timestamp: '2026-05-24T10:30:00Z',
  actor: { id: 1, display_name: 'Alice', email: 'alice@example.com' },
  before: null,
  after: null,
  context: null,
};

describe('AuditLogEntryCard', () => {
  it('renders description and actor name', () => {
    render(<AuditLogEntryCard entry={baseEntry} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders "System" when actor is null', () => {
    render(<AuditLogEntryCard entry={{ ...baseEntry, actor: null }} />);
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('does not show Details button when no before/after/context', () => {
    render(<AuditLogEntryCard entry={baseEntry} />);
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  it('shows Details button when entry has before/after data', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      before: { title: 'Old Title' },
      after: { title: 'New Title' },
    };
    render(<AuditLogEntryCard entry={entry} />);
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('expands details on click and shows before/after JSON', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      before: { title: 'Old Title' },
      after: { title: 'New Title' },
    };
    render(<AuditLogEntryCard entry={entry} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Before:')).toBeInTheDocument();
    expect(screen.getByText('After:')).toBeInTheDocument();
  });

  it('collapses details on second click', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      before: { foo: 'bar' },
      after: null,
    };
    render(<AuditLogEntryCard entry={entry} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Before:')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Details'));
    expect(screen.queryByText('Before:')).not.toBeInTheDocument();
  });

  it('shows context section when context is present', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      context: { reason: 'test' },
    };
    render(<AuditLogEntryCard entry={entry} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Context:')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <AuditLogEntryCard entry={baseEntry} className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
