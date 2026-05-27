import React from 'react';
import { render, screen } from '@testing-library/react';
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
  it('renders the actor name in the meta line', () => {
    render(<AuditLogEntryCard entry={baseEntry} />);
    // Actor appears in the meta line as "Alice · ..."
    expect(screen.getByText(/Alice · /)).toBeInTheDocument();
  });

  it('renders "System" when actor is null', () => {
    render(<AuditLogEntryCard entry={{ ...baseEntry, actor: null }} />);
    expect(screen.getByText(/System · /)).toBeInTheDocument();
  });

  it('renders a human-readable description', () => {
    render(<AuditLogEntryCard entry={baseEntry} />);
    // describeAuditEvent for title_changed with no after → "Updated meeting title"
    expect(screen.getByText(/updated meeting title/i)).toBeInTheDocument();
  });

  it('renders a formatted timestamp in the meta line', () => {
    render(<AuditLogEntryCard entry={baseEntry} />);
    // Meta line contains "May 24" as part of the formatted timestamp
    expect(screen.getByText(/May 24/)).toBeInTheDocument();
  });

  it('renders a category emoji icon', () => {
    const { container } = render(<AuditLogEntryCard entry={baseEntry} />);
    // metadata category → ✏️
    expect(container.textContent).toContain('✏️');
  });

  it('does not expose raw before/after JSON', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      before: { title: 'Old Title' },
      after: { title: 'New Title' },
    };
    render(<AuditLogEntryCard entry={entry} />);
    expect(screen.queryByText(/Before:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/After:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  it('does not expose context JSON', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      context: { reason: 'test' },
    };
    render(<AuditLogEntryCard entry={entry} />);
    expect(screen.queryByText(/Context:/)).not.toBeInTheDocument();
  });

  it('uses lifecycle icon for status_changed events', () => {
    const entry: AuditLogEntry = { ...baseEntry, event_type: 'meeting.status_changed' };
    const { container } = render(<AuditLogEntryCard entry={entry} />);
    expect(container.textContent).toContain('📅');
  });

  it('applies custom className', () => {
    const { container } = render(
      <AuditLogEntryCard entry={baseEntry} className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('does not show count badge when count is 1', () => {
    render(<AuditLogEntryCard entry={baseEntry} count={1} />);
    expect(screen.queryByText(/times/)).not.toBeInTheDocument();
  });

  it('shows "(N times)" badge when count is greater than 1', () => {
    render(<AuditLogEntryCard entry={baseEntry} count={3} />);
    expect(screen.getByText(/3 times/)).toBeInTheDocument();
  });

  it('does not show count badge when count is undefined', () => {
    render(<AuditLogEntryCard entry={baseEntry} />);
    expect(screen.queryByText(/times/)).not.toBeInTheDocument();
  });

  it('does not include actor name in the description text', () => {
    const entry: AuditLogEntry = {
      ...baseEntry,
      after: { title: 'New Title' },
    };
    render(<AuditLogEntryCard entry={entry} />);
    // Description should be action-only, not include "Alice"
    const description = screen.getByText(/Updated meeting title to/i);
    expect(description.textContent).not.toContain('Alice');
  });
});
