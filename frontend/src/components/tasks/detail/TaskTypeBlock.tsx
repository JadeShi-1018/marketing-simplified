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
  // policy — hide internal/computed fields; creation-form fields are shown
  'all_impacts_addressed',
  'created_by_id', 'assigned_to_id', 'reviewed_by_id', 'task_id',
  'created_by', 'assigned_to', 'reviewed_by',
  'mitigation_status',
  'mitigation_plan', 'mitigation_steps', 'mitigation_execution_notes',
  'mitigation_completed_at', 'mitigation_results',
  'post_mitigation_review', 'review_completed_at',
  'lessons_learned', 'notes', 'related_references',
  // report
  'audience_prompt_version', 'prompt_template', 'key_actions', 'is_complete',
  // experiment
  'start_date', 'end_date', 'control_group', 'variant_group', 'name',
  // optimization — complex JSON fields need the full detail page editor
  'affected_entity_ids', 'triggered_metrics', 'baseline_metrics', 'observed_metrics',
  'executed_at', 'monitored_at', 'rationale',
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
  // experiment
  experiment_outcome: 'Outcome',
  outcome_notes: 'Outcome notes',
  // retrospective
  outcome_compared_to_expectation: 'Outcome vs expectation',
  biggest_wrong_assumption: 'Biggest wrong assumption',
  would_make_same_decision_again: 'Same decision again?',
  report_url: 'Report URL',
  // scaling
  review_summary: 'Review summary',
  review_lessons_learned: 'Lessons learned',
  review_future_actions: 'Future actions',
  // alert
  postmortem_root_cause: 'Root cause',
  postmortem_prevention: 'Prevention',
  // optimization
  planned_action: 'Planned action',
  execution_status: 'Execution status',
  // policy
  platform: 'Platform',
  policy_change_type: 'Change type',
  policy_description: 'Description',
  policy_reference_url: 'Reference URL',
  effective_date: 'Effective date',
  affected_campaigns: 'Affected campaigns',
  affected_ad_sets: 'Affected ad sets',
  affected_assets: 'Affected assets',
  performance_impact: 'Performance impact',
  budget_impact: 'Budget impact',
  compliance_risk: 'Compliance risk',
  immediate_actions_required: 'Immediate actions',
  action_deadline: 'Action deadline',
};

function labelFor(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_KEYS = new Set(['execution_status']);

const EXECUTION_STATUS_STYLES: Record<string, string> = {
  completed:  'bg-green-50 text-green-800',
  monitoring: 'bg-[#3CCED7]/10 text-[#1a9ba3]',
  executed:   'bg-purple-50 text-purple-800',
  planned:    'bg-yellow-50 text-yellow-800',
  cancelled:  'bg-red-50 text-red-800',
  detected:   'bg-gray-50 text-gray-800',
};

type EntryKind = 'text' | 'array' | 'status';
type TypedEntry = [string, string, EntryKind];

function flattenEntries(obj: Record<string, unknown>): TypedEntry[] {
  const result: TypedEntry[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (HIDDEN_KEYS.has(k) || REDUNDANT_ID_KEYS.has(k)) continue;
    if (Array.isArray(v)) {
      const items = v.filter((x) => x !== null && x !== undefined && x !== '') as string[];
      if (items.length > 0) result.push([k, items.join('\x00'), 'array']);
    } else if (v !== null && v !== undefined && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      if (k === 'budget_pool') {
        const namePart = rec.name ? `${rec.name} · ` : '';
        const avail = rec.available_amount != null ? Number(rec.available_amount).toLocaleString() : '?';
        result.push([k, `${namePart}${rec.currency} (available: ${avail})`, 'text']);
        continue;
      }
      const display = prettyValue(v);
      if (display !== null) result.push([k, display, 'text']);
    } else if (STATUS_KEYS.has(k)) {
      const display = prettyValue(v);
      if (display !== null) result.push([k, display, 'status']);
    } else {
      const display = prettyValue(v);
      if (display !== null) result.push([k, display, 'text']);
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
  const config = task.type ? TASK_TYPE_CONFIG_STATIC[task.type] : null;
  const schema = task.type ? getTypeSchema(task.type) : null;
  const linkedId = linked?.id as number | string | undefined;

  // Only render if loading, or there's a linked object, or the task type has an editable schema
  if (!loading && (!linked || typeof linked !== 'object') && !schema) return null;

  const entries = flattenEntries(linked ?? {});

  const startEdit = () => {
    if (!config) return;
    setFormState(config.initEditState(linked ?? {}));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormState({});
  };

  const saveEdit = async () => {
    if (!config) return;
    if (task.type === 'experiment' && formState.experiment_outcome) {
      const expStatus = (linked as any)?.status;
      if (expStatus && expStatus !== 'completed') {
        toast.error('Experiment outcome can only be set once the experiment status is "Completed".');
        return;
      }
    }
    setSaving(true);
    try {
      if (linkedId) {
        // Linked object already exists — update it
        await config.updateApi(linkedId, config.getUpdatePayload(formState));
      } else {
        // No linked object yet — create it, passing the existing task as context
        const payload = config.getPayload(formState, task, task as any);
        if (!payload) throw new Error('Missing required fields — please fill in all required values.');
        try {
          await config.api(payload);
        } catch (createErr: unknown) {
          const data = (createErr as any)?.response?.data;
          const isAlreadyExists = JSON.stringify(data ?? '').toLowerCase().includes('already exists');
          if (isAlreadyExists) {
            throw new Error('Details already exist for this task. Reload the page to load them, then try editing again.');
          }
          throw createErr;
        }
      }
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
        {!loading && !readOnly && config && schema && (
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
          schema={{ ...schema, fields: schema.editFields ?? schema.fields }}
          values={formState}
          onChange={(key, value) => setFormState((prev) => ({ ...prev, [key]: value }))}
          context={{ projectId: (task.project as any)?.id ?? task.project_id ?? null }}
        />
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-400">No details added yet. Click Edit to fill them in.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
          {entries.map(([k, v, kind]) => (
            <div key={k} className="min-w-0 self-start">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {labelFor(k)}
              </dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {kind === 'array' ? (
                  <div className="flex flex-wrap gap-1">
                    {v.split('\x00').map((item) => (
                      <span key={item} className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : kind === 'status' ? (
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${EXECUTION_STATUS_STYLES[v] ?? 'bg-gray-50 text-gray-800'}`}>
                    {v}
                  </span>
                ) : v.startsWith('http://') || v.startsWith('https://') ? (
                  <a href={v} target="_blank" rel="noopener noreferrer" className="break-all text-[#2fb8c0] underline hover:text-[#1a9ba3]">
                    {v}
                  </a>
                ) : (
                  <span className="break-words">{v}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
