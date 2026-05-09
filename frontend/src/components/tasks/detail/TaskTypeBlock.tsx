'use client';

import { useState } from 'react';
import { Pencil, X, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { TaskData } from '@/types/task';
import { Skeleton } from '@/components/ui/skeleton';
import { getTypeSchema } from '@/lib/tasks/typeFieldSchemas';
import { TASK_TYPE_CONFIG_STATIC } from '@/lib/taskTypeConfigRegistry';
import TaskTypeFieldsSection from '@/components/tasks/new/TaskTypeFieldsSection';

function prettyLabel(type?: string): string {
  if (!type) return 'Work type';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) {
    const items = v.filter((x) => x !== null && x !== undefined && x !== '');
    if (items.length === 0) return null;
    return items.map((x) => (typeof x === 'string' ? x.replace(/_/g, ' ') : String(x))).join(', ');
  }
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== null && val !== undefined && val !== '')
      .map(([k, val]) => `${k.replace(/_/g, ' ')}: ${String(val)}`);
    return parts.length ? parts.join(' · ') : null;
  }
  if (typeof v === 'string') return v.replace(/_/g, ' ');
  return String(v);
}

const HIDDEN_KEYS = new Set(['id', 'task', 'task_id', 'created_at', 'updated_at']);

// Keys that are raw IDs, computed duplicates, or internal fields not worth surfacing
const REDUNDANT_ID_KEYS = new Set([
  // budget
  'current_approver', 'ad_channel', 'budget_pool_id', 'is_escalated', 'status',
  // asset
  'owner',
  // retrospective
  'kpi_count', 'insight_count', 'campaign', 'status_display',
  // policy
  'mitigation_status', 'all_impacts_addressed',
  'created_by_id', 'assigned_to_id', 'reviewed_by_id', 'task_id',
  // report
  'audience_prompt_version', 'prompt_template', 'key_actions', 'is_complete',
  // experiment
  'start_date', 'end_date', 'control_group', 'variant_group',
]);

// Human-readable labels for known keys
const KEY_LABELS: Record<string, string> = {
  requested_by: 'Requested by',
  current_approver_name: 'Approver',
  ad_channel_name: 'Ad channel',
  is_escalated: 'Escalated',
  budget_pool: 'Budget pool',
  submitted_at: 'Submitted at',
  campaign_name: 'Campaign',
  campaign_description: 'Campaign description',
};

function labelFor(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function flattenEntries(obj: Record<string, unknown>): [string, string][] {
  const result: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (HIDDEN_KEYS.has(k) || REDUNDANT_ID_KEYS.has(k)) continue;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      // For budget_pool object: show name + currency + available (channel shown separately)
      const rec = v as Record<string, unknown>;
      if (k === 'budget_pool') {
        const namePart = rec.name ? `${rec.name} · ` : '';
        const avail = rec.available_amount != null ? Number(rec.available_amount).toLocaleString() : '?';
        const label = `${namePart}${rec.currency} (available: ${avail})`;
        result.push([k, label]);
        continue;
      }
      // Keep nested objects as a single entry rather than flattening subkeys
      // (flattening causes collisions when multiple sibling objects share the same subkeys)
      const display = prettyValue(v);
      if (display !== null) result.push([k, display]);
    } else {
      const display = prettyValue(v);
      if (display !== null) result.push([k, display]);
    }
  }
  return result.slice(0, 30);
}

export default function TaskTypeBlock({
  task,
  loading = false,
  readOnly = false,
  onUpdated,
}: {
  task: TaskData;
  loading?: boolean;
  readOnly?: boolean;
  onUpdated?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const linked = task.linked_object as Record<string, unknown> | null | undefined;
  if (!loading && (!linked || typeof linked !== 'object')) return null;

  const entries = flattenEntries(linked ?? {});
  if (!loading && entries.length === 0) return null;

  const config = task.type ? TASK_TYPE_CONFIG_STATIC[task.type] : null;
  const schema = task.type ? getTypeSchema(task.type) : null;
  const linkedId = linked?.id as number | string | undefined;

  const startEdit = () => {
    if (!config || !linked) return;
    setFormState(config.initEditState(linked));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormState({});
  };

  const saveEdit = async () => {
    if (!config || !linkedId) return;
    setSaving(true);
    try {
      await config.updateApi(linkedId, config.getUpdatePayload(formState));
      toast.success('Details updated.');
      setEditing(false);
      onUpdated?.();
    } catch (e: unknown) {
      const detail = (e as any)?.response?.data
        ? JSON.stringify((e as any).response.data)
        : (e as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-900">
          {prettyLabel(task.type)} details
        </h2>
        {!loading && !readOnly && config && schema && linkedId && (
          editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-[#3CCED7] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2fb8c0] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )
        )}
      </div>

      {loading ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`task-type-skeleton-${index}`} className="min-w-0 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </dl>
      ) : editing && schema ? (
        <TaskTypeFieldsSection
          schema={schema}
          values={formState}
          onChange={(key, value) => setFormState((prev) => ({ ...prev, [key]: value }))}
          context={{ projectId: (task.project as any)?.id ?? task.project_id ?? null }}
        />
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="min-w-0 self-start">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {labelFor(k)}
              </dt>
              <dd className="mt-0.5 break-words text-sm text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
