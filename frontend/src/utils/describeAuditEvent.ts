/**
 * Human-readable audit event descriptions
 *
 * Pure function that generates action-only sentences for audit log entries.
 * Actor is intentionally excluded — it is shown separately in the UI meta line.
 */

import { AuditLogEntry } from '@/types/audit';

function truncateString(str: string, maxLength: number = 50): string {
  if (!str || typeof str !== 'string') return '';
  return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str;
}

/**
 * Extract a human-readable string value from a record.
 * Returns empty string for missing, empty, or purely-numeric values to prevent
 * raw IDs (e.g. "42") from reaching the UI.
 */
function getString(obj: Record<string, unknown> | null | undefined, key: string): string {
  if (!obj || typeof obj !== 'object') return '';
  const value = obj[key];
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^\d+$/.test(value.trim())) return '';
  return value;
}

/**
 * Generate a human-readable, actor-free description for an audit log entry.
 * Each description starts with a capitalized verb.
 */
export function describeAuditEvent(entry: AuditLogEntry): string {
  switch (entry.event_type) {
    case 'meeting.status_changed': {
      const from = getString(entry.before, 'status') || 'unknown';
      const to = getString(entry.after, 'status') || 'unknown';
      return `Changed status from ${from} to ${to}`;
    }

    case 'meeting.title_changed': {
      const title = getString(entry.after, 'title');
      return title
        ? `Updated meeting title to '${truncateString(title)}'`
        : 'Updated meeting title';
    }

    case 'meeting.objective_changed':
      return 'Updated meeting objective';

    case 'meeting.summary_changed':
      return 'Updated meeting summary';

    case 'meeting.type_changed': {
      const typeName = getString(entry.after, 'type_name');
      return typeName ? `Changed meeting type to '${typeName}'` : 'Changed meeting type';
    }

    case 'meeting.datetime_changed': {
      const date = getString(entry.after, 'scheduled_date');
      if (!date) return 'Rescheduled the meeting';
      const time = getString(entry.after, 'scheduled_time');
      return `Rescheduled to ${time ? `${date} at ${time}` : date}`;
    }

    case 'meeting.participant_added': {
      const userName = getString(entry.after, 'user_name');
      const role = getString(entry.after, 'role') || 'participant';
      return userName ? `Added ${userName} as a ${role}` : 'Added a participant';
    }

    case 'meeting.participant_removed': {
      const userName = getString(entry.after, 'user_name');
      return userName ? `Removed ${userName} from participants` : 'Removed a participant';
    }

    case 'meeting.agenda_item_added': {
      const content = getString(entry.after, 'content');
      return content
        ? `Added agenda item: '${truncateString(content)}'`
        : 'Added an agenda item';
    }

    case 'meeting.agenda_item_edited': {
      const content = getString(entry.after, 'content');
      return content
        ? `Edited agenda item to '${truncateString(content)}'`
        : 'Edited an agenda item';
    }

    case 'meeting.agenda_item_deleted': {
      const content = getString(entry.before, 'content');
      return content
        ? `Deleted agenda item '${truncateString(content)}'`
        : 'Deleted an agenda item';
    }

    case 'meeting.document_edited':
      return 'Edited the meeting document';

    case 'meeting.action_item_added': {
      const title = getString(entry.after, 'title');
      return title ? `Created action item: '${truncateString(title)}'` : 'Created an action item';
    }

    case 'meeting.action_item_edited': {
      const title = getString(entry.after, 'title');
      return title ? `Updated action item: '${truncateString(title)}'` : 'Updated an action item';
    }

    case 'meeting.action_item_resolved': {
      const title = getString(entry.after, 'title');
      return title
        ? `Resolved action item '${truncateString(title)}'`
        : 'Resolved an action item';
    }

    case 'meeting.decision_created':
      return 'Created a decision';

    case 'meeting.task_created':
      return 'Converted an action item to a task';

    case 'meeting.template_applied': {
      const templateName = getString(entry.context, 'template_name');
      return templateName ? `Applied the '${templateName}' template` : 'Applied a template';
    }

    case 'meeting.tags_changed':
      return 'Updated meeting tags';

    default:
      return 'Updated the meeting';
  }
}
