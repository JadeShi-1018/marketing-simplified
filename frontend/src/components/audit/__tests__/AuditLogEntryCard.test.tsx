import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuditLogEntryCard from '../AuditLogEntryCard';
import type { AuditLogEntry } from '@/types/audit';

jest.mock('@/utils/describeAuditEvent', () => ({
  describeAuditEvent: (entry: AuditLogEntry) => {
    switch (entry.event_type) {
      case 'meeting.status_changed':
        return 'Changed status from scheduled to in_progress';
      case 'meeting.title_changed':
        return "Updated meeting title to 'Q4 Planning'";
      case 'meeting.participant_added':
        return 'Added Alice Chen as a attendee';
      case 'meeting.template_applied':
        return "Applied the 'Planning Meeting' template";
      default:
        return 'Updated the meeting';
    }
  },
}));

const mockActor = { id: 1, display_name: 'John Doe', email: 'john@example.com' };

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: '1',
    event_type: 'meeting.status_changed',
    timestamp: '2026-05-24T10:30:00Z',
    actor: mockActor,
    before: null,
    after: null,
    context: null,
    ...overrides,
  };
}

describe('AuditLogEntryCard', () => {
  it('renders actor name in the meta line', () => {
    render(<AuditLogEntryCard entry={makeEntry()} />);
    expect(screen.getByText(/John Doe · /)).toBeInTheDocument();
  });

  it('renders "System" when actor is null', () => {
    render(<AuditLogEntryCard entry={makeEntry({ actor: null })} />);
    expect(screen.getByText(/System · /)).toBeInTheDocument();
  });

  it('renders the event description', () => {
    render(<AuditLogEntryCard entry={makeEntry()} />);
    expect(screen.getByText(/Changed status from scheduled to in_progress/i)).toBeInTheDocument();
  });

  it('description does not include the actor name', () => {
    render(<AuditLogEntryCard entry={makeEntry({ event_type: 'meeting.title_changed' })} />);
    const description = screen.getByText(/Updated meeting title/i);
    expect(description.textContent).not.toContain('John Doe');
  });

  it('renders a formatted timestamp', () => {
    render(<AuditLogEntryCard entry={makeEntry()} />);
    expect(screen.getByText(/May 24/i)).toBeInTheDocument();
  });

  it('renders category icon for lifecycle events', () => {
    const { container } = render(<AuditLogEntryCard entry={makeEntry()} />);
    expect(container.textContent).toContain('📅');
  });

  it('renders category icon for template events', () => {
    const { container } = render(
      <AuditLogEntryCard entry={makeEntry({ event_type: 'meeting.template_applied' })} />,
    );
    expect(container.textContent).toContain('🎨');
  });

  it('does not expose raw before/after JSON', () => {
    render(
      <AuditLogEntryCard
        entry={makeEntry({ before: { title: 'Old' }, after: { title: 'New' } })}
      />,
    );
    expect(screen.queryByText(/Before:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/After:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  it('shows "(N times)" badge when count > 1', () => {
    render(<AuditLogEntryCard entry={makeEntry()} count={4} />);
    expect(screen.getByText(/4 times/)).toBeInTheDocument();
  });

  it('does not show count badge when count is 1', () => {
    render(<AuditLogEntryCard entry={makeEntry()} count={1} />);
    expect(screen.queryByText(/times/)).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <AuditLogEntryCard entry={makeEntry()} className="my-custom" />,
    );
    expect(container.firstChild).toHaveClass('my-custom');
  });

  it('uses hover background instead of a border', () => {
    const { container } = render(<AuditLogEntryCard entry={makeEntry()} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('hover:bg-gray-50');
    expect(card.className).not.toContain('border');
  });
});
