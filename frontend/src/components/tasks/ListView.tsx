'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, ArrowUpToLine, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import type { TaskBulkFailureItem, TaskData } from '@/types/task';
import {
  PRIORITY_META,
  PRIORITY_OPTIONS,
  STATUS_META,
  STATUS_OPTIONS,
  TASK_TYPES,
  formatDateShort,
} from './TYPE_META';
import {
  START_MUST_BE_ON_OR_BEFORE_DUE,
  violatesStartBeforeDue,
} from '@/lib/tasks/taskScheduleDates';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskAPI } from '@/lib/api/taskApi';
import { useTaskStore } from '@/lib/taskStore';
import { ProjectAPI, type ProjectMemberData } from '@/lib/api/projectApi';
import BulkActionToolbar, { type BulkField } from './BulkActionToolbar';
import TaskListRowContextMenu, {
  type TaskListRowContextMenuState,
} from '@/components/tasks/TaskListRowContextMenu';
import LinearBulkOutputModal from '@/components/linear/LinearBulkOutputModal';

interface ListViewProps {
  tasks: TaskData[];
  loading: boolean;
  error: string | null;
  projectId: number | null;
  /** Opens the shared Linear import modal owned by the tasks page. */
  onOpenLinearImport?: () => void;
  /** After a successful bulk push to Linear, refresh task list from parent. */
  onLinearBulkSynced?: () => void | Promise<void>;
}

const TYPE_LABEL = TASK_TYPES.reduce<Record<string, string>>((acc, t) => {
  acc[t.value] = t.shortLabel;
  return acc;
}, {});

const TABLE_COLUMN_WIDTHS = {
  icon: 'w-10',
  select: 'w-10',
  type: 'w-[76px]',
  status: 'w-[118px]',
  owner: 'w-[116px]',
  approver: 'w-[116px]',
  start: 'w-[104px]',
  due: 'w-[104px]',
} as const;

const APPROVER_QUICK_EDITABLE_STATUSES: TaskData['status'][] = ['DRAFT', 'SUBMITTED'];
const STATUS_DOT_CLASS: Record<string, string> = {
  DRAFT: 'bg-gray-400',
  SUBMITTED: 'bg-sky-500',
  UNDER_REVIEW: 'bg-amber-500',
  APPROVED: 'bg-emerald-500',
  REJECTED: 'bg-rose-500',
  LOCKED: 'bg-violet-500',
  CANCELLED: 'bg-gray-400',
};

const LIST_PAGE_SIZE = 10;

