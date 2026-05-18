'use client';

import { useEffect, useState } from 'react';

import {
  TASK_ENGAGEMENT_SUMMARY_USE_MOCK,
  TaskEngagementAPI,
} from '@/lib/api/taskEngagementApi';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskEngagementSummary } from '@/types/taskEngagement';

const countFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatCount(n: number): string {
  return countFormatter.format(n);
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const h = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`;
}

function formatLastVisited(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-xs">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums text-gray-900">
        {value}
      </dd>
    </div>
  );
}

function SummaryBlock({ summary }: { summary: TaskEngagementSummary }) {
  return (
    <dl className="space-y-2.5">
      <StatRow label="Visits" value={formatCount(summary.visits)} />
      <StatRow
        label="Estimated active time"
        value={formatDurationMs(summary.estimated_active_ms)}
      />
      <StatRow
        label="Last visited"
        value={formatLastVisited(summary.last_visited_at)}
      />
      <StatRow
        label="Task write operations"
        value={formatCount(summary.write_operations_count)}
      />
    </dl>
  );
}

export default function FocusInsightsPanel({
  taskId,
  refreshKey,
  loading = false,
}: {
  taskId: number;
  refreshKey: number;
  loading?: boolean;
}) {
  const [summary, setSummary] = useState<TaskEngagementSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !taskId) {
      setSummary(null);
      setErr(null);
      return;
    }

    let cancelled = false;
    setSummary(null);
    setErr(null);

    TaskEngagementAPI.getEngagementSummary(taskId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(
            (e as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail ?? 'Failed to load focus insights',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loading, taskId, refreshKey]);

  const showSkeleton = loading || (!err && summary === null);

  return (
    <section className="rounded-xl bg-white px-4 pt-4 pb-12 shadow-sm ring-1 ring-gray-100">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Focus insights
      </h3>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {showSkeleton && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`focus-insights-skel-${i}`} className="h-3 w-full" />
          ))}
        </div>
      )}
      {!showSkeleton && summary && (
        <>
          {TASK_ENGAGEMENT_SUMMARY_USE_MOCK && (
            <p className="mb-2 text-[10px] leading-snug text-amber-700/90">
              Sample data — server-side tracking coming soon.
            </p>
          )}
          <SummaryBlock summary={summary} />
          <p className="mt-3 text-[10px] leading-snug text-gray-400">
            Based on your activity in MediaJira (API activity), not keystrokes or
            browser tabs.
          </p>
        </>
      )}
    </section>
  );
}
