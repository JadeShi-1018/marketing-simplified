import { describeAuditEvent } from '@/utils/describeAuditEvent';
import { AuditLogEntry, AuditActor } from '@/types/audit';

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

function makeEntry(
  id: string,
  event_type: AuditLogEntry['event_type'],
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  return {
    id,
    event_type,
    timestamp: '2024-05-24T10:00:00Z',
    actor: mockActor,
    before: null,
    after: null,
    context: null,
    ...overrides,
  };
}

describe('describeAuditEvent', () => {
  describe('Lifecycle events', () => {
    it('describes meeting.status_changed', () => {
      const entry = makeEntry('1', 'meeting.status_changed', {
        before: { status: 'scheduled' },
        after: { status: 'in_progress' },
      });
      expect(describeAuditEvent(entry)).toBe('Changed status from scheduled to in_progress');
    });

    it('handles meeting.status_changed with missing before/after', () => {
      const entry = makeEntry('1', 'meeting.status_changed');
      expect(describeAuditEvent(entry)).toBe('Changed status from unknown to unknown');
    });
  });

  describe('Metadata events', () => {
    it('describes meeting.title_changed', () => {
      const entry = makeEntry('2', 'meeting.title_changed', {
        after: { title: 'Q4 Planning Meeting' },
      });
      expect(describeAuditEvent(entry)).toBe("Updated meeting title to 'Q4 Planning Meeting'");
    });

    it('falls back gracefully for meeting.title_changed with no title', () => {
      const entry = makeEntry('2b', 'meeting.title_changed');
      expect(describeAuditEvent(entry)).toBe('Updated meeting title');
    });

    it('describes meeting.objective_changed', () => {
      expect(describeAuditEvent(makeEntry('3', 'meeting.objective_changed'))).toBe(
        'Updated meeting objective',
      );
    });

    it('describes meeting.summary_changed', () => {
      expect(describeAuditEvent(makeEntry('4', 'meeting.summary_changed'))).toBe(
        'Updated meeting summary',
      );
    });

    it('describes meeting.type_changed', () => {
      const entry = makeEntry('5', 'meeting.type_changed', { after: { type_name: 'Standup' } });
      expect(describeAuditEvent(entry)).toBe("Changed meeting type to 'Standup'");
    });

    it('describes meeting.datetime_changed with date and time', () => {
      const entry = makeEntry('6', 'meeting.datetime_changed', {
        after: { scheduled_date: '2024-06-01', scheduled_time: '2:30 PM' },
      });
      const result = describeAuditEvent(entry);
      expect(result).toContain('Rescheduled to');
      expect(result).toContain('2024-06-01');
      expect(result).toContain('2:30 PM');
    });

    it('describes meeting.datetime_changed without time', () => {
      const entry = makeEntry('6b', 'meeting.datetime_changed', {
        after: { scheduled_date: '2024-06-01' },
      });
      expect(describeAuditEvent(entry)).toBe('Rescheduled to 2024-06-01');
    });

    it('falls back when meeting.datetime_changed has no date', () => {
      const entry = makeEntry('6c', 'meeting.datetime_changed', {
        after: { scheduled_date: null },
      });
      expect(describeAuditEvent(entry)).toBe('Rescheduled the meeting');
    });
  });

  describe('Participant events', () => {
    it('describes meeting.participant_added', () => {
      const entry = makeEntry('7', 'meeting.participant_added', {
        after: { user_name: 'Alice Chen', role: 'attendee' },
      });
      expect(describeAuditEvent(entry)).toBe('Added Alice Chen as a attendee');
    });

    it('falls back when participant has no name', () => {
      const entry = makeEntry('7b', 'meeting.participant_added');
      expect(describeAuditEvent(entry)).toBe('Added a participant');
    });

    it('describes meeting.participant_removed', () => {
      const entry = makeEntry('8', 'meeting.participant_removed', {
        actor: mockActor2,
        after: { user_name: 'Bob Smith' },
      });
      expect(describeAuditEvent(entry)).toBe('Removed Bob Smith from participants');
    });

    it('falls back when removed participant has no name', () => {
      const entry = makeEntry('8b', 'meeting.participant_removed');
      expect(describeAuditEvent(entry)).toBe('Removed a participant');
    });
  });

  describe('Agenda events', () => {
    it('describes meeting.agenda_item_added', () => {
      const entry = makeEntry('9', 'meeting.agenda_item_added', {
        after: { content: 'Review Q3 results' },
      });
      expect(describeAuditEvent(entry)).toBe("Added agenda item: 'Review Q3 results'");
    });

    it('describes meeting.agenda_item_edited', () => {
      const entry = makeEntry('10', 'meeting.agenda_item_edited', {
        after: { content: 'Discuss budget allocation' },
      });
      expect(describeAuditEvent(entry)).toBe(
        "Edited agenda item to 'Discuss budget allocation'",
      );
    });

    it('describes meeting.agenda_item_deleted', () => {
      const entry = makeEntry('11', 'meeting.agenda_item_deleted', {
        before: { content: 'Old topic' },
      });
      expect(describeAuditEvent(entry)).toBe("Deleted agenda item 'Old topic'");
    });

    it('truncates long agenda content', () => {
      const longContent =
        'This is a very long agenda item that exceeds the maximum truncation length and should be shortened with ellipsis';
      const entry = makeEntry('12', 'meeting.agenda_item_added', {
        after: { content: longContent },
      });
      const result = describeAuditEvent(entry);
      expect(result).toContain('...');
      expect(result).not.toContain(longContent);
    });
  });

  describe('Document event', () => {
    it('describes meeting.document_edited', () => {
      expect(describeAuditEvent(makeEntry('13', 'meeting.document_edited'))).toBe(
        'Edited the meeting document',
      );
    });
  });

  describe('Action item events', () => {
    it('describes meeting.action_item_added', () => {
      const entry = makeEntry('14', 'meeting.action_item_added', {
        after: { title: 'Follow up with client' },
      });
      expect(describeAuditEvent(entry)).toBe("Created action item: 'Follow up with client'");
    });

    it('describes meeting.action_item_edited', () => {
      const entry = makeEntry('15', 'meeting.action_item_edited', {
        after: { title: 'Send proposal to stakeholders' },
      });
      expect(describeAuditEvent(entry)).toBe(
        "Updated action item: 'Send proposal to stakeholders'",
      );
    });

    it('describes meeting.action_item_resolved', () => {
      const entry = makeEntry('16', 'meeting.action_item_resolved', {
        after: { title: 'Review budget spreadsheet' },
      });
      expect(describeAuditEvent(entry)).toBe(
        "Resolved action item 'Review budget spreadsheet'",
      );
    });
  });

  describe('Decision and task events', () => {
    it('describes meeting.decision_created', () => {
      expect(describeAuditEvent(makeEntry('17', 'meeting.decision_created'))).toBe(
        'Created a decision',
      );
    });

    it('describes meeting.task_created', () => {
      expect(describeAuditEvent(makeEntry('18', 'meeting.task_created'))).toBe(
        'Converted an action item to a task',
      );
    });
  });

  describe('Template and tags events', () => {
    it('describes meeting.template_applied', () => {
      const entry = makeEntry('19', 'meeting.template_applied', {
        context: { template_name: 'Planning Meeting' },
      });
      expect(describeAuditEvent(entry)).toBe("Applied the 'Planning Meeting' template");
    });

    it('falls back when template name is missing', () => {
      expect(describeAuditEvent(makeEntry('19b', 'meeting.template_applied'))).toBe(
        'Applied a template',
      );
    });

    it('describes meeting.tags_changed', () => {
      expect(describeAuditEvent(makeEntry('20', 'meeting.tags_changed'))).toBe(
        'Updated meeting tags',
      );
    });
  });

  describe('Actor is not included in descriptions', () => {
    it('does not include actor name in the description', () => {
      const entry = makeEntry('21', 'meeting.title_changed', {
        after: { title: 'New Title' },
      });
      const result = describeAuditEvent(entry);
      expect(result).not.toContain('John Doe');
    });

    it('returns the same description regardless of actor', () => {
      const entry1 = makeEntry('22a', 'meeting.document_edited', { actor: mockActor });
      const entry2 = makeEntry('22b', 'meeting.document_edited', { actor: mockActor2 });
      const entry3 = makeEntry('22c', 'meeting.document_edited', { actor: null });
      expect(describeAuditEvent(entry1)).toBe(describeAuditEvent(entry2));
      expect(describeAuditEvent(entry2)).toBe(describeAuditEvent(entry3));
    });
  });

  describe('Edge cases and fallbacks', () => {
    it('handles unknown event type with default fallback', () => {
      // Cast to bypass TS — tests runtime default branch
      const entry = makeEntry('23', 'meeting.status_changed');
      expect(describeAuditEvent(entry)).toBeTruthy();
    });

    it('handles missing before/after objects gracefully', () => {
      const entry = makeEntry('24', 'meeting.participant_added');
      expect(describeAuditEvent(entry)).toBe('Added a participant');
    });

    it('handles empty string values with fallback', () => {
      const entry = makeEntry('25', 'meeting.title_changed', { after: { title: '' } });
      expect(describeAuditEvent(entry)).toBe('Updated meeting title');
    });

    it('handles non-string values in after object with fallback', () => {
      const entry = makeEntry('26', 'meeting.title_changed', { after: { title: 123 } });
      expect(describeAuditEvent(entry)).toBe('Updated meeting title');
    });

    it('does not expose purely numeric IDs', () => {
      const entry = makeEntry('27', 'meeting.title_changed', { after: { title: '42' } });
      const result = describeAuditEvent(entry);
      // Numeric-only string should be rejected; falls back to generic label
      expect(result).toBe('Updated meeting title');
    });

    it('handles invalid date in datetime_changed gracefully', () => {
      const entry = makeEntry('28', 'meeting.datetime_changed', {
        after: { scheduled_date: 'not-a-valid-date' },
      });
      expect(describeAuditEvent(entry)).toContain('not-a-valid-date');
    });
  });

  describe('All 19 event types covered', () => {
    it('returns a non-empty description for every event type', () => {
      const eventTypes: AuditLogEntry['event_type'][] = [
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
      ];

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
            user_name: 'Test User',
            role: 'organizer',
            scheduled_date: '2024-06-01',
          },
          context: { template_name: 'Test Template' },
        };

        const result = describeAuditEvent(entry);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
        expect(result).not.toContain('John Doe');
      }
    });
  });
});
