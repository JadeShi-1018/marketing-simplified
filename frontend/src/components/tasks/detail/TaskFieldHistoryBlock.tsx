'use client';

import { useEffect, useState } from 'react';
import { History, ArrowRight } from 'lucide-react';
import { TaskAPI } from '@/lib/api/taskApi';
import type { TaskFieldHistoryEntry } from '@/types/task';
import { Skeleton } from '@/components/ui/skeleton';

const FIELD_LABELS: Record<string, string> = {
  summary: 'Summary',
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  owner: 'Owner',
  due_date: 'Due date',
  planned_start_date: 'Planned start',
  description: 'Description',
};

function fmtDate(iso: string): { relative: string; absolute: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { relative: iso, absolute: iso };
  const diff = (Date.now() - d.getTime()) / 1000;
  let relative: string;
  if (diff < 60) relative = 'just now';
  else if (diff < 3600) relative = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) relative = `${Math.floor(diff / 3600)}h ago`;
  else if (diff < 86400 * 7) relative = `${Math.floor(diff / 86400)}d ago`;
  else relative = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const absolute = d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return { relative, absolute };
}

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

function ValueChip({ value, empty }: { value: string | null; empty?: boolean }) {
  if (empty || value === null || value === '') {
    return <span className="italic text-gray-400">empty</span>;
  }
  return (
    <span className="inline-block max-w-[180px] truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
      {value}
    </span>
  );
}

function HistoryRow({ entry }: { entry: TaskFieldHistoryEntry }) {
  const label = FIELD_LABELS[entry.field_name] ?? entry.field_name;
  const actor = entry.changed_by_name ?? 'System';

  return (
    <div className="flex items-start gap-3 py-3">
      {/* Avatar */}
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7ee3e8] to-[#b9ee98] text-[10px] font-bold text-white">
        {entry.changed_by_avatar ? (
          <img src={entry.changed_by_avatar} alt={actor} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          initials(actor)
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1 text-xs text-gray-700">
          <span className="font-semibold">{actor}</span>
          <span className="text-gray-400">changed</span>
          <span className="font-medium text-gray-600">{label}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <ValueChip value={entry.old_value} empty={!entry.old_value} />
          <ArrowRight className="h-3 w-3 flex-shrink-0 text-gray-400" />
          <ValueChip value={entry.new_value} empty={!entry.new_value} />
        </div>
        {(() => { const { relative, absolute } = fmtDate(entry.changed_at); return (
          <p className="mt-1 text-[10px] text-gray-400" title={absolute}>{relative}</p>
        ); })()}
      </div>
    </div>
  );
}

export default function TaskFieldHistoryBlock({
  taskId,
  refreshKey,
  loading = false,
}: {
  taskId: number;
  refreshKey?: number;
  loading?: boolean;
}) {
  const [entries, setEntries] = useState<TaskFieldHistoryEntry[] | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading || !taskId) return;
    let cancelled = false;
    setFetching(true);
    TaskAPI.getFieldHistory(taskId)
      .then((res) => {
        if (!cancelled) setEntries(res.data as TaskFieldHistoryEntry[]);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => { cancelled = true; };
  }, [taskId, refreshKey, loading]);

  if (loading || fetching) {
    return (
      <div className="space-y-3 px-1 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-400">
        <History className="h-8 w-8 opacity-40" />
        <p className="text-sm">No field changes recorded yet.</p>
        <p className="text-xs">Changes to summary, status, priority, and other fields will appear here.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {entries.map((entry) => (
        <HistoryRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
