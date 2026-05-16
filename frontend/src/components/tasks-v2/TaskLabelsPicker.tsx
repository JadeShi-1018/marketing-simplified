'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Plus, Tag, X } from 'lucide-react';

import type { TaskTag } from '@/types/task';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Preset colors — must stay in sync with backend `TASK_TAG_ALLOWED_HEX_COLORS`. */
export const TASK_LABEL_PRESET_COLORS = [
  '#5E6AD2',
  '#26B5CE',
  '#4CB782',
  '#F2C94C',
  '#F2994A',
  '#EB5757',
  '#9B51E0',
  '#6B7280',
] as const;

const PRESET_COLOR_SET = new Set<string>(TASK_LABEL_PRESET_COLORS);
const TASK_TAG_MAX_COUNT = 10;
const TASK_TAG_MAX_NAME_LENGTH = 15;

const STORAGE_PREFIX = 'marketing-simplified:task-tag-catalog:';

function tagKey(name: string): string {
  return name.trim().toLowerCase();
}

function loadCatalog(projectId: number): TaskTag[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is TaskTag =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as TaskTag).name === 'string' &&
          typeof (item as TaskTag).color === 'string',
      )
      .map((t) => ({ name: t.name.trim(), color: t.color.trim().toUpperCase() }))
      .filter((t) => t.name.length > 0 && PRESET_COLOR_SET.has(t.color));
  } catch {
    return [];
  }
}

function saveCatalog(projectId: number, catalog: TaskTag[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(catalog));
  } catch {
    // Ignore quota / privacy mode
  }
}

type TaskTagColor = (typeof TASK_LABEL_PRESET_COLORS)[number];

