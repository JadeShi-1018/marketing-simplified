'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import type { TaskData } from '@/types/task';
import { TASK_TYPES } from './TYPE_META';
import TaskCardMini from './TaskCardMini';
import { Skeleton } from '@/components/ui/skeleton';

interface BoardViewProps {
  tasks: TaskData[];
  loading: boolean;
  error: string | null;
}

export default function BoardView({ tasks, loading, error }: BoardViewProps) {
  const router = useRouter();
  const [tagSearch, setTagSearch] = useState('');

  const filteredTasks = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) =>
      (task.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q))
    );
  }, [tasks, tagSearch]);

  const grouped = useMemo(() => {
    const map: Record<string, TaskData[]> = {};
    for (const t of TASK_TYPES) map[t.value] = [];
    for (const task of filteredTasks) {
      if (map[task.type]) map[task.type].push(task);
    }
    return map;
  }, [filteredTasks]);

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 p-6 text-sm text-rose-600 ring-1 ring-rose-100">
        {error}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Search by tag…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#3CCED7] focus:ring-2 focus:ring-[#3CCED7]/20"
          />
        </div>
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-full gap-4">
          {TASK_TYPES.map((meta) => {
            const tasksInColumn = grouped[meta.value] ?? [];
            return (
              <div
                key={meta.value}
                className="flex w-[280px] flex-shrink-0 flex-col gap-2 rounded-xl bg-gray-50 p-3"
              >
                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: meta.hex }}
                    />
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                      {meta.label}
                    </h3>
                  </div>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">
                    {tasksInColumn.length}
                  </span>
                </header>

                <div className="flex flex-col gap-2">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`${meta.value}-skeleton-${index}`}
                        className="rounded-md bg-white p-3 shadow-sm ring-1 ring-gray-100"
                      >
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-36" />
                          <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : tasksInColumn.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-200 bg-white/40 px-3 py-4 text-center text-[11px] text-gray-400">
                      No {meta.shortLabel.toLowerCase()} tasks
                    </div>
                  ) : (
                    tasksInColumn.map((task) => (
                      <TaskCardMini key={task.id} task={task} columnAccentHex={meta.hex} />
                    ))
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/tasks/new?type=${meta.value}`)}
                    className="mt-1 inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-400 transition hover:border-[#3CCED7] hover:text-[#3CCED7]"
                  >
                    <Plus className="h-3 w-3" />
                    {loading ? 'Preparing…' : 'Create'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
