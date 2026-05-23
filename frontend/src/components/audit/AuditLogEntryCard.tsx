'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, User, Zap } from 'lucide-react';
import { format } from 'date-fns';
import type { AuditLogEntry } from '@/types/audit';
import { describeAuditEvent } from '@/utils/describeAuditEvent';
import { AUDIT_EVENT_METADATA, AUDIT_EVENT_CATEGORIES } from '@/types/audit';

interface AuditLogEntryCardProps {
  entry: AuditLogEntry;
  className?: string;
}

export default function AuditLogEntryCard({ entry, className = '' }: AuditLogEntryCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const metadata = AUDIT_EVENT_METADATA[entry.event_type];
  const categoryKey = metadata?.category || 'metadata';
  const category = AUDIT_EVENT_CATEGORIES[categoryKey];

  const hasDetails = entry.before || entry.after || entry.context;
  const timestamp = format(new Date(entry.timestamp), 'MMM d, h:mm a');
  const actorName = entry.actor?.display_name || 'System';
  const description = describeAuditEvent(entry);

  // Get icon for the event category
  const getCategoryIcon = () => {
    switch (categoryKey) {
      case 'lifecycle':
        return '📅';
      case 'metadata':
        return '✏️';
      case 'participant':
        return '👤';
      case 'agenda':
        return '📋';
      case 'document':
        return '📄';
      case 'action_item':
        return '✅';
      case 'decision':
        return '⚖️';
      case 'task':
        return '🎯';
      case 'template':
        return '🎨';
      case 'tags':
        return '🏷️';
      default:
        return '📌';
    }
  };

  const categoryColor = {
    lifecycle: 'text-blue-600 dark:text-blue-400',
    metadata: 'text-gray-600 dark:text-gray-400',
    participant: 'text-purple-600 dark:text-purple-400',
    agenda: 'text-orange-600 dark:text-orange-400',
    document: 'text-yellow-600 dark:text-yellow-400',
    action_item: 'text-green-600 dark:text-green-400',
    decision: 'text-red-600 dark:text-red-400',
    task: 'text-indigo-600 dark:text-indigo-400',
    template: 'text-pink-600 dark:text-pink-400',
    tags: 'text-cyan-600 dark:text-cyan-400',
  }[categoryKey] || 'text-gray-600';

  return (
    <div className={`border-l-4 border-l-blue-300 bg-white dark:bg-gray-900 p-4 ${className}`}>
      {/* Header with icon, timestamp, and actor */}
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-xl ${categoryColor}`}>{getCategoryIcon()}</span>
        <time className="text-sm text-gray-500 dark:text-gray-400">{timestamp}</time>
        <div className="flex-1" />
        <div className="inline-block px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
          {actorName}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-900 dark:text-gray-100 mb-3">{description}</p>

      {/* Collapsible details section */}
      {hasDetails && (
        <div>
          <button
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            {isDetailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Details
          </button>

          {isDetailsOpen && (
            <div className="mt-3 space-y-2 bg-gray-50 dark:bg-gray-800 rounded p-3 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-auto max-h-64">
              {entry.before && (
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Before:</div>
                  <pre className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                    {JSON.stringify(entry.before, null, 2)}
                  </pre>
                </div>
              )}
              {entry.after && (
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">After:</div>
                  <pre className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                    {JSON.stringify(entry.after, null, 2)}
                  </pre>
                </div>
              )}
              {entry.context && (
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Context:</div>
                  <pre className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                    {JSON.stringify(entry.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
