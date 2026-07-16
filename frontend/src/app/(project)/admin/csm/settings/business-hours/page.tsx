'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CalendarClock, Plus, Save, Trash2, X } from 'lucide-react';
import { BusinessHoursCalendarAPI } from '@/lib/api/csmApi';
import type { BusinessHoursCalendar, DaySchedule, Weekday, WeekSchedule } from '@/types/csm';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

// Native IANA zone list when the runtime supports it; a small fallback otherwise.
function timezoneOptions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof intl.supportedValuesOf === 'function') {
    try { return intl.supportedValuesOf('timeZone'); } catch { /* fall through */ }
  }
  return ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Shanghai', 'Australia/Sydney'];
}

// Ask the platform whether a string is a real IANA zone — independent of the
// list above, so a hand-typed value is still validated.
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function defaultSchedule(): WeekSchedule {
  const weekday: DaySchedule = { enabled: true, start: '09:00', end: '17:00' };
  const off: DaySchedule = { enabled: false };
  return {
    monday: { ...weekday }, tuesday: { ...weekday }, wednesday: { ...weekday },
    thursday: { ...weekday }, friday: { ...weekday },
    saturday: { ...off }, sunday: { ...off },
  };
}

function summarize(schedule: WeekSchedule): string {
  const open = WEEKDAYS.filter((d) => schedule[d.key]?.enabled);
  if (open.length === 0) return 'Closed all week';
  const times = new Set(open.map((d) => `${schedule[d.key].start}–${schedule[d.key].end}`));
  const range = times.size === 1 ? ` ${[...times][0]}` : '';
  return `${open.map((d) => d.label.slice(0, 3)).join(', ')}${range}`;
}

interface EditorState {
  id: number | null; // null = creating
  name: string;
  timezone: string;
  schedule: WeekSchedule;
}

function CalendarEditor({
  state, tzOptions, saving, onChange, onSave, onCancel,
}: {
  state: EditorState;
  tzOptions: string[];
  saving: boolean;
  onChange: (next: EditorState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const setDay = (day: Weekday, patch: Partial<DaySchedule>) => {
    onChange({ ...state, schedule: { ...state.schedule, [day]: { ...state.schedule[day], ...patch } } });
  };
  const tzValid = isValidTimezone(state.timezone);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {state.id === null ? 'New calendar' : 'Edit calendar'}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-600">Name</span>
          <input
            value={state.name}
            onChange={(e) => onChange({ ...state, name: e.target.value })}
            placeholder="e.g. Standard 9–5 (Weekdays)"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-600">Timezone</span>
          <input
            list="bh-timezone-options"
            value={state.timezone}
            onChange={(e) => onChange({ ...state, timezone: e.target.value })}
            placeholder="Type to search…"
            className={`rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1 ${
              tzValid
                ? 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
                : 'border-red-300 focus:border-red-400 focus:ring-red-100'
            }`}
          />
          <datalist id="bh-timezone-options">
            {tzOptions.map((tz) => <option key={tz} value={tz} />)}
          </datalist>
          {!tzValid && <span className="text-xs text-red-500">Not a recognized timezone.</span>}
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        {WEEKDAYS.map(({ key, label }) => {
          const day = state.schedule[key];
          return (
            <div key={key} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
              <label className="flex w-32 items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(e) => setDay(key, { enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {label}
              </label>
              {day.enabled ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={day.start ?? '09:00'}
                    onChange={(e) => setDay(key, { start: e.target.value })}
                    className="rounded-lg border border-gray-200 px-2 py-1 outline-none focus:border-blue-400"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="time"
                    value={day.end ?? '17:00'}
                    onChange={(e) => setDay(key, { end: e.target.value })}
                    className="rounded-lg border border-gray-200 px-2 py-1 outline-none focus:border-blue-400"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !state.name.trim() || !tzValid}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save calendar'}
        </button>
      </div>
    </div>
  );
}

export default function BusinessHoursSettingsPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();
  const [calendars, setCalendars] = useState<BusinessHoursCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [tzOptions] = useState(timezoneOptions);

  const load = useCallback(async () => {
    if (!projectValid) return;
    setLoading(true);
    setError(null);
    try {
      setCalendars(await BusinessHoursCalendarAPI.list(projectId));
    } catch {
      setError('Failed to load calendars.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid]);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => setEditor({ id: null, name: '', timezone: 'UTC', schedule: defaultSchedule() });
  const startEdit = (c: BusinessHoursCalendar) =>
    setEditor({ id: c.id, name: c.name, timezone: c.timezone, schedule: c.schedule });

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const payload = { name: editor.name.trim(), timezone: editor.timezone, schedule: editor.schedule };
      if (editor.id === null) {
        await BusinessHoursCalendarAPI.create(projectId, payload);
        toast.success('Calendar created.');
      } else {
        await BusinessHoursCalendarAPI.update(editor.id, payload);
        toast.success('Calendar updated.');
      }
      setEditor(null);
      await load();
    } catch {
      toast.error('Failed to save calendar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: BusinessHoursCalendar) => {
    if (!confirm(`Delete "${c.name}"? Policies using it will fall back to wall-clock countdowns.`)) return;
    try {
      await BusinessHoursCalendarAPI.remove(c.id);
      toast.success('Calendar deleted.');
      await load();
    } catch {
      toast.error('Failed to delete calendar.');
    }
  };

  return (
    <CsmSettingsPageRoot>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Hours</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define working-hours calendars. Attach one to an SLA policy so countdowns only run during open hours.
          </p>
        </div>
        {projectValid && !editor && (
          <button
            onClick={startCreate}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New calendar
          </button>
        )}
      </div>

      {!projectValid ? (
        <CsmSettingsProjectGuard />
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100">
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <LoadingSpinner />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {editor && (
            <CalendarEditor
              state={editor}
              tzOptions={tzOptions}
              saving={saving}
              onChange={setEditor}
              onSave={handleSave}
              onCancel={() => setEditor(null)}
            />
          )}

          {calendars.length === 0 && !editor ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 py-12 text-center">
              <CalendarClock className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No calendars yet.</p>
              <p className="text-xs text-gray-400">Create one to enable business-hours SLA countdowns.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {calendars.map((c) => (
                <div key={c.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4">
                  <CalendarClock className="h-5 w-5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="truncate text-xs text-gray-500">{c.timezone} · {summarize(c.schedule)}</p>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CsmSettingsPageRoot>
  );
}