function mergeCatalog(existing: TaskTag[], extra: TaskTag[]): TaskTag[] {
  const byKey = new Map<string, TaskTag>();
  for (const t of existing) {
    const k = tagKey(t.name);
    if (!k) continue;
    byKey.set(k, { name: t.name.trim(), color: t.color.trim().toUpperCase() });
  }
  for (const t of extra) {
    const k = tagKey(t.name);
    if (!k) continue;
    byKey.set(k, { name: t.name.trim(), color: t.color.trim().toUpperCase() });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface TaskLabelsPickerProps {
  projectId: number | null;
  value: TaskTag[];
  onChange: (tags: TaskTag[]) => void;
  disabled?: boolean;
}

export default function TaskLabelsPicker({
  projectId,
  value,
  onChange,
  disabled = false,
}: TaskLabelsPickerProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<TaskTag[]>([]);
  const [newName, setNewName] = useState('');
  const [pickedColor, setPickedColor] = useState<TaskTagColor>(TASK_LABEL_PRESET_COLORS[0]);
  const lengthToastShownRef = useRef(false);

  useEffect(() => {
    if (!projectId) {
      setCatalog([]);
      return;
    }
    setCatalog(mergeCatalog(loadCatalog(projectId), value));
  }, [projectId, value]);

  const selectedKeys = useMemo(() => new Set(value.map((t) => tagKey(t.name))), [value]);
  const isNameTooLong = newName.trim().length > TASK_TAG_MAX_NAME_LENGTH;

  const toggleTag = useCallback(
    (t: TaskTag) => {
      const k = tagKey(t.name);
      if (selectedKeys.has(k)) {
        onChange(value.filter((x) => tagKey(x.name) !== k));
      } else {
        if (value.length >= TASK_TAG_MAX_COUNT) {
          toast.error(`You can add up to ${TASK_TAG_MAX_COUNT} labels`);
          return;
        }
        onChange([...value, { name: t.name.trim(), color: t.color.trim().toUpperCase() }]);
      }
    },
    [onChange, selectedKeys, value],
  );

  const removeTag = useCallback(
    (name: string) => {
      const k = tagKey(name);
      onChange(value.filter((x) => tagKey(x.name) !== k));
    },
    [onChange, value],
  );

  const addCustomTag = useCallback(() => {
    if (!projectId) return;
    const name = newName.trim();
    if (!name) {
      toast.error('Enter a label name');
      return;
    }
    if (name.length > TASK_TAG_MAX_NAME_LENGTH) {
      toast.error(`Label name must be ${TASK_TAG_MAX_NAME_LENGTH} characters or less`);
      return;
    }
    if (value.length >= TASK_TAG_MAX_COUNT) {
      toast.error(`You can add up to ${TASK_TAG_MAX_COUNT} labels`);
      return;
    }
    if (!PRESET_COLOR_SET.has(pickedColor)) {
      toast.error('Pick a preset color');
      return;
    }
    const tag: TaskTag = { name, color: pickedColor };
    const k = tagKey(name);
    if (value.some((x) => tagKey(x.name) === k)) {
      toast.error('That label is already applied');
      return;
    }

    const nextCatalog = mergeCatalog(catalog, [tag]);
    setCatalog(nextCatalog);
    saveCatalog(projectId, nextCatalog);
    onChange([...value, tag]);
    setNewName('');
    toast.success(`Added “${name}”`);
  }, [catalog, newName, onChange, pickedColor, projectId, value]);

  if (!projectId) {
    return <span className="text-sm text-gray-400">Pick a project to manage labels.</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-[28px] flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <button
            key={tagKey(tag.name)}
            type="button"
            disabled={disabled}
            onClick={() => removeTag(tag.name)}
            className={cn(
              'group inline-flex max-w-full items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium text-white shadow-sm transition',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            style={{ backgroundColor: tag.color }}
            title="Remove label"
          >
            <span className="truncate">{tag.name}</span>
            {!disabled && (
              <X className="h-3 w-3 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
            )}
          </button>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:border-[#3CCED7]/50 hover:text-gray-900',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <Tag className="h-3 w-3" aria-hidden />
              {value.length ? 'Edit labels' : 'Add label'}
              <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="start">
            <div className="max-h-52 overflow-y-auto p-1">
              {catalog.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-gray-400">No saved labels yet</p>
              ) : (
                catalog.map((row) => {
                  const on = selectedKeys.has(tagKey(row.name));
                  const cannotAddMore = !on && value.length >= TASK_TAG_MAX_COUNT;
                  return (
                    <button
                      key={tagKey(row.name)}
                      type="button"
                      disabled={cannotAddMore}
                      onClick={() => toggleTag(row)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-gray-50',
                        on && 'bg-gray-50',
                        cannotAddMore && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: row.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                        {row.name}
                      </span>
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]',
                          on
                            ? 'border-[#3CCED7] bg-[#3CCED7] text-white'
                            : 'border-gray-200 bg-white text-transparent',
                        )}
                        aria-hidden
                      >
                        ✓
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="space-y-2 border-t border-gray-100 bg-gray-50/80 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                New label
              </p>
              <div className="flex flex-wrap gap-1">
                {TASK_LABEL_PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setPickedColor(c)}
                    className={cn(
                      'h-5 w-5 rounded-full ring-2 ring-offset-1 transition',
                      pickedColor === c ? 'ring-gray-900' : 'ring-transparent hover:ring-gray-300',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={newName}
                  onChange={(e) => {
                    const next = e.target.value;
                    setNewName(next);
                    if (next.trim().length > TASK_TAG_MAX_NAME_LENGTH) {
                      if (!lengthToastShownRef.current) {
                        toast.error(`Label name must be ${TASK_TAG_MAX_NAME_LENGTH} characters or less`);
                        lengthToastShownRef.current = true;
                      }
                    } else {
                      lengthToastShownRef.current = false;
                    }
                  }}
                  placeholder="Name"
                  className="h-8 flex-1 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-r from-[#3CCED7] to-[#A6E661] px-2.5 py-1 text-[11px] font-medium text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled || value.length >= TASK_TAG_MAX_COUNT || isNameTooLong}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  Add
                </button>
              </div>
              {isNameTooLong && (
                <p className="text-[10px] text-rose-600">
                  Label name must be {TASK_TAG_MAX_NAME_LENGTH} characters or less
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
