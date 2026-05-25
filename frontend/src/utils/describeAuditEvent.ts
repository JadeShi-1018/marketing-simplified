/**
 * Human-readable audit event descriptions
 *
 * Pure function that generates descriptive sentences for audit log entries.
 * Used to display audit events in the UI in a user-friendly format.
 */

import { AuditLogEntry } from '@/types/audit';

/**
 * Helper: Format actor name, defaulting to "System" for system-initiated events
 */
function formatActor(entry: AuditLogEntry): string {
  return entry.actor?.display_name || 'System';
}

/**
 * Helper: Truncate long strings with ellipsis
 */
function truncateString(str: string, maxLength: number = 50): string {
  if (!str || typeof str !== 'string') return '';
  return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str;
}

/**
 * Helper: Format ISO 8601 datetime to readable format
 */
function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'unknown time';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'unknown time';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'unknown time';
  }
}

/**
 * Helper: Extract a human-readable string value from a record.
 * Returns fallback for missing, empty, or numeric-only values to prevent
 * raw IDs (e.g. "42", "decision_id: 5") from reaching the UI.
 */
function getString(obj: Record<string, unknown> | null | undefined, key: string, fallback: string = 'unknown'): string {
  if (!obj || typeof obj !== 'object') return fallback;
  const value = obj[key];
  if (typeof value !== 'string' || !value.trim()) return fallback;
  // Reject purely numeric strings — those are raw IDs, not human-readable labels
  if (/^\d+$/.test(value.trim())) return fallback;
  return value;
}

/**
 * Generate a human-readable description for an audit log entry
 *
 * @param entry - The audit log entry to describe
 * @returns A single-sentence description of the audit event
 */
export function describeAuditEvent(entry: AuditLogEntry): string {
  const actor = formatActor(entry);

  switch (entry.event_type) {
    // Lifecycle events
    case 'meeting.status_changed': {
      const from = getString(entry.before, 'status', 'unknown status');
      const to = getString(entry.after, 'status', 'unknown status');
      return `${actor} changed the meeting status from ${from} to ${to}`;
    }

    // Metadata events
    case 'meeting.title_changed': {
      const title = getString(entry.after, 'title', 'the meeting');
      return `${actor} updated the meeting title to '${truncateString(title)}'`;
    }

    case 'meeting.objective_changed': {
      return `${actor} updated the meeting objective`;
    }

    case 'meeting.summary_changed': {
      return `${actor} updated the meeting summary`;
    }

    case 'meeting.type_changed': {
      const typeName = getString(entry.after, 'type_name', 'new type');
      return `${actor} changed the meeting type to '${typeName}'`;
    }

    case 'meeting.datetime_changed': {
      const date = getString(entry.after, 'scheduled_date', 'a new time');
      const time = getString(entry.after, 'scheduled_time', '');
      const formatted = time ? `${date} at ${time}` : date;
      return `${actor} rescheduled the meeting to ${formatted}`;
    }

    // Participant events
    case 'meeting.participant_added': {
      const userName = getString(entry.after, 'user_name', 'a participant');
      const role = getString(entry.after, 'role', 'participant');
      return `${actor} added ${userName} as a ${role}`;
    }

    case 'meeting.participant_removed': {
      const userName = getString(entry.after, 'user_name', 'a participant');
      return `${actor} removed ${userName} from participants`;
    }

    // Agenda events
    case 'meeting.agenda_item_added': {
      const content = getString(entry.after, 'content', 'an agenda item');
      return `${actor} added agenda item: '${truncateString(content)}'`;
    }

    case 'meeting.agenda_item_edited': {
      const content = getString(entry.after, 'content', 'an agenda item');
      return `${actor} edited agenda item to '${truncateString(content)}'`;
    }

    case 'meeting.agenda_item_deleted': {
      const content = getString(entry.before, 'content', 'an agenda item');
      return `${actor} deleted the agenda item '${truncateString(content)}'`;
    }

    // Document event
    case 'meeting.document_edited': {
      return `${actor} edited the meeting document`;
    }

    // Action item events
    case 'meeting.action_item_added': {
      const title = getString(entry.after, 'title', 'an action item');
      return `${actor} created action item: '${truncateString(title)}'`;
    }

    case 'meeting.action_item_edited': {
      const title = getString(entry.after, 'title', 'an action item');
      return `${actor} updated action item: '${truncateString(title)}'`;
    }

    case 'meeting.action_item_resolved': {
      const title = getString(entry.after, 'title', 'an action item');
      return `${actor} marked action item '${truncateString(title)}' as resolved`;
    }

    // Decision and task events
    case 'meeting.decision_created': {
      return `${actor} created a decision`;
    }

    case 'meeting.decision_updated': {
      return `${actor} updated a decision`;
    }

    case 'meeting.decision_deleted': {
      return `${actor} deleted a decision`;
    }

    case 'meeting.task_created': {
      return `${actor} converted an action item to a task`;
    }

    case 'meeting.task_updated': {
      return `${actor} updated a task`;
    }

    case 'meeting.task_deleted': {
      return `${actor} deleted a task`;
    }

    // Template and tags events
    case 'meeting.template_applied': {
      const templateName = getString(entry.context, 'template_name', 'a template');
      return `${actor} applied the '${templateName}' template`;
    }

    case 'meeting.tags_changed': {
      return `${actor} updated the meeting tags`;
    }

    // Fallback for unknown event types
    default:
      return `${actor} updated the meeting`;
  }
}
