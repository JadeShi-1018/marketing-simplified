'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { TaskAPI } from '@/lib/api/taskApi';
import { ProjectAPI, type ProjectMemberData } from '@/lib/api/projectApi';
import type { TaskData } from '@/types/task';

import TaskDetailHeader from '@/components/tasks/detail/TaskDetailHeader';
import TaskDescriptionBlock from '@/components/tasks/detail/TaskDescriptionBlock';
import TaskTypeBlock from '@/components/tasks/detail/TaskTypeBlock';
import TaskSubtasksBlock from '@/components/tasks/detail/TaskSubtasksBlock';
import TaskRelationsBlock from '@/components/tasks/detail/TaskRelationsBlock';
import TaskAttachmentsBlock from '@/components/tasks/detail/TaskAttachmentsBlock';
import TaskActivityBlock from '@/components/tasks/detail/TaskActivityBlock';
import PropertiesPanel from '@/components/tasks/detail/PropertiesPanel';

interface TaskDrawerProps {
  taskId: number | null;
  onClose: () => void;
  onTaskUpdate?: () => void;
}

export default function TaskDrawer({ taskId, onClose, onTaskUpdate }: TaskDrawerProps) {
  const router = useRouter();

  const [task, setTask] = useState<TaskData | null>(null);
  const [members, setMembers] = useState<ProjectMemberData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [visible, setVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // Animate in when taskId becomes non-null
  useEffect(() => {
    if (taskId !== null) {
      // Small timeout to allow DOM to mount before triggering transition
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
    }
  }, [taskId]);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await TaskAPI.getTask(taskId);
      setTask(resp.data as TaskData);
    } catch (e) {
      setError((e as any)?.response?.data?.detail || 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId === null) {
      setTask(null);
      setMembers([]);
      setError(null);
      return;
    }
    void load();
  }, [taskId, load]);

  useEffect(() => {
    const pid = task?.project?.id ?? task?.project_id;
    if (!pid) return;
    let cancelled = false;
    ProjectAPI.getProjectMembers(pid)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [task?.project?.id, task?.project_id]);

  const onMutated = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    await load();
    onTaskUpdate?.();
  }, [load, onTaskUpdate]);

  // Escape key handler
  useEffect(() => {
    if (taskId === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [taskId, onClose]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (taskId !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [taskId]);

  if (taskId === null) return null;

  const readOnly = task?.status === 'LOCKED';
  const taskShell = (task ?? {
    id: taskId ?? undefined,
    summary: '',
    description: '',
    status: 'DRAFT',
    type: 'task',
    project: null,
    project_id: null,
    owner: null,
    current_approver: null,
    linked_object: null,
    start_date: null,
    due_date: null,
  }) as TaskData;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        data-testid="task-drawer-backdrop"
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        ref={panelRef}
        data-testid="task-drawer"
        className={`absolute right-0 top-0 h-full w-full max-w-[600px] overflow-y-auto bg-gray-50 shadow-2xl transition-transform duration-300 ease-in-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <span className="text-xs font-medium text-gray-500">Task #{taskId}</span>
          <div className="flex items-center gap-1">
            <a
              href={`/tasks/${taskId}`}
              data-testid="task-drawer-open-full"
              onClick={(e) => {
                e.preventDefault();
                router.push(`/tasks/${taskId}`);
              }}
              title="Open full page"
              aria-label="Open full page"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              data-testid="task-drawer-close"
              onClick={onClose}
              title="Close drawer"
              aria-label="Close drawer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Drawer body */}
        <div className="px-4 py-4 space-y-4">
          {error && !loading && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
          )}

          {(!error || loading) && (
            <>
              <TaskDetailHeader
                task={taskShell}
                members={members}
                readOnly={Boolean(readOnly)}
                onUpdated={onMutated}
                onMutated={onMutated}
                onDelete={async () => {
                  if (!task?.id) return;
                  try {
                    await TaskAPI.deleteTask(task.id);
                    onTaskUpdate?.();
                    onClose();
                  } catch (e) {
                    toast.error((e as any)?.response?.data?.detail || 'Delete failed');
                  }
                }}
                loading={loading}
                isDrawer
              />

              <div className="space-y-4">
                <TaskDescriptionBlock
                  task={taskShell}
                  readOnly={Boolean(readOnly)}
                  onUpdated={onMutated}
                  loading={loading}
                />
                <TaskTypeBlock
                  task={taskShell}
                  loading={loading}
                  readOnly={Boolean(readOnly)}
                  onUpdated={onMutated}
                />
                <TaskSubtasksBlock
                  task={taskShell}
                  readOnly={Boolean(readOnly)}
                  refreshKey={refreshKey}
                  loading={loading}
                />
                <TaskRelationsBlock
                  task={taskShell}
                  readOnly={Boolean(readOnly)}
                  loading={loading}
                />
                {(task?.id || loading) && (
                  <TaskAttachmentsBlock
                    taskId={task?.id ?? 0}
                    readOnly={Boolean(readOnly)}
                    loading={loading}
                  />
                )}
                <PropertiesPanel
                  task={taskShell}
                  members={members}
                  readOnly={Boolean(readOnly)}
                  onUpdated={onMutated}
                  loading={loading}
                />
                {(task?.id || loading) && (
                  <TaskActivityBlock
                    taskId={task?.id ?? 0}
                    readOnly={Boolean(readOnly)}
                    refreshKey={refreshKey}
                    loading={loading}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
