'use client';

import { format, isSameDay } from 'date-fns';
import type { AuditLogEntry } from '@/types/audit';
import AuditLogEntryCard from './AuditLogEntryCard';

interface AuditLogTimelineProps {
  entries: AuditLogEntry[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function DateDivider({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {format(date, 'MMMM d, yyyy')}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

export default function AuditLogTimeline({
  entries,
  isLoading,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: AuditLogTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <span className="text-4xl mb-3">📋</span>
        <p className="text-sm">No audit log entries found.</p>
      </div>
    );
  }

  const grouped: Array<{ date: Date; entries: AuditLogEntry[] }> = [];
  for (const entry of entries) {
    const entryDate = new Date(entry.timestamp);
    const last = grouped[grouped.length - 1];
    if (last && isSameDay(last.date, entryDate)) {
      last.entries.push(entry);
    } else {
      grouped.push({ date: entryDate, entries: [entry] });
    }
  }

  return (
    <div>
      {grouped.map((group, gi) => (
        <div key={gi}>
          <DateDivider date={group.date} />
          <div className="space-y-2">
            {group.entries.map((entry) => (
              <AuditLogEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-5 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
