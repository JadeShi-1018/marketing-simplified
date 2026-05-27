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

type GroupedEntry = { entry: AuditLogEntry; count: number };

const FIVE_MIN_MS = 5 * 60 * 1000;

function mergeConsecutive(entries: AuditLogEntry[]): GroupedEntry[] {
  const result: GroupedEntry[] = [];
  for (const entry of entries) {
    const last = result[result.length - 1];
    if (
      last &&
      last.entry.event_type === entry.event_type &&
      last.entry.actor?.id === entry.actor?.id &&
      Math.abs(
        new Date(entry.timestamp).getTime() - new Date(last.entry.timestamp).getTime(),
      ) <= FIVE_MIN_MS
    ) {
      last.count++;
    } else {
      result.push({ entry, count: 1 });
    }
  }
  return result;
}

function DateDivider({ date }: { date: Date }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      <span className="whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">
        {format(date, 'MMMM d, yyyy')}
      </span>
      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
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
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <span className="mb-3 text-4xl">📋</span>
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
          <div>
            {mergeConsecutive(group.entries).map(({ entry, count }) => (
              <AuditLogEntryCard key={entry.id} entry={entry} count={count} />
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {isLoadingMore ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
