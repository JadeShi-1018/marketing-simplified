'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, ChevronDown, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';

import type { TaskTag } from '@/types/task';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TaskAPI } from '@/lib/api/taskApi';

/** Preset colors shown first; users can also pick any valid hex color. */
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

const HEX_COLOR_RE = /^#[0-9A-F]{6}$/;

function tagKey(name: string): string {
  return name.trim().toLowerCase();
}

function parseHexColor(value: string): string | null {
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  const color = raw.startsWith('#') ? raw : `#${raw}`;
  return HEX_COLOR_RE.test(color) ? color : null;
}

function normalizeHexColor(value: string): string {
  return parseHexColor(value) ?? TASK_LABEL_PRESET_COLORS[0];
}

function isPresetColor(value: string): boolean {
  const color = parseHexColor(value);
  return Boolean(color && PRESET_COLOR_SET.has(color));
}

function mergeCatalog(existing: TaskTag[], extra: TaskTag[]): TaskTag[] {
  const byKey = new Map<string, TaskTag>();
  for (const t of existing) {
    const k = tagKey(t.name);
    const color = parseHexColor(t.color);
    if (!k || !color) continue;
    byKey.set(k, { name: t.name.trim(), color });
  }
  for (const t of extra) {
    const k = tagKey(t.name);
    const color = parseHexColor(t.color);
    if (!k || !color) continue;
    byKey.set(k, { name: t.name.trim(), color });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as any)?.response;
  const data = response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (response?.status) return `${fallback} (${response.status})`;
  return fallback;
}

interface CustomColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
  sizeClassName: string;
  label: string;
}

