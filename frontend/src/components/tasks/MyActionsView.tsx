'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Clock, ShieldAlert, Flame, CheckCircle2,
  ClipboardList, Hourglass, MessageCircle, ChevronDown, ChevronUp, LockOpen,
} from 'lucide-react';
import { TaskAPI } from '@/lib/api/taskApi';
import type { MyActionsPayload, MyActionsTaskStub } from '@/types/task';
import { Skeleton } from '@/components/ui/skeleton';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved', LOCKED: 'Locked', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
};

const PRIORITY_CLS: Record<string, string> = {
  HIGHEST: 'text-rose-600', HIGH: 'text-orange-500',
  MEDIUM: 'text-gray-400', LOW: 'text-sky-500', LOWEST: 'text-gray-300',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Task row ──────────────────────────────────────────────────────────────────

function ActionTaskRow({ task }: { task: MyActionsTaskStub }) {
  const isOverdue = task.due_date && new Date(task.due_date + 'T00:00:00') < new Date(new Date().toDateString());
  return (
    <li className="flex min-w-0 items-center gap-2 py-1.5">
      {task.priority && (
        <span className={`shrink-0 text-[10px] font-bold ${PRIORITY_CLS[task.priority] ?? 'text-gray-400'}`}>
          {task.priority[0]}
        </span>
      )}
      <Link
        href={`/tasks/${task.id}`}
        className="min-w-0 flex-1 truncate text-sm text-gray-800 hover:text-[#3CCED7] hover:underline"
      >
        {task.summary}
      </Link>
      {task.due_date && (
        <span className={`shrink-0 text-[11px] ${isOverdue ? 'font-medium text-rose-500' : 'text-gray-400'}`}>
          {formatDate(task.due_date)}
        </span>
      )}
      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
        {STATUS_LABEL[task.status] ?? task.status}
      </span>
    </li>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

interface SectionProps {
  icon: typeof AlertTriangle;
  label: string;
  tasks: MyActionsTaskStub[];
  iconCls: string;
  bgCls: string;
  hint: string;
}

function ActionSection({ icon: Icon, label, tasks, iconCls, bgCls, hint }: SectionProps) {
  const [open, setOpen] = useState(true);
  if (tasks.length === 0) return null;

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${bgCls}`}>
            <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
          </span>
          <div>
            <span className="text-[13px] font-semibold text-gray-900">{label}</span>
            <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tasks.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {open
            ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 pb-3">
          <p className="mb-2 text-[11px] text-gray-400">{hint}</p>
          <ul className="max-h-[220px] divide-y divide-gray-50 overflow-y-auto pr-1">
            {tasks.map((t) => <ActionTaskRow key={t.id} task={t} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <h2 className="text-base font-semibold text-gray-900">All clear</h2>
      <p className="mt-1 text-sm text-gray-400">No tasks need your attention right now.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MyActionsView({ projectId, refreshKey }: { projectId: number | null; refreshKey?: number }) {
  const [data, setData] = useState<MyActionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    if (data === null) setLoading(true);
    else setRefreshing(true);
    setError(null);
    TaskAPI.getMyActions({ project_id: projectId })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Failed to load your actions'); })
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey]);

  if (!projectId) {
    return (
      <div className="py-24 text-center text-sm text-gray-400">Select a project to view your actions.</div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>;
  }

  if (!data) return null;

  const totalActions =
    data.awaiting_my_approval.length +
    data.approved_pending_lock.length +
    data.overdue_i_own.length +
    data.due_soon_i_own.length +
    data.blocked_i_own.length +
    data.high_priority_i_own.length +
    data.assigned_to_me.length +
    data.comment_followups.length;

  if (totalActions === 0) return <EmptyState />;

  return (
    <div className={`space-y-3 transition-opacity duration-150 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
      <ActionSection
        icon={Hourglass}
        label="Awaiting My Approval"
        tasks={data.awaiting_my_approval}
        iconCls="text-blue-500" bgCls="bg-blue-50"
        hint="Tasks where you are the approver and a decision is pending."
      />
      <ActionSection
        icon={LockOpen}
        label="Approved — Pending Lock"
        tasks={data.approved_pending_lock}
        iconCls="text-teal-600" bgCls="bg-teal-50"
        hint="Tasks you approved that are ready to be locked."
      />
      <ActionSection
        icon={AlertTriangle}
        label="Overdue"
        tasks={data.overdue_i_own}
        iconCls="text-rose-600" bgCls="bg-rose-50"
        hint="Your tasks whose due date has already passed."
      />
      <ActionSection
        icon={Clock}
        label="Due Soon"
        tasks={data.due_soon_i_own}
        iconCls="text-amber-600" bgCls="bg-amber-50"
        hint="Your tasks with a due date in the next 7 days."
      />
      <ActionSection
        icon={ShieldAlert}
        label="Blocked"
        tasks={data.blocked_i_own}
        iconCls="text-orange-500" bgCls="bg-orange-50"
        hint="Your tasks that are blocked by another task."
      />
      <ActionSection
        icon={Flame}
        label="High Priority"
        tasks={data.high_priority_i_own}
        iconCls="text-rose-500" bgCls="bg-rose-50"
        hint="Your incomplete tasks marked High or Highest priority."
      />
      <ActionSection
        icon={MessageCircle}
        label="Comment Follow-ups"
        tasks={data.comment_followups}
        iconCls="text-violet-500" bgCls="bg-violet-50"
        hint="Tasks you've commented on that have had new activity since your last comment."
      />
      <ActionSection
        icon={ClipboardList}
        label="Assigned to Me"
        tasks={data.assigned_to_me}
        iconCls="text-gray-500" bgCls="bg-gray-100"
        hint="All active tasks where you are the owner."
      />
    </div>
  );
}
