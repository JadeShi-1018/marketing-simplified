'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import InlineSelect, { type InlineSelectOption } from '@/components/tasks/detail/InlineSelect';
import { TaskAPI, parseTaskHierarchyApiError } from '@/lib/api/taskApi';
import type { TaskData } from '@/types/task';
import { getTaskParentId, getTaskParentSlug, getTaskParentSummary } from '@/types/task';

interface Props {
  task: TaskData;
  readOnly?: boolean;
  disabled?: boolean;
  onUpdated: () => void | Promise<void>;
}

function parentOption(task: TaskData): InlineSelectOption {
  return {
    value: String(task.id),
    label: task.summary || `Task ${task.id}`,
    sub: task.type ? task.type.replace(/_/g, ' ') : undefined,
  };
}

function parentFromRelationship(task: TaskData): TaskData | null {
  const parentId = getTaskParentId(task);
  if (parentId == null) return null;
  const slug = getTaskParentSlug(task);
  const summary = getTaskParentSummary(task);
  return {
    id: parentId,
    slug: slug ?? undefined,
    summary: summary ?? `Task ${parentId}`,
    type: 'asset',
    project_id: task.project_id,
  };
}

export function mergeParentCandidates(...groups: TaskData[][]): TaskData[] {
  const byId = new Map<number, TaskData>();
  for (const group of groups) {
    for (const row of group) {
      if (row.id != null && !byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
  }
  return Array.from(byId.values());
}

export function rememberParent(
  parents: TaskData[],
  parent: TaskData | null | undefined,
): TaskData[] {
  if (parent?.id == null) return parents;
  if (parents.some((row) => row.id === parent.id)) return parents;
  return [...parents, parent];
}

export default function TaskParentPicker({
  task,
  readOnly = false,
  disabled = false,
  onUpdated,
}: Props) {
  const taskId = task.id;
  const currentParentId = getTaskParentId(task);
  const currentParentSlug = getTaskParentSlug(task);
  const [parentId, setParentId] = useState(
    () => (currentParentId != null ? String(currentParentId) : ''),
  );
  const [candidates, setCandidates] = useState<TaskData[]>(() => {
    const seed = parentFromRelationship(task);
    return seed ? [seed] : [];
  });
  /** Previously selected parents stay selectable after reassign (e.g. switch back). */
  const [retainedParents, setRetainedParents] = useState<TaskData[]>(() => {
    const seed = parentFromRelationship(task);
    return seed ? [seed] : [];
  });
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    setParentId(currentParentId != null ? String(currentParentId) : '');
    setInlineError(null);
    const seed = parentFromRelationship(task);
    setCandidates(seed ? [seed] : []);
    if (seed) {
      setRetainedParents((prev) => rememberParent(prev, seed));
    }
  }, [taskId, currentParentId, task.parent_relationship]);

  useEffect(() => {
    setRetainedParents([]);
  }, [taskId]);

  const loadCandidates = useCallback(async () => {
    if (!taskId) return;
    const projectId = task.project?.id ?? task.project_id ?? task.project?.slug;
    if (projectId == null || projectId === '') return;

    const relationshipParent = parentFromRelationship(task);
    setLoadingCandidates(true);
    try {
      const fromApi: TaskData[] = [];

      const rows = await TaskAPI.getAllTasks({
        project_id: projectId,
        has_parent: false,
      });
      for (const row of rows) {
        if (row.id == null || String(row.id) === String(taskId)) {
          continue;
        }
        fromApi.push(row);
      }

      const eligible = mergeParentCandidates(
        retainedParents,
        relationshipParent ? [relationshipParent] : [],
        fromApi,
      );

      if (
        currentParentId != null &&
        !eligible.some((row) => row.id === currentParentId)
      ) {
        const lookupKey = currentParentSlug ?? null;
        if (lookupKey) {
          try {
            const parentResponse = await TaskAPI.getTask(lookupKey);
            const parentTask = parentResponse.data as TaskData;
            if (parentTask?.id != null) {
              eligible.unshift(parentTask);
            }
          } catch {
            // Keep relationship seed if direct fetch fails.
          }
        }
      }

      setCandidates(mergeParentCandidates(eligible));
    } catch {
      toast.error('Failed to load parent task options.');
      setCandidates(
        mergeParentCandidates(
          retainedParents,
          relationshipParent ? [relationshipParent] : [],
        ),
      );
    } finally {
      setLoadingCandidates(false);
    }
  }, [
    taskId,
    task.project,
    task.project_id,
    task.parent_relationship,
    currentParentId,
    currentParentSlug,
    retainedParents,
  ]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const options = useMemo(
    () => candidates.map((row) => parentOption(row)),
    [candidates],
  );

  const handleParentChange = async (nextParentId: string) => {
    if (!taskId || readOnly || disabled || saving) return;
    if (nextParentId === parentId) return;
    if (currentParentId == null) {
      toast.error('Current parent is unknown; refresh the page and try again.');
      return;
    }

    const newParent = candidates.find((row) => String(row.id) === nextParentId);
    if (!newParent?.id) {
      toast.error('Selected parent task was not found.');
      return;
    }

    const oldParent = candidates.find((row) => row.id === currentParentId);

    setSaving(true);
    setInlineError(null);
    try {
      await TaskAPI.moveSubtask(
        newParent.slug ?? newParent.id,
        task.slug ?? taskId,
        { old_parent_id: currentParentId },
      );
      if (oldParent) {
        setRetainedParents((prev) => rememberParent(prev, oldParent));
      }
      setParentId(nextParentId);
      await onUpdated();
    } catch (error) {
      const parsed = parseTaskHierarchyApiError(error);
      if (parsed.isHierarchyCycle) {
        setInlineError(parsed.message);
      } else {
        toast.error(parsed.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!task.is_subtask) {
    return null;
  }

  const hasSelectedOption =
    parentId !== '' && options.some((option) => option.value === parentId);

  const pickerDisabled =
    readOnly ||
    disabled ||
    saving ||
    currentParentId == null ||
    (loadingCandidates && !hasSelectedOption);

  return (
    <div className="min-w-0" data-testid="task-parent-picker">
      <InlineSelect
        ariaLabel="Parent task"
        value={parentId}
        onValueChange={(value) => { void handleParentChange(value); }}
        options={options}
        disabled={pickerDisabled || (options.length === 0 && !hasSelectedOption)}
        placeholder={loadingCandidates ? 'Loading parents…' : 'Select parent…'}
      />
      {inlineError ? (
        <p
          className="mt-1 text-xs text-rose-600"
          role="alert"
          data-testid="task-parent-picker-error"
        >
          {inlineError}
        </p>
      ) : null}
    </div>
  );
}
