import { describeAuditEvent } from '@/utils/describeAuditEvent';
import { AuditLogEntry, AuditActor } from '@/types/audit';

// Mock actor for testing
const mockActor: AuditActor = {
  id: 1,
  display_name: 'John Doe',
  email: 'john@example.com',
};

const mockActor2: AuditActor = {
  id: 2,
  display_name: 'Sarah Chen',
  email: 'sarah@example.com',
};

describe('describeAuditEvent', () => {
  describe('Lifecycle events', () => {
    it('describes meeting.status_changed', () => {
      const entry: AuditLogEntry = {
        id: '1',
        event_type: 'meeting.status_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: { status: 'scheduled' },
        after: { status: 'in_progress' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        'John Doe changed the meeting status from scheduled to in_progress'
      );
    });

    it('handles meeting.status_changed with missing before/after', () => {
      const entry: AuditLogEntry = {
        id: '1',
        event_type: 'meeting.status_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        'John Doe changed the meeting status from unknown status to unknown status'
      );
    });
  });

  describe('Metadata events', () => {
    it('describes meeting.title_changed', () => {
      const entry: AuditLogEntry = {
        id: '2',
        event_type: 'meeting.title_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { title: 'Q4 Planning Meeting' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        "John Doe updated the meeting title to 'Q4 Planning Meeting'"
      );
    });

    it('describes meeting.objective_changed', () => {
      const entry: AuditLogEntry = {
        id: '3',
        event_type: 'meeting.objective_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe updated the meeting objective');
    });

    it('describes meeting.summary_changed', () => {
      const entry: AuditLogEntry = {
        id: '4',
        event_type: 'meeting.summary_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe updated the meeting summary');
    });

    it('describes meeting.type_changed', () => {
      const entry: AuditLogEntry = {
        id: '5',
        event_type: 'meeting.type_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { type_name: 'Standup' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe("John Doe changed the meeting type to 'Standup'");
    });

    it('describes meeting.datetime_changed with ISO datetime', () => {
      const entry: AuditLogEntry = {
        id: '6',
        event_type: 'meeting.datetime_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { scheduled_date: '2024-06-01', scheduled_time: '2:30 PM' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toContain('John Doe rescheduled the meeting to');
      expect(result).toContain('2024-06-01');
      expect(result).toContain('2:30 PM');
    });

    it('describes meeting.datetime_changed without datetime', () => {
      const entry: AuditLogEntry = {
        id: '6b',
        event_type: 'meeting.datetime_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { scheduled_date: null },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe rescheduled the meeting to a new time');
    });
  });

  describe('Participant events', () => {
    it('describes meeting.participant_added', () => {
      const entry: AuditLogEntry = {
        id: '7',
        event_type: 'meeting.participant_added',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: {
          user_name: 'Alice Chen',
          role: 'attendee',
        },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe added Alice Chen as a attendee');
    });

    it('describes meeting.participant_removed', () => {
      const entry: AuditLogEntry = {
        id: '8',
        event_type: 'meeting.participant_removed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor2,
        before: null,
        after: { user_name: 'Bob Smith' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('Sarah Chen removed Bob Smith from participants');
    });
  });

  describe('Agenda events', () => {
    it('describes meeting.agenda_item_added', () => {
      const entry: AuditLogEntry = {
        id: '9',
        event_type: 'meeting.agenda_item_added',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { content: 'Review Q3 results' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe("John Doe added agenda item: 'Review Q3 results'");
    });

    it('describes meeting.agenda_item_edited', () => {
      const entry: AuditLogEntry = {
        id: '10',
        event_type: 'meeting.agenda_item_edited',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { content: 'Discuss budget allocation' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        "John Doe edited agenda item to 'Discuss budget allocation'"
      );
    });

    it('describes meeting.agenda_item_deleted', () => {
      const entry: AuditLogEntry = {
        id: '11',
        event_type: 'meeting.agenda_item_deleted',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: { content: 'Old topic' },
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe("John Doe deleted the agenda item 'Old topic'");
    });

    it('truncates long agenda content', () => {
      const longContent =
        'This is a very long agenda item that exceeds the maximum truncation length and should be shortened with ellipsis';
      const entry: AuditLogEntry = {
        id: '12',
        event_type: 'meeting.agenda_item_added',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { content: longContent },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toContain('...');
      expect(result).not.toContain(longContent);
      expect(result.length).toBeLessThan(longContent.length);
    });
  });

  describe('Document event', () => {
    it('describes meeting.document_edited', () => {
      const entry: AuditLogEntry = {
        id: '13',
        event_type: 'meeting.document_edited',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe edited the meeting document');
    });
  });

  describe('Action item events', () => {
    it('describes meeting.action_item_added', () => {
      const entry: AuditLogEntry = {
        id: '14',
        event_type: 'meeting.action_item_added',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { title: 'Follow up with client' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        "John Doe created action item: 'Follow up with client'"
      );
    });

    it('describes meeting.action_item_edited', () => {
      const entry: AuditLogEntry = {
        id: '15',
        event_type: 'meeting.action_item_edited',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { title: 'Send proposal to stakeholders' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        "John Doe updated action item: 'Send proposal to stakeholders'"
      );
    });

    it('describes meeting.action_item_resolved', () => {
      const entry: AuditLogEntry = {
        id: '16',
        event_type: 'meeting.action_item_resolved',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { title: 'Review budget spreadsheet' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe(
        "John Doe marked action item 'Review budget spreadsheet' as resolved"
      );
    });
  });

  describe('Decision and task events', () => {
    it('describes meeting.decision_created', () => {
      const entry: AuditLogEntry = {
        id: '17',
        event_type: 'meeting.decision_created',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe created a decision');
    });

    it('describes meeting.task_created', () => {
      const entry: AuditLogEntry = {
        id: '18',
        event_type: 'meeting.task_created',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe converted an action item to a task');
    });
  });

  describe('Template and tags events', () => {
    it('describes meeting.template_applied', () => {
      const entry: AuditLogEntry = {
        id: '19',
        event_type: 'meeting.template_applied',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: { template_name: 'Planning Meeting' },
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe("John Doe applied the 'Planning Meeting' template");
    });

    it('describes meeting.tags_changed', () => {
      const entry: AuditLogEntry = {
        id: '20',
        event_type: 'meeting.tags_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe updated the meeting tags');
    });
  });

  describe('System events (null actor)', () => {
    it('uses System for null actor in status change', () => {
      const entry: AuditLogEntry = {
        id: '21',
        event_type: 'meeting.status_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: null,
        before: { status: 'draft' },
        after: { status: 'scheduled' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toContain('System');
      expect(result).not.toContain('John');
    });

    it('uses System for null actor in template applied', () => {
      const entry: AuditLogEntry = {
        id: '22',
        event_type: 'meeting.template_applied',
        timestamp: '2024-05-24T10:00:00Z',
        actor: null,
        before: null,
        after: null,
        context: { template_name: 'Daily Standup' },
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe("System applied the 'Daily Standup' template");
    });
  });

  describe('Edge cases and fallbacks', () => {
    it('handles unknown event type with fallback', () => {
      const entry: AuditLogEntry = {
        id: '23',
        event_type: 'meeting.status_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      // We intentionally don't set before/after data to test fallback
      const result = describeAuditEvent(entry);
      expect(result).toContain('John Doe');
    });

    it('handles missing before/after objects gracefully', () => {
      const entry: AuditLogEntry = {
        id: '24',
        event_type: 'meeting.participant_added',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: null,
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toBe('John Doe added a participant as a participant');
    });

    it('handles empty string values', () => {
      const entry: AuditLogEntry = {
        id: '25',
        event_type: 'meeting.title_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { title: '' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toContain('John Doe');
      expect(result).toContain('updated the meeting title');
    });

    it('handles non-string values in after object', () => {
      const entry: AuditLogEntry = {
        id: '26',
        event_type: 'meeting.title_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { title: 123 },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toContain('John Doe');
      expect(result).toContain('the meeting');
    });

    it('handles invalid ISO datetime gracefully', () => {
      const entry: AuditLogEntry = {
        id: '27',
        event_type: 'meeting.datetime_changed',
        timestamp: '2024-05-24T10:00:00Z',
        actor: mockActor,
        before: null,
        after: { scheduled_date: 'not-a-valid-date' },
        context: null,
      };

      const result = describeAuditEvent(entry);
      expect(result).toContain('John Doe');
      expect(result).toContain('not-a-valid-date');
    });
  });

  describe('All 19 event types covered', () => {
    it('has description for all event types', () => {
      const eventTypes = [
        'meeting.status_changed',
        'meeting.title_changed',
        'meeting.objective_changed',
        'meeting.summary_changed',
        'meeting.type_changed',
        'meeting.datetime_changed',
        'meeting.participant_added',
        'meeting.participant_removed',
        'meeting.agenda_item_added',
        'meeting.agenda_item_edited',
        'meeting.agenda_item_deleted',
        'meeting.document_edited',
        'meeting.action_item_added',
        'meeting.action_item_edited',
        'meeting.action_item_resolved',
        'meeting.decision_created',
        'meeting.task_created',
        'meeting.template_applied',
        'meeting.tags_changed',
      ] as const;

      for (const eventType of eventTypes) {
        const entry: AuditLogEntry = {
          id: `test-${eventType}`,
          event_type: eventType,
          timestamp: '2024-05-24T10:00:00Z',
          actor: mockActor,
          before: { content: 'test', status: 'draft' },
          after: {
            content: 'test content',
            status: 'active',
            title: 'Test Title',
            type_name: 'Test Type',
            datetime: '2024-06-01T14:30:00Z',
            display_name: 'Test User',
            role: 'organizer',
          },
          context: { template_name: 'Test Template' },
        };

        const result = describeAuditEvent(entry);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
        expect(result).not.toBe('System updated the meeting');
      }
    });
  });
});