function CustomColorSwatch({ value, onChange, sizeClassName, label }: CustomColorSwatchProps) {
  const selected = !isPresetColor(value);
  const visibleColor = selected
    ? normalizeHexColor(value)
    : 'conic-gradient(from 90deg, #EB5757, #F2994A, #F2C94C, #4CB782, #26B5CE, #5E6AD2, #9B51E0, #EB5757)';

  return (
    <label
      title={label}
      className={cn(
        'relative inline-flex cursor-pointer overflow-hidden rounded-full ring-2 ring-offset-1 transition',
        sizeClassName,
        selected ? 'ring-gray-900' : 'ring-transparent hover:ring-gray-300',
      )}
      style={{ background: visibleColor }}
    >
      <input
        type="color"
        value={normalizeHexColor(value)}
        onChange={(e) => onChange(normalizeHexColor(e.target.value))}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
    </label>
  );
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
  const [pickedColor, setPickedColor] = useState<string>(TASK_LABEL_PRESET_COLORS[0]);
  const lengthToastShownRef = useRef(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(TASK_LABEL_PRESET_COLORS[0]);

  useEffect(() => {
    if (!projectId) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    TaskAPI.getTagCatalog(projectId)
      .then((rows) => {
        if (cancelled) return;
        // Merge with current catalog (not the stale closure value) so any tags
        // the user added before this fetch resolved are preserved.
        setCatalog((prev) => mergeCatalog(rows, prev));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Keep the catalog in sync with the applied tags on the current task so freshly
  // picked tags appear in the picker without waiting for a refetch.
  useEffect(() => {
    setCatalog((prev) => mergeCatalog(prev, value));
  }, [value]);

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
        onChange([...value, { name: t.name.trim(), color: normalizeHexColor(t.color) }]);
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
    const color = parseHexColor(pickedColor);
    if (!color) {
      toast.error('Pick a valid color');
      return;
    }
    const tag: TaskTag = { name, color };
    const k = tagKey(name);
    if (value.some((x) => tagKey(x.name) === k)) {
      toast.error('That label is already applied');
      return;
    }

    const nextCatalog = mergeCatalog(catalog, [tag]);
    setCatalog(nextCatalog);
    onChange([...value, tag]);
    setNewName('');
    toast.success(`Added “${name}”`);
  }, [catalog, newName, onChange, pickedColor, projectId, value]);

  const deleteCatalogTag = useCallback(
    async (tag: TaskTag) => {
      if (!projectId) return;
      const key = tagKey(tag.name);
      try {
        await TaskAPI.deleteTag(projectId, tag.name);
        const nextCatalog = catalog.filter((t) => tagKey(t.name) !== key);
        setCatalog(nextCatalog);

        if (editingKey === key) {
          setEditingKey(null);
        }
        if (selectedKeys.has(key)) {
          onChange(value.filter((t) => tagKey(t.name) !== key));
        }
        toast.success('Label deleted');
      } catch (error) {
        toast.error(apiErrorMessage(error, 'Delete failed'));
      }
    },
    [catalog, editingKey, onChange, projectId, selectedKeys, value],
  );

  const startEdit = useCallback((tag: TaskTag) => {
    setEditingKey(tagKey(tag.name));
    setEditName(tag.name);
    setEditColor(normalizeHexColor(tag.color));
  }, []);

  const saveEdit = useCallback(() => {
    if (!projectId || !editingKey) return;
    const name = editName.trim();
    if (!name) { toast.error('Enter a label name'); return; }
    if (name.length > TASK_TAG_MAX_NAME_LENGTH) {
      toast.error(`Label name must be ${TASK_TAG_MAX_NAME_LENGTH} characters or less`);
      return;
    }
    const color = parseHexColor(editColor);
    if (!color) { toast.error('Pick a valid color'); return; }

    const nextCatalog = catalog.map((t) =>
      tagKey(t.name) === editingKey ? { name, color } : t,
    );
    setCatalog(nextCatalog);

    // Update the applied value if this tag was selected
    const nextValue = value.map((t) =>
      tagKey(t.name) === editingKey ? { name, color } : t,
    );
    if (JSON.stringify(nextValue) !== JSON.stringify(value)) onChange(nextValue);

    setEditingKey(null);
    toast.success('Label updated');
  }, [catalog, editColor, editName, editingKey, onChange, projectId, value]);

  const cancelEdit = useCallback(() => setEditingKey(null), []);

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
                  const k = tagKey(row.name);
                  const on = selectedKeys.has(k);
                  const cannotAddMore = !on && value.length >= TASK_TAG_MAX_COUNT;

                  if (editingKey === k) {
                    return (
                      <div key={k} className="space-y-1 rounded-md bg-gray-50 p-2">
                        <div className="flex flex-wrap gap-0.5">
                          {TASK_LABEL_PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              title={c}
                              onClick={() => setEditColor(c)}
                              className={cn(
                                'h-4 w-4 rounded-full ring-2 ring-offset-1 transition',
                                editColor === c ? 'ring-gray-900' : 'ring-transparent hover:ring-gray-300',
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <CustomColorSwatch
                            value={editColor}
                            onChange={setEditColor}
                            sizeClassName="h-4 w-4"
                            label="Custom label color"
                          />
                        </div>
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="h-7 flex-1 rounded border border-gray-200 px-2 text-xs outline-none focus:border-[#3CCED7]"
                          />
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#3CCED7] text-white hover:opacity-90"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={k}
                      className={cn(
                        'group relative flex items-center gap-1 rounded-md pr-7 transition hover:bg-gray-50',
                        on && 'bg-gray-50',
                        cannotAddMore && 'opacity-50',
                      )}
                    >
                      <button
                        type="button"
                        disabled={cannotAddMore}
                        onClick={() => toggleTag(row)}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition',
                          cannotAddMore && 'cursor-not-allowed',
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
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                        title="Edit label"
                        aria-label={`Edit ${row.name} label`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={cannotAddMore}
                        onClick={() => toggleTag(row)}
                        className="shrink-0 disabled:cursor-not-allowed"
                        title={on ? 'Remove label from task' : 'Add label to task'}
                        aria-label={on ? `Remove ${row.name} label from task` : `Add ${row.name} label to task`}
                      >
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
                      <button
                        type="button"
                        onClick={() => deleteCatalogTag(row)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                        title="Delete label"
                        aria-label={`Delete ${row.name} label`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
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
                <CustomColorSwatch
                  value={pickedColor}
                  onChange={setPickedColor}
                  sizeClassName="h-5 w-5"
                  label="Custom label color"
                />
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
