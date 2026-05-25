'use client';

import { format } from 'date-fns';
import type { AuditLogEntry } from '@/types/audit';
import { describeAuditEvent } from '@/utils/describeAuditEvent';
import { AUDIT_EVENT_METADATA } from '@/types/audit';

interface AuditLogEntryCardProps {
  entry: AuditLogEntry;
  count?: number;
  className?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  lifecycle: '📅',
  metadata: '✏️',
  participant: '👤',
  agenda: '📋',
  document: '📄',
  action_item: '✅',
  decision: '⚖️',
  task: '🎯',
  template: '🎨',
  tags: '🏷️',
};

export default function AuditLogEntryCard({ entry, count, className = '' }: AuditLogEntryCardProps) {
  const metadata = AUDIT_EVENT_METADATA[entry.event_type];
  const categoryKey = metadata?.category || 'metadata';
  const icon = CATEGORY_ICONS[categoryKey] ?? '📌';

  const timestamp = format(new Date(entry.timestamp), 'MMM d, h:mm a');
  const actorName = entry.actor?.display_name || 'System';
  const description = describeAuditEvent(entry);

  return (
    <div
      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50 ${className}`}
    >
      <span className="mt-0.5 shrink-0 select-none text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-gray-800">
          {description}
          {count && count > 1 && (
            <span className="ml-1.5 text-xs font-medium text-gray-400">({count} times)</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {actorName} · {timestamp}
        </p>
      </div>
    </div>
  );
}