export default function ListView({
  tasks,
  loading,
  error,
  projectId,
  onOpenLinearImport,
  onLinearBulkSynced,
}: ListViewProps) {
  const router = useRouter();
  const removeTask = useTaskStore((s) => s.removeTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [linearBulkOpen, setLinearBulkOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMemberData[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingSummaryId, setEditingSummaryId] = useState<number | null>(null);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [openDuePickerTaskId, setOpenDuePickerTaskId] = useState<number | null>(null);
  const [dueDraftByTaskId, setDueDraftByTaskId] = useState<Record<number, string>>({});
  const [openStartPickerTaskId, setOpenStartPickerTaskId] = useState<number | null>(null);
  const [startDraftByTaskId, setStartDraftByTaskId] = useState<Record<number, string>>({});
  const [openPriorityTaskId, setOpenPriorityTaskId] = useState<number | null>(null);
  const [openStatusTaskId, setOpenStatusTaskId] = useState<number | null>(null);
  const [openOwnerTaskId, setOpenOwnerTaskId] = useState<number | null>(null);
  const [openApproverTaskId, setOpenApproverTaskId] = useState<number | null>(null);
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const [bulkFailures, setBulkFailures] = useState<TaskBulkFailureItem[]>([]);
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<number[]>([]);
  const [truncatedSummaryIds, setTruncatedSummaryIds] = useState<number[]>([]);
  const updateTaskInStore = useTaskStore((s) => s.updateTask);
  const updateTasksBulkInStore = useTaskStore((s) => s.updateTasksBulk);

  const parseApiError = (err: unknown, fallback: string) => {
    const data = (err as any)?.response?.data;
    if (typeof data?.detail === 'string') return data.detail;
    if (typeof data?.error === 'string') return data.error;
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) {
      return String(data.non_field_errors[0]);
    }
    return fallback;
  };

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => tasks.some((t) => t.id === id)));
  }, [tasks]);

  useEffect(() => {
    if (!bulkMode) {
      setSelectedIds([]);
    }
  }, [bulkMode]);

  useEffect(() => {
    const closeMenus = () => {
      setOpenDuePickerTaskId(null);
      setOpenStartPickerTaskId(null);
      setOpenPriorityTaskId(null);
      setOpenStatusTaskId(null);
      setOpenOwnerTaskId(null);
      setOpenApproverTaskId(null);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!projectId) {
      setMembers([]);
      return;
    }
    ProjectAPI.getAllProjectMembers(projectId)
      .then((rows) => {
        if (!mounted) return;
        setMembers(rows.filter((m) => m.is_active));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [projectId]);
  const [rowMenu, setRowMenu] = useState<TaskListRowContextMenuState>(null);
  const [menuMembers, setMenuMembers] = useState<ProjectMemberData[]>([]);
  const [menuMembersLoading, setMenuMembersLoading] = useState(false);
  const membersByProjectIdRef = useRef<Map<number, ProjectMemberData[]>>(new Map());
  const pendingMemberFetchesRef = useRef<Map<number, Promise<ProjectMemberData[]>>>(new Map());

  useEffect(() => {
    if (!rowMenu) {
      setMenuMembers([]);
      setMenuMembersLoading(false);
      return;
    }
    const pid = rowMenu.task.project_id ?? rowMenu.task.project?.id ?? null;
    if (pid == null) {
      setMenuMembers([]);
      setMenuMembersLoading(false);
      return;
    }

    const cached = membersByProjectIdRef.current.get(pid);
    if (cached) {
      setMenuMembers(cached);
      setMenuMembersLoading(false);
      return;
    }

    let cancelled = false;
    setMenuMembers([]);
    setMenuMembersLoading(true);

    const existing = pendingMemberFetchesRef.current.get(pid);
    const promise =
      existing ??
      ProjectAPI.getProjectMembers(pid)
        .then((rows) => {
          membersByProjectIdRef.current.set(pid, rows);
          pendingMemberFetchesRef.current.delete(pid);
          return rows;
        })
        .catch(() => {
          pendingMemberFetchesRef.current.delete(pid);
          return [] as ProjectMemberData[];
        });
    if (!existing) {
      pendingMemberFetchesRef.current.set(pid, promise);
    }

    void promise.then((rows) => {
      if (!cancelled) {
        setMenuMembers(rows);
        setMenuMembersLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rowMenu]);

  const openRowMenu = useCallback((e: MouseEvent, task: TaskData) => {
    e.preventDefault();
    e.stopPropagation();
    if (task.id == null) return;
    let x = e.clientX;
    let y = e.clientY;
    setRowMenu({ task, x, y });
  }, []);

  const closeRowMenu = useCallback(() => setRowMenu(null), []);

  const handleOpenDetail = useCallback(
    (taskId: number) => {
      router.push(`/tasks/${taskId}`);
    },
    [router]
  );

  const handleTaskDeleted = useCallback(
    (taskId: number) => {
      removeTask(taskId);
    },
    [removeTask]
  );

  const handleTaskPatched = useCallback(
    (taskId: number, data: Partial<TaskData>) => {
      updateTask(taskId, data);
    },
    [updateTask]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) =>
      `${t.summary ?? ''} ${t.type ?? ''} ${t.owner?.username ?? ''} ${t.current_approver?.username ?? ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [search, tasks]);

  const totalPages = Math.max(1, Math.ceil(visible.length / LIST_PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const paginatedVisible = useMemo(() => {
    const start = (safeCurrentPage - 1) * LIST_PAGE_SIZE;
    return visible.slice(start, start + LIST_PAGE_SIZE);
  }, [safeCurrentPage, visible]);
  const pageStart = visible.length === 0 ? 0 : (safeCurrentPage - 1) * LIST_PAGE_SIZE + 1;
  const pageEnd = Math.min(visible.length, safeCurrentPage * LIST_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (loading) {
      setTruncatedSummaryIds([]);
      return;
    }

    const measureTruncation = () => {
      const nodes = document.querySelectorAll<HTMLElement>('[data-summary-id]');
      const next: number[] = [];
      nodes.forEach((node) => {
        const id = Number(node.dataset.summaryId);
        if (!Number.isFinite(id)) return;
        const isTruncated =
          node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
        if (isTruncated) next.push(id);
      });
      setTruncatedSummaryIds(next);
    };

    const frame = window.requestAnimationFrame(measureTruncation);
    window.addEventListener('resize', measureTruncation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureTruncation);
    };
  }, [loading, paginatedVisible]);

  const memberOptions = useMemo(() => {
    if (members.length > 0) {
      return members.map((m) => ({
        id: m.user.id,
        label:
          m.user.name ||
          (m.user.username && m.user.username.length > 1 ? m.user.username : undefined) ||
          m.user.email ||
          m.user.username ||
          `User #${m.user.id}`,
      }));
    }
    const unique = new Map<number, string>();
    tasks.forEach((task) => {
      if (task.owner?.id) unique.set(task.owner.id, task.owner.username || task.owner.email || `User #${task.owner.id}`);
      if (task.current_approver?.id) {
        unique.set(
          task.current_approver.id,
          task.current_approver.username || task.current_approver.email || `User #${task.current_approver.id}`
        );
      }
    });
    return Array.from(unique.entries()).map(([id, label]) => ({ id, label }));
  }, [members, tasks]);

  const toggleSelection = (taskId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return Array.from(next);
    });
  };

  const openLinearOutput = () => {
    if (selectedIds.length === 0) {
      toast('Select one or more tasks with the checkboxes first.', { duration: 5000 });
      return;
    }
    setLinearBulkOpen(true);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      const pageIds = new Set(paginatedVisible.map((t) => t.id).filter(Boolean) as number[]);
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      paginatedVisible.forEach((task) => {
        if (task.id) next.add(task.id);
      });
      return Array.from(next);
    });
  };

  const setTaskSaving = (taskId: number, saving: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (saving) next.add(taskId);
      else next.delete(taskId);
      return Array.from(next);
    });
  };

  const markRecentlyUpdated = (taskIds: number[]) => {
    setRecentlyUpdatedIds((prev) => {
      const next = new Set(prev);
      taskIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
    window.setTimeout(() => {
      setRecentlyUpdatedIds((prev) => prev.filter((id) => !taskIds.includes(id)));
    }, 900);
  };

  const updateSingleTask = async (
    task: TaskData,
    patch: Partial<TaskData>,
    requestData: Record<string, unknown>,
    fallbackError: string
  ): Promise<boolean> => {
    if (!task.id) return false;
    const previous = { ...task };
    updateTaskInStore(task.id, patch);
    setTaskSaving(task.id, true);
    try {
      await TaskAPI.updateTask(task.id, requestData as Partial<TaskData>);
      markRecentlyUpdated([task.id]);
      return true;
    } catch (err) {
      updateTaskInStore(task.id, previous);
      toast.error(parseApiError(err, fallbackError));
      return false;
    } finally {
      setTaskSaving(task.id, false);
    }
  };

  const commitSummaryEdit = async (task: TaskData) => {
    const next = summaryDraft.trim();
    setEditingSummaryId(null);
    if (!task.id || !next || next === task.summary) return;
    const ok = await updateSingleTask(
      task,
      { summary: next },
      { summary: next },
      'Failed to update summary'
    );
    if (ok) toast.success('Summary updated');
  };

  const updateTaskStatus = async (task: TaskData, nextStatus: string) => {
    if (!task.id || task.status === nextStatus) return;
    const previous = task.status;
    updateTaskInStore(task.id, { status: nextStatus as TaskData['status'] });
    setTaskSaving(task.id, true);
    try {
      await TaskAPI.bulkAction({
        task_ids: [task.id],
        status: nextStatus as TaskData['status'],
      });
      toast.success('Status updated');
    } catch (err) {
      updateTaskInStore(task.id, { status: previous });
      toast.error(parseApiError(err, 'Failed to update status'));
    } finally {
      setTaskSaving(task.id, false);
    }
  };

  const applyBulkField = async (field: BulkField, value: string) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    setBulkFailures([]);
    const payload: Record<string, unknown> = { task_ids: selectedIds };

    if (field === 'owner_id' || field === 'current_approver_id') {
      payload[field] = Number(value);
    } else {
      payload[field] = value;
    }

    try {
      const response = await TaskAPI.bulkAction(payload as any);
      const patched: Partial<TaskData> = {};
      if (field === 'status') patched.status = value as TaskData['status'];
      if (field === 'due_date') patched.due_date = value;
      if (field === 'owner_id') {
        const owner = memberOptions.find((m) => m.id === Number(value));
        patched.owner_id = Number(value);
        patched.owner = owner
          ? { id: owner.id, username: owner.label, email: '' }
          : undefined;
      }
      if (field === 'current_approver_id') {
        const approver = memberOptions.find((m) => m.id === Number(value));
        patched.current_approver_id = Number(value);
        patched.current_approver = approver
          ? { id: approver.id, username: approver.label, email: '' }
          : undefined;
      }
      if (field === 'priority') patched.priority = value;
      if (field === 'start_date') patched.start_date = value;
      if (field === 'planned_start_date') patched.planned_start_date = value;
      updateTasksBulkInStore(selectedIds, patched);
      markRecentlyUpdated(selectedIds);
      setSelectedIds([]);
      toast.success(response.detail || `Updated ${response.result.updated_count} task(s)`);
    } catch (err) {
      const data = (err as any)?.response?.data;
      const failed = data?.result?.failed;
      if (Array.isArray(failed) && failed.length > 0) {
        setBulkFailures(failed as TaskBulkFailureItem[]);
        toast.error(`${failed.length} task(s) failed. ${failed[0].reason}`);
      } else {
        toast.error(parseApiError(err, 'Bulk update failed'));
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const getAllowedStatusOptions = (status: TaskData['status'] | undefined): string[] => {
    const current = status ?? 'DRAFT';
    const map: Record<string, string[]> = {
      DRAFT: ['SUBMITTED'],
      SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['LOCKED', 'CANCELLED'],
      LOCKED: ['APPROVED'],
      REJECTED: ['DRAFT'],
      CANCELLED: ['DRAFT'],
    };
    return [current, ...(map[current] ?? [])];
  };

  const getApproverDisabledReason = (status: TaskData['status'] | undefined) => {
    const current = status ?? 'DRAFT';
    if (APPROVER_QUICK_EDITABLE_STATUSES.includes(current)) return null;
    return 'Approver can only be changed in DRAFT or SUBMITTED status.';
  };

  const bulkAllowedStatusOptions = useMemo(() => {
    if (!bulkMode || selectedIds.length === 0) return STATUS_OPTIONS;
    const selectedTasks = tasks.filter((task) => task.id && selectedIds.includes(task.id));
    if (selectedTasks.length === 0) return [];

    const optionSets = selectedTasks.map((task) => new Set(getAllowedStatusOptions(task.status)));
    const [first, ...rest] = optionSets;
    const intersection = Array.from(first).filter((status) =>
      rest.every((set) => set.has(status))
    );
    return intersection;
  }, [bulkMode, selectedIds, tasks]);

  const bulkStatusDisabledReason = useMemo(() => {
    if (!bulkMode || selectedIds.length === 0) return null;
    if (bulkAllowedStatusOptions.length > 0) return null;
    return 'Selected tasks do not share a valid status transition. Refine your selection.';
  }, [bulkAllowedStatusOptions.length, bulkMode, selectedIds.length]);

  const openDuePicker = (task: TaskData) => {
    if (!task.id) return;
    setOpenPriorityTaskId(null);
    setOpenStartPickerTaskId(null);
    setOpenDuePickerTaskId(task.id);
    setDueDraftByTaskId((prev) => ({
      ...prev,
      [task.id as number]: task.due_date ?? '',
    }));
  };

  const openStartPicker = (task: TaskData) => {
    if (!task.id) return;
    setOpenPriorityTaskId(null);
    setOpenDuePickerTaskId(null);
    setOpenStartPickerTaskId(task.id);
    setStartDraftByTaskId((prev) => ({
      ...prev,
      [task.id as number]: task.start_date ?? '',
    }));
  };

  const commitDueDate = async (task: TaskData, nextValue: string | null) => {
    const nextDue = nextValue || undefined;
    if (violatesStartBeforeDue(task.start_date ?? null, nextDue ?? null)) {
      toast.error(START_MUST_BE_ON_OR_BEFORE_DUE);
      return;
    }
    const ok = await updateSingleTask(
      task,
      { due_date: nextDue },
      { due_date: nextValue },
      'Failed to update due date'
    );
    if (ok) {
      toast.success(nextValue ? 'Due date updated' : 'Due date cleared');
      setOpenDuePickerTaskId(null);
    }
  };

  const commitStartDate = async (task: TaskData, nextValue: string | null) => {
    const nextStart = nextValue || null;
    if (violatesStartBeforeDue(nextStart, task.due_date ?? null)) {
      toast.error(START_MUST_BE_ON_OR_BEFORE_DUE);
      return;
    }
    const ok = await updateSingleTask(
      task,
      { start_date: nextStart },
      { start_date: nextValue },
      'Failed to update start date'
    );
    if (ok) {
      toast.success(nextValue ? 'Start date updated' : 'Start date cleared');
      setOpenStartPickerTaskId(null);
    }
  };

  const updatePriority = async (task: TaskData, next: string) => {
    if (!task.id || task.priority === next) {
      setOpenPriorityTaskId(null);
      return;
    }
    const ok = await updateSingleTask(
      task,
      { priority: next },
      { priority: next },
      'Failed to update priority'
    );
    if (ok) {
      toast.success('Priority updated');
      setOpenPriorityTaskId(null);
    }
  };

  const getDueDateTone = (dueDate?: string | null) => {
    if (!dueDate) return 'text-gray-700';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${dueDate}T00:00:00`);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((due.getTime() - today.getTime()) / msPerDay);
    if (diffDays < 0) return 'text-rose-600';
    if (diffDays <= 3) return 'text-amber-600';
    return 'text-gray-700';
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  };

  const currentPageIds = useMemo(
    () => paginatedVisible.map((task) => task.id).filter(Boolean) as number[],
    [paginatedVisible]
  );
  const isCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));

  return (
    <div className="min-w-0">
      <TaskListRowContextMenu
        state={rowMenu}
        menuMembers={menuMembers}
        menuMembersLoading={menuMembersLoading}
        onRequestClose={closeRowMenu}
        onOpenDetail={handleOpenDetail}
        onTaskDeleted={handleTaskDeleted}
        onTaskPatched={handleTaskPatched}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search summary, type or owner…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#3CCED7] focus:ring-2 focus:ring-[#3CCED7]/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setBulkMode((v) => !v)}
          className={`shrink-0 inline-flex h-9 items-center rounded-xl border px-3.5 text-xs font-semibold transition ${bulkMode
              ? 'border-[#2fc6d6] bg-white text-[#2fc6d6] shadow-sm hover:bg-[#2fc6d6]/5'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
        >
          {bulkMode ? 'Exit Bulk edit' : 'Bulk edit'}
        </button>
      </div>

      {bulkMode && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="text-xs text-gray-500">
            Bulk edit is active. Select tasks to apply bulk actions or send them to Linear.
          </div>
          <div
            className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white"
            role="group"
            aria-label="Linear bulk actions"
          >
            <button
              type="button"
              disabled={!projectId}
              title={
                !projectId
                  ? 'Select a project in the sidebar first'
                  : 'Import Linear issues as tasks in this project'
              }
              onClick={onOpenLinearImport}
              className="inline-flex h-8 items-center gap-1.5 border-r border-gray-200 px-2.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 text-[#5E6AD2]" aria-hidden />
              Import from Linear
            </button>
            <button
              type="button"
              disabled={!projectId || selectedIds.length === 0}
              title={
                !projectId
                  ? 'Select a project in the sidebar first'
                  : selectedIds.length === 0
                    ? 'Select one or more tasks first'
                    : 'Push selected tasks to Linear'
              }
              onClick={openLinearOutput}
              className="inline-flex h-8 items-center gap-1.5 bg-[#5E6AD2]/10 px-2.5 text-xs font-semibold text-[#4a55b8] transition hover:bg-[#5E6AD2]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowUpToLine className="h-3.5 w-3.5 shrink-0 text-[#5E6AD2]" aria-hidden />
              Output to Linear
            </button>
          </div>
        </div>
      )}

      {bulkMode && selectedIds.length > 0 && (
        <BulkActionToolbar
          selectedCount={selectedIds.length}
          memberOptions={memberOptions}
          statusOptions={bulkAllowedStatusOptions}
          statusDisabledReason={bulkStatusDisabledReason}
          loading={bulkBusy}
          onApply={applyBulkField}
          onClearSelection={() => setSelectedIds([])}
        />
      )}
      {bulkFailures.length > 0 && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3">
          <div className="mb-1 text-xs font-semibold text-rose-700">
            Bulk update failed ({bulkFailures.length})
          </div>
          <div className="space-y-1 text-xs text-rose-700">
            {bulkFailures.slice(0, 4).map((item, index) => (
              <div key={`${item.task_id ?? 'na'}-${index}`}>
                Task {item.task_id ?? 'N/A'}: {item.reason}
              </div>
            ))}
            {bulkFailures.length > 4 && (
              <div className="text-rose-600">+{bulkFailures.length - 4} more</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBulkFailures([])}
            className="mt-2 text-xs font-medium text-rose-700 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {error ? (
          <div className="px-6 py-12 text-center text-sm text-rose-600">{error}</div>
        ) : !loading && visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-900">No tasks yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Click <span className="font-medium text-gray-700">Create task</span> to add the first one.
            </p>
          </div>
        ) : (
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className={TABLE_COLUMN_WIDTHS.icon} />
              {bulkMode ? <col className={TABLE_COLUMN_WIDTHS.select} /> : null}
              <col />
              <col className={TABLE_COLUMN_WIDTHS.type} />
              <col className={TABLE_COLUMN_WIDTHS.status} />
              <col className={TABLE_COLUMN_WIDTHS.owner} />
              <col className={TABLE_COLUMN_WIDTHS.approver} />
              <col className={TABLE_COLUMN_WIDTHS.start} />
              <col className={TABLE_COLUMN_WIDTHS.due} />
            </colgroup>
            <thead className="border-b border-gray-100 bg-gray-50/60 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              <tr>
                <th className={`${TABLE_COLUMN_WIDTHS.icon} px-4 py-2.5 text-left`}></th>
                {bulkMode ? (
                  <th className={`${TABLE_COLUMN_WIDTHS.select} px-2 py-2.5 text-left`}>
                    <input
                      type="checkbox"
                      checked={isCurrentPageSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-gray-900 focus:ring-gray-300"
                    />
                  </th>
                ) : null}
                <th className="px-4 py-2.5 text-left">Summary</th>
                <th className={`${TABLE_COLUMN_WIDTHS.type} px-4 py-2.5 text-left`}>Type</th>
                <th className={`${TABLE_COLUMN_WIDTHS.status} px-4 py-2.5 text-left`}>Status</th>
                <th className={`${TABLE_COLUMN_WIDTHS.owner} px-4 py-2.5 text-left`}>Owner</th>
                <th className={`${TABLE_COLUMN_WIDTHS.approver} px-4 py-2.5 text-left`}>Approver</th>
                <th className={`${TABLE_COLUMN_WIDTHS.start} px-4 py-2.5 text-left`}>Start</th>
                <th className={`${TABLE_COLUMN_WIDTHS.due} px-5 py-2.5 text-left`}>Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {(loading ? Array.from({ length: 6 }, () => undefined) : paginatedVisible).map((task, index) => {
                if (loading) {
                  return (
                    <tr key={`tasks-list-skeleton-${index}`}>
                      <td className={`${TABLE_COLUMN_WIDTHS.icon} px-4 py-3`}>
                        <Skeleton className="h-2 w-2 rounded-full" />
                      </td>
                      {bulkMode ? (
                        <td className={`${TABLE_COLUMN_WIDTHS.select} px-2 py-3`}>
                          <Skeleton className="h-4 w-4 rounded-sm" />
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <div className="min-w-0 max-w-[32rem] space-y-2">
                          <Skeleton className="h-4 w-full max-w-[22rem]" />
                          <Skeleton className="h-3 w-full max-w-[32rem]" />
                        </div>
                      </td>
                      <td className={`${TABLE_COLUMN_WIDTHS.type} px-4 py-3`}>
                        <Skeleton className="h-3 w-16" />
                      </td>
                      <td className={`${TABLE_COLUMN_WIDTHS.status} px-4 py-3`}>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className={`${TABLE_COLUMN_WIDTHS.owner} px-4 py-3`}>
                        <Skeleton className="h-3 w-16" />
                      </td>
                      <td className={`${TABLE_COLUMN_WIDTHS.approver} px-4 py-3`}>
                        <Skeleton className="h-3 w-16" />
                      </td>
                      <td className={`${TABLE_COLUMN_WIDTHS.start} px-4 py-3`}>
                        <Skeleton className="h-3 w-14" />
                      </td>
                      <td className={`${TABLE_COLUMN_WIDTHS.due} px-5 py-3`}>
                        <div className="flex justify-start">
                          <Skeleton className="h-3 w-14" />
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (!task) {
                  return null;
                }

                const priority = task.priority ?? 'MEDIUM';
                const status = task.status ?? 'DRAFT';
                const statusMeta = STATUS_META[status] ?? STATUS_META.DRAFT;
                const isSaving = !!task.id && savingIds.includes(task.id);
                const isSelected = !!task.id && selectedIds.includes(task.id);
                const openPriorityUpward = index >= Math.max(paginatedVisible.length - 3, 0);
                const openOverlayUpward = index >= Math.max(paginatedVisible.length - 3, 0);
                return (
                  <tr
                    key={task.id}
                    className="cursor-pointer transition hover:bg-gray-50/80"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    <td className={`${TABLE_COLUMN_WIDTHS.icon} align-middle px-4 py-1.5`}>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDuePickerTaskId(null);
                            setOpenPriorityTaskId((prev) => (prev === task.id ? null : task.id ?? null));
                          }}
                          className={`inline-block h-2.5 w-2.5 rounded-full ${PRIORITY_META[priority]?.dot ?? 'bg-gray-300'} ring-2 ring-white transition hover:scale-110`}
                          title={`Priority: ${PRIORITY_META[priority]?.label ?? priority}`}
                        />
                        {openPriorityTaskId === task.id ? (
                          <div
                            className={`absolute left-0 z-20 min-w-[136px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg ${openPriorityUpward ? 'bottom-5' : 'top-5'
                              }`}
                          >
                            {PRIORITY_OPTIONS.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void updatePriority(task, opt);
                                }}
                                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${opt === priority ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                                  }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${PRIORITY_META[opt]?.dot ?? 'bg-gray-300'}`} />
                                <span>{PRIORITY_META[opt]?.label ?? opt}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    {bulkMode ? (
                      <td
                        className={`${TABLE_COLUMN_WIDTHS.select} align-middle px-2 py-1.5`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!!task.id && selectedIds.includes(task.id)}
                          onChange={(e) => task.id && toggleSelection(task.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 accent-gray-900 focus:ring-gray-300"
                        />
                      </td>
                    ) : null}
                    <td className="align-middle px-4 py-1.5">
                      <div className="min-w-0">
                        {editingSummaryId === task.id ? (
                          <input
                            autoFocus
                            value={summaryDraft}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setSummaryDraft(e.target.value)}
                            onBlur={() => {
                              void commitSummaryEdit(task);
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Escape') {
                                setEditingSummaryId(null);
                                return;
                              }
                              if (e.key !== 'Enter') return;
                              await commitSummaryEdit(task);
                            }}
                            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-[#3CCED7] focus:ring-2 focus:ring-[#3CCED7]/20"
                          />
                        ) : (
                          <div className="group relative flex w-full items-center gap-2 text-left">
                            <span
                              data-summary-id={task.id}
                              className="block w-full truncate text-sm font-medium leading-5 text-gray-900"
                            >
                              {task.summary || `Task #${task.id}`}
                            </span>
                            {task.id && truncatedSummaryIds.includes(task.id) ? (
                              <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-[24rem] rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700 shadow-lg group-hover:block">
                                <div className="mb-1 font-semibold text-gray-900">{task.summary || `Task #${task.id}`}</div>
                                {task.description ? (
                                  <div className="line-clamp-3 text-gray-600">{task.description}</div>
                                ) : (
                                  <div className="text-gray-500">No description</div>
                                )}
                                <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                                  {TYPE_LABEL[task.type] ?? task.type ?? 'Task'}
                                </div>
                              </div>
                            ) : null}
                            {isSaving ? (
                              <span className="text-[10px] text-gray-400">Saving…</span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSummaryId(task.id ?? null);
                                  setSummaryDraft(task.summary || '');
                                }}
                                className="hidden h-6 items-center px-1 text-[10px] font-medium text-gray-400 transition-colors hover:text-gray-600 group-hover:inline-flex"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                        {task.description?.trim() ? (
                          <div className="mt-0.5 line-clamp-2 text-xs font-medium text-gray-600">
                            {task.description.trim()}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${TABLE_COLUMN_WIDTHS.type} align-middle px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500`}>
                      {TYPE_LABEL[task.type] ?? task.type ?? '—'}
                    </td>
                    <td className={`${TABLE_COLUMN_WIDTHS.status} align-middle px-4 py-1.5`}>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenOwnerTaskId(null);
                            setOpenApproverTaskId(null);
                            setOpenDuePickerTaskId(null);
                            setOpenStartPickerTaskId(null);
                            setOpenStatusTaskId((prev) => (prev === task.id ? null : task.id ?? null));
                          }}
                          className={`inline-flex h-8 w-full items-center rounded-[6px] border border-transparent px-3 text-xs font-medium ${statusMeta.classes} outline-none transition hover:ring-1 hover:ring-gray-200`}
                        >
                          <span className="truncate">{STATUS_META[status]?.label ?? status}</span>
                        </button>
                        {openStatusTaskId === task.id ? (
                          <div
                            className={`absolute left-0 z-20 min-w-[148px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg ${openOverlayUpward ? 'bottom-10' : 'top-10'
                              }`}
                          >
                            {getAllowedStatusOptions(task.status).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  setOpenStatusTaskId(null);
                                  void updateTaskStatus(task, opt);
                                }}
                                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              >
                                <span className="inline-flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[opt] ?? 'bg-gray-300'}`} />
                                  <span>{STATUS_META[opt]?.label ?? opt}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={`${TABLE_COLUMN_WIDTHS.owner} align-middle px-4 py-1.5 text-xs text-gray-600`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenStatusTaskId(null);
                            setOpenApproverTaskId(null);
                            setOpenDuePickerTaskId(null);
                            setOpenStartPickerTaskId(null);
                            setOpenOwnerTaskId((prev) => (prev === task.id ? null : task.id ?? null));
                          }}
                          className="inline-flex h-8 w-full items-center justify-start truncate rounded-md border border-transparent px-1 text-left text-xs text-gray-700 transition hover:border-[#2fc6d6]/70 hover:bg-[#2fc6d6]/5 hover:px-3"
                        >
                          {task.owner?.username || task.owner?.email || '—'}
                        </button>
                        {openOwnerTaskId === task.id ? (
                          <div
                            className={`absolute left-0 z-20 min-w-[168px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg ${openOverlayUpward ? 'bottom-10' : 'top-10'
                              }`}
                          >
                            {memberOptions.map((member) => (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => {
                                  if (!task.id || task.owner?.id === member.id) {
                                    setOpenOwnerTaskId(null);
                                    return;
                                  }
                                  setOpenOwnerTaskId(null);
                                  void (async () => {
                                    const ok = await updateSingleTask(
                                      task,
                                      {
                                        owner_id: member.id,
                                        owner: { id: member.id, username: member.label, email: '' },
                                      },
                                      { owner_id: member.id },
                                      'Failed to update owner'
                                    );
                                    if (ok) toast.success('Owner updated');
                                  })();
                                }}
                                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              >
                                {member.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={`${TABLE_COLUMN_WIDTHS.approver} align-middle px-4 py-1.5 text-xs text-gray-600`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        const disabledReason = getApproverDisabledReason(task.status);
                        const isDisabled = Boolean(disabledReason);
                        return (
                          <div className="group relative">
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenStatusTaskId(null);
                                setOpenOwnerTaskId(null);
                                setOpenDuePickerTaskId(null);
                                setOpenStartPickerTaskId(null);
                                setOpenApproverTaskId((prev) => (prev === task.id ? null : task.id ?? null));
                              }}
                              className={`inline-flex h-8 w-full items-center justify-start truncate rounded-md border border-transparent px-1 text-left text-xs transition ${isDisabled
                                  ? 'cursor-default text-gray-500'
                                  : 'text-gray-700 hover:border-[#2fc6d6]/70 hover:bg-[#2fc6d6]/5 hover:px-3'
                                }`}
                            >
                              {task.current_approver?.username || task.current_approver?.email || '—'}
                            </button>
                            {!isDisabled && openApproverTaskId === task.id ? (
                              <div
                                className={`absolute left-0 z-20 min-w-[168px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg ${openOverlayUpward ? 'bottom-10' : 'top-10'
                                  }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenApproverTaskId(null);
                                    if (!task.id || !task.current_approver?.id) return;
                                    void (async () => {
                                      const ok = await updateSingleTask(
                                        task,
                                        { current_approver_id: undefined, current_approver: undefined },
                                        { current_approver_id: null },
                                        'Failed to update approver'
                                      );
                                      if (ok) toast.success('Approver updated');
                                    })();
                                  }}
                                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  —
                                </button>
                                {memberOptions.map((member) => (
                                  <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => {
                                      setOpenApproverTaskId(null);
                                      if (!task.id || task.current_approver?.id === member.id) return;
                                      void (async () => {
                                        const ok = await updateSingleTask(
                                          task,
                                          {
                                            current_approver_id: member.id,
                                            current_approver: { id: member.id, username: member.label, email: '' },
                                          },
                                          { current_approver_id: member.id },
                                          'Failed to update approver'
                                        );
                                        if (ok) toast.success('Approver updated');
                                      })();
                                    }}
                                    className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                  >
                                    {member.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {isDisabled && disabledReason ? (
                              <div
                                className={`pointer-events-none absolute left-0 z-20 hidden w-56 rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-700 shadow-lg group-hover:block ${openOverlayUpward ? 'bottom-9' : 'top-9'
                                  }`}
                              >
                                {disabledReason}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td
                      className={`${TABLE_COLUMN_WIDTHS.start} relative align-middle px-3 py-1.5 text-left text-xs tabular-nums text-gray-500`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenStatusTaskId(null);
                          setOpenOwnerTaskId(null);
                          setOpenApproverTaskId(null);
                          openStartPicker(task);
                        }}
                        className="inline-flex h-7 w-full items-center justify-start rounded-md border border-transparent px-2 text-left text-xs tabular-nums text-gray-700 transition hover:border-[#2fc6d6]/70 hover:bg-[#2fc6d6]/5"
                      >
                        {task.start_date ? formatDateShort(task.start_date) : '—'}
                      </button>
                      {openStartPickerTaskId === task.id ? (
                        <div
                          className={`absolute right-0 z-20 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${index >= Math.max(paginatedVisible.length - 3, 0) ? 'bottom-11' : 'top-11'}`}
                        >
                          <input
                            type="date"
                            lang="en-GB"
                            value={startDraftByTaskId[task.id ?? -1] ?? ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setStartDraftByTaskId((prev) => ({
                                ...prev,
                                [task.id as number]: e.target.value,
                              }))
                            }
                            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-[#3CCED7] focus:ring-2 focus:ring-[#3CCED7]/20"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const val = startDraftByTaskId[task.id ?? -1] || null;
                                void commitStartDate(task, val);
                              }}
                              className="h-8 min-w-0 flex-1 rounded-lg bg-gradient-to-r from-[#7ee3e8] to-[#b9ee98] px-2 text-[11px] font-medium text-white shadow-sm transition hover:brightness-95"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => void commitStartDate(task, null)}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenStartPickerTaskId(null)}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={`${TABLE_COLUMN_WIDTHS.due} relative align-middle px-3 py-1.5 text-left text-xs tabular-nums text-gray-500`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenStatusTaskId(null);
                          setOpenOwnerTaskId(null);
                          setOpenApproverTaskId(null);
                          openDuePicker(task);
                        }}
                        className={`inline-flex h-7 w-full items-center justify-start rounded-md border border-transparent px-2 text-left text-xs tabular-nums transition hover:border-[#2fc6d6]/70 hover:bg-[#2fc6d6]/5 ${getDueDateTone(task.due_date)}`}
                      >
                        {task.due_date ? formatDateShort(task.due_date) : '—'}
                      </button>
                      {openDuePickerTaskId === task.id ? (
                        <div
                          className={`absolute right-0 z-20 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${index >= Math.max(paginatedVisible.length - 3, 0) ? 'bottom-11' : 'top-11'
                            }`}
                        >
                          <input
                            type="date"
                            lang="en-GB"
                            value={dueDraftByTaskId[task.id ?? -1] ?? ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setDueDraftByTaskId((prev) => ({
                                ...prev,
                                [task.id as number]: e.target.value,
                              }))
                            }
                            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-[#3CCED7] focus:ring-2 focus:ring-[#3CCED7]/20"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const val = dueDraftByTaskId[task.id ?? -1] || null;
                                void commitDueDate(task, val);
                              }}
                              className="h-8 min-w-0 flex-1 rounded-lg bg-gradient-to-r from-[#7ee3e8] to-[#b9ee98] px-2 text-[11px] font-medium text-white shadow-sm transition hover:brightness-95"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => void commitDueDate(task, null)}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenDuePickerTaskId(null)}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !error && visible.length > LIST_PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5 text-xs text-gray-600">
            <span className="text-gray-400">
              {pageStart}–{pageEnd} of {visible.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(safeCurrentPage - 1)}
                disabled={safeCurrentPage <= 1}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                Prev
              </button>
              <span className="text-gray-500">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(safeCurrentPage + 1)}
                disabled={safeCurrentPage >= totalPages}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <LinearBulkOutputModal
        isOpen={linearBulkOpen}
        onClose={() => setLinearBulkOpen(false)}
        taskIds={selectedIds}
        tasks={tasks}
        onComplete={() => {
          void onLinearBulkSynced?.();
        }}
      />
    </div>
  );
}
