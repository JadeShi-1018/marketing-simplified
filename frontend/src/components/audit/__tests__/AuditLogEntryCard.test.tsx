import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuditLogEntryCard from '../AuditLogEntryCard';
import type { AuditLogEntry } from '@/types/audit';

// Mock the describeAuditEvent function
jest.mock('@/utils/describeAuditEvent', () => ({
  describeAuditEvent: (entry: AuditLogEntry) => {
    switch (entry.event_type) {
      case 'meeting.status_changed':
        return 'John Doe changed the meeting status from scheduled to in_progress';
      case 'meeting.title_changed':
        return "Sarah updated the meeting title to 'Q4 Planning'";
      case 'meeting.participant_added':
        return 'Mike added Alice Chen as a participant';
      case 'meeting.participant_removed':
        return 'Emily removed Bob Smith from participants';
      case 'meeting.template_applied':
        return "System applied the 'Planning Meeting' template";
      default:
        return 'Updated the meeting';
    }
  },
}));

describe('AuditLogEntryCard', () => {
  const mockActor = {
    id: 1,
    display_name: 'John Doe',
    email: 'john@example.com',
  };

  const mockSystemActor = null;

  it('renders audit entry with all required fields', () => {
    const entry: AuditLogEntry = {
      id: '1',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: { status: 'scheduled' },
      after: { status: 'in_progress' },
      context: null,
    };

    render(<AuditLogEntryCard entry={entry} />);

    // Check timestamp is rendered
    expect(screen.getByText(/May 24/i)).toBeInTheDocument();

    // Check actor is rendered
    expect(screen.getByText('John Doe')).toBeInTheDocument();

    // Check description is rendered
    expect(screen.getByText(/changed the meeting status/i)).toBeInTheDocument();
  });

  it('renders "System" when actor is null', () => {
    const entry: AuditLogEntry = {
      id: '2',
      event_type: 'meeting.template_applied',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockSystemActor,
      before: null,
      after: null,
      context: { template_name: 'Planning Meeting' },
    };

    render(<AuditLogEntryCard entry={entry} />);

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText(/applied the 'Planning Meeting' template/i)).toBeInTheDocument();
  });

  it('shows Details button only when there is data to display', () => {
    const entryWithDetails: AuditLogEntry = {
      id: '3',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: { status: 'draft' },
      after: { status: 'scheduled' },
      context: null,
    };

    const { rerender } = render(<AuditLogEntryCard entry={entryWithDetails} />);
    expect(screen.getByText('Details')).toBeInTheDocument();

    // Entry with no details
    const entryNoDetails: AuditLogEntry = {
      id: '4',
      event_type: 'meeting.title_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: null,
      after: null,
      context: null,
    };

    rerender(<AuditLogEntryCard entry={entryNoDetails} />);
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  it('toggles details section on button click', () => {
    const entry: AuditLogEntry = {
      id: '5',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: { status: 'scheduled' },
      after: { status: 'in_progress' },
      context: null,
    };

    render(<AuditLogEntryCard entry={entry} />);

    const detailsButton = screen.getByText('Details');

    // Details should be hidden initially
    expect(screen.queryByText(/Before:/)).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(detailsButton);
    expect(screen.getByText('Before:')).toBeInTheDocument();
    expect(screen.getByText('After:')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(detailsButton);
    expect(screen.queryByText(/Before:/)).not.toBeInTheDocument();
  });

  it('displays before data when present', () => {
    const entry: AuditLogEntry = {
      id: '6',
      event_type: 'meeting.title_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: { title: 'Old Title' },
      after: { title: 'New Title' },
      context: null,
    };

    render(<AuditLogEntryCard entry={entry} />);

    // Expand details
    fireEvent.click(screen.getByText('Details'));

    expect(screen.getByText('Before:')).toBeInTheDocument();
    expect(screen.getByText('After:')).toBeInTheDocument();
    expect(screen.getByText(/Old Title/)).toBeInTheDocument();
    expect(screen.getByText(/New Title/)).toBeInTheDocument();
  });

  it('displays context data when present', () => {
    const entry: AuditLogEntry = {
      id: '7',
      event_type: 'meeting.template_applied',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: null,
      after: null,
      context: { template_name: 'Planning', template_id: 123 },
    };

    render(<AuditLogEntryCard entry={entry} />);

    // Expand details
    fireEvent.click(screen.getByText('Details'));

    expect(screen.getByText('Context:')).toBeInTheDocument();
    expect(screen.getByText(/Planning/)).toBeInTheDocument();
  });

  it('handles different event types with appropriate icons', () => {
    const eventTypes: Array<{ type: any; expectedIcon: string }> = [
      { type: 'meeting.status_changed', expectedIcon: '📅' },
      { type: 'meeting.title_changed', expectedIcon: '✏️' },
      { type: 'meeting.participant_added', expectedIcon: '👤' },
      { type: 'meeting.agenda_item_added', expectedIcon: '📋' },
      { type: 'meeting.document_edited', expectedIcon: '📄' },
      { type: 'meeting.action_item_added', expectedIcon: '✅' },
      { type: 'meeting.decision_created', expectedIcon: '⚖️' },
      { type: 'meeting.task_created', expectedIcon: '🎯' },
      { type: 'meeting.template_applied', expectedIcon: '🎨' },
      { type: 'meeting.tags_changed', expectedIcon: '🏷️' },
    ];

    eventTypes.forEach(({ type, expectedIcon }) => {
      const { unmount } = render(
        <AuditLogEntryCard
          entry={{
            id: type,
            event_type: type as any,
            timestamp: '2026-05-24T10:30:00Z',
            actor: mockActor,
            before: null,
            after: null,
            context: null,
          }}
        />
      );

      expect(screen.getByText(expectedIcon)).toBeInTheDocument();
      unmount();
    });
  });

  it('renders with custom className', () => {
    const entry: AuditLogEntry = {
      id: '8',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: null,
      after: null,
      context: null,
    };

    const { container } = render(
      <AuditLogEntryCard entry={entry} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('formats timestamp correctly', () => {
    const entry: AuditLogEntry = {
      id: '9',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T14:30:00Z',
      actor: mockActor,
      before: null,
      after: null,
      context: null,
    };

    render(<AuditLogEntryCard entry={entry} />);

    // Should render in format like "May 24, 2:30 PM" (or similar)
    expect(screen.getByText(/May 24/i)).toBeInTheDocument();
  });

  it('handles complex JSON structures in details', () => {
    const entry: AuditLogEntry = {
      id: '10',
      event_type: 'meeting.status_changed',
      timestamp: '2026-05-24T10:30:00Z',
      actor: mockActor,
      before: {
        status: 'scheduled',
        metadata: { nested: { deep: 'value' } },
      },
      after: {
        status: 'in_progress',
        participants: ['alice', 'bob', 'charlie'],
      },
      context: null,
    };

    render(<AuditLogEntryCard entry={entry} />);

    fireEvent.click(screen.getByText('Details'));

    expect(screen.getByText(/nested/)).toBeInTheDocument();
    expect(screen.getByText(/participants/)).toBeInTheDocument();
  });
});
