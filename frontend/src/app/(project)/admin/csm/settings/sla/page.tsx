'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Save, Info } from 'lucide-react';
import { SLAPolicyAPI, BusinessHoursCalendarAPI } from '@/lib/api/csmApi';
import type { SLAPolicy, SLAPriorityTarget, TicketPriority, BusinessHoursCalendar } from '@/types/csm';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { CsmPriorityBadge } from '@/components/csm/CsmPriorityBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const PRIORITY_ORDER: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

const PRIORITY_DESCRIPTIONS: Record<TicketPriority, string> = {
  critical: 'System outages, data loss, complete service unavailability',
  high:     'Major feature broken, significant revenue impact',
  medium:   'Partial feature degradation, workaround available',
  low:      'Minor issues, cosmetic bugs, general questions',
};

function minutesToDisplay(min: number): string {
  if (!min || min < 1) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Row uses string inputs so users can freely edit (clear and retype)
interface RowDraft {
  priority: TicketPriority;
  fr: string;   // first_response_minutes as string
  res: string;  // resolution_minutes as string
}

function toRows(targets: SLAPriorityTarget[]): RowDraft[] {
  return PRIORITY_ORDER.map((p) => {
    const t = targets.find((x) => x.priority === p);
    return {
      priority: p,
      fr:  String(t?.first_response_minutes ?? 60),
      res: String(t?.resolution_minutes ?? 240),
    };
  });
}

function parseMin(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) || n < 1 ? null : n;
}

// Returns per-row validation errors
function validate(rows: RowDraft[]): Record<TicketPriority, string | null> {
  const errs: Record<string, string | null> = {};
  for (const row of rows) {
    const fr  = parseMin(row.fr);
    const res = parseMin(row.res);
    if (fr === null || res === null) {
      errs[row.priority] = 'Both values must be positive numbers.';
    } else if (fr >= res) {
      errs[row.priority] = 'First Response must be less than Resolution.';
    } else {
      errs[row.priority] = null;
    }
  }
  return errs as Record<TicketPriority, string | null>;
}

export default function SLAPolicySettingsPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();
  const [policy, setPolicy]   = useState<SLAPolicy | null>(null);
  const [rows, setRows]       = useState<RowDraft[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [calendars, setCalendars] = useState<BusinessHoursCalendar[]>([]);
  const [calendarId, setCalendarId] = useState<number | null>(null);
  const [pauseOnPending, setPauseOnPending] = useState(true);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [savingPause, setSavingPause] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [dirty, setDirty]     = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<TicketPriority, string | null>>({
    critical: null, high: null, medium: null, low: null,
  });

  const load = useCallback(async () => {
    if (!projectValid) return;
    setLoading(true);
    setError(null);
    try {
      const [data, cals] = await Promise.all([
        SLAPolicyAPI.get(projectId),
        BusinessHoursCalendarAPI.list(projectId),
      ]);
      setPolicy(data);
      setIsActive(data.is_active);
      setCalendars(cals);
      setCalendarId(data.calendar);
      setPauseOnPending(data.pause_on_pending);
      setRows(toRows(data.priority_targets));
      setDirty(false);
      setRowErrors({ critical: null, high: null, medium: null, low: null });
    } catch {
      setError('Failed to load SLA policy.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid]);

  useEffect(() => { load(); }, [load]);

  const updateField = (priority: TicketPriority, field: 'fr' | 'res', value: string) => {
    // Allow only digits and empty string while typing
    if (value !== '' && !/^\d+$/.test(value)) return;
    setRows((prev) => prev.map((r) => r.priority === priority ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const handleBlur = (priority: TicketPriority) => {
    // Snap empty field back to "1" on blur so it's never empty
    setRows((prev) => prev.map((r) => {
      if (r.priority !== priority) return r;
      return {
        ...r,
        fr:  r.fr  === '' ? '1' : r.fr,
        res: r.res === '' ? '1' : r.res,
      };
    }));
    // Re-validate after blur
    setRows((prev) => {
      const errs = validate(prev);
      setRowErrors(errs);
      return prev;
    });
  };

  const hasErrors = Object.values(rowErrors).some(Boolean);

  // Active toggle saves immediately without touching priority targets
  const [togglingActive, setTogglingActive] = useState(false);
  const handleToggleActive = async () => {
    if (!policy || togglingActive) return;
    const next = !isActive;
    setIsActive(next);
    setTogglingActive(true);
    try {
      await SLAPolicyAPI.update(policy.id, { is_active: next });
      toast.success(`SLA tracking ${next ? 'enabled' : 'disabled'}.`);
    } catch {
      setIsActive(!next); // revert on failure
      toast.error('Failed to update SLA status.');
    } finally {
      setTogglingActive(false);
    }
  };

  const handleCalendarChange = async (nextId: number | null) => {
    if (!policy || savingCalendar) return;
    const prev = calendarId;
    setCalendarId(nextId);
    setSavingCalendar(true);
    try {
      await SLAPolicyAPI.update(policy.id, { calendar: nextId });
      toast.success(nextId === null ? 'Countdown now uses wall-clock time.' : 'Business hours calendar applied.');
    } catch {
      setCalendarId(prev);
      toast.error('Failed to update calendar.');
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleTogglePause = async () => {
    if (!policy || savingPause) return;
    const next = !pauseOnPending;
    setPauseOnPending(next);
    setSavingPause(true);
    try {
      await SLAPolicyAPI.update(policy.id, { pause_on_pending: next });
      toast.success(`SLA clock will ${next ? 'pause' : 'keep running'} while awaiting the customer.`);
    } catch {
      setPauseOnPending(!next);
      toast.error('Failed to update pause behaviour.');
    } finally {
      setSavingPause(false);
    }
  };

  const handleSave = async () => {
    if (!policy) return;
    const errs = validate(rows);
    setRowErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error('Please fix the errors before saving.');
      return;
    }
    setSaving(true);
    try {
      const updated = await SLAPolicyAPI.update(policy.id, {
        priority_targets: rows.map((r) => ({
          priority: r.priority,
          first_response_minutes: parseMin(r.fr)!,
          resolution_minutes:     parseMin(r.res)!,
        })),
      });
      setPolicy(updated);
      setRows(toRows(updated.priority_targets));
      setDirty(false);
      setRowErrors({ critical: null, high: null, medium: null, low: null });
      toast.success('SLA policy saved.');
    } catch {
      toast.error('Failed to save SLA policy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CsmSettingsPageRoot>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SLA Policy</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set first-response and resolution time targets for each ticket priority.
        </p>
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
        <div className="flex flex-col gap-6">
          {/* Active toggle */}
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3">
            <span className="text-sm text-gray-600 font-medium">SLA tracking</span>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={togglingActive}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
                isActive
                  ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
              {togglingActive ? 'Saving…' : isActive ? 'Active' : 'Inactive'}
            </button>
            {!isActive && (
              <p className="text-xs text-gray-400">SLA deadlines will not be calculated for new tickets.</p>
            )}
          </div>

          {/* Business hours + pause behaviour */}
          <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="sm:w-56">
                <p className="text-sm font-medium text-gray-600">Business hours</p>
                <p className="text-xs text-gray-400">Countdowns run only during open hours. None = 24/7 wall-clock.</p>
              </div>
              <select
                value={calendarId ?? ''}
                onChange={(e) => handleCalendarChange(e.target.value === '' ? null : Number(e.target.value))}
                disabled={savingCalendar}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:opacity-60"
              >
                <option value="">No calendar (24/7)</option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.timezone})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 border-t border-gray-200 pt-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Pause while awaiting customer</p>
                <p className="text-xs text-gray-400">Stop the clock when a ticket is in Pending Customer Response.</p>
              </div>
              <button
                type="button"
                onClick={handleTogglePause}
                disabled={savingPause}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
                  pauseOnPending
                    ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${pauseOnPending ? 'bg-green-500' : 'bg-gray-400'}`} />
                {savingPause ? 'Saving…' : pauseOnPending ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Targets table */}
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-[220px]">
                    Priority
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    First Response
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Resolution
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const rowErr = rowErrors[row.priority];
                  const frNum  = parseMin(row.fr);
                  const resNum = parseMin(row.res);
                  return (
                    <tr key={row.priority} className="bg-white">
                      {/* Priority label */}
                      <td className="px-5 py-3 align-middle">
                        <div className="flex items-center gap-1.5">
                          <CsmPriorityBadge priority={row.priority} size="md" />
                          <div className="relative group">
                            <Info className="w-3.5 h-3.5 text-gray-300 hover:text-gray-400 cursor-default transition-colors" />
                            <div className="absolute left-5 top-1/2 -translate-y-1/2 z-10 hidden group-hover:block w-52 rounded-lg bg-gray-800 px-3 py-2 text-xs text-gray-100 shadow-lg leading-snug">
                              {PRIORITY_DESCRIPTIONS[row.priority]}
                              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* First response */}
                      <td className="px-5 py-3 align-middle">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <input
                              inputMode="numeric"
                              value={row.fr}
                              onChange={(e) => updateField(row.priority, 'fr', e.target.value)}
                              onBlur={() => handleBlur(row.priority)}
                              className={`w-24 rounded-lg border px-3 py-1.5 text-sm outline-none text-right transition-colors ${
                                rowErr
                                  ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-100'
                                  : 'border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
                              }`}
                            />
                            <span className="text-xs text-gray-400">min</span>
                            {frNum && (
                              <span className="text-xs text-gray-400">({minutesToDisplay(frNum)})</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Resolution */}
                      <td className="px-5 py-3 align-middle">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              inputMode="numeric"
                              value={row.res}
                              onChange={(e) => updateField(row.priority, 'res', e.target.value)}
                              onBlur={() => handleBlur(row.priority)}
                              className={`w-24 rounded-lg border px-3 py-1.5 text-sm outline-none text-right transition-colors ${
                                rowErr
                                  ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-100'
                                  : 'border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
                              }`}
                            />
                            <span className="text-xs text-gray-400">min</span>
                            {resNum && (
                              <span className="text-xs text-gray-400">({minutesToDisplay(resNum)})</span>
                            )}
                          </div>
                          {/* Inline error per row */}
                          {rowErr && (
                            <p className="flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {rowErr}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Save bar */}
          <div className={`flex items-center justify-between rounded-xl border px-5 py-3 transition-colors ${
            dirty ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <p className={`text-xs ${dirty ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
              {dirty
                ? 'You have unsaved changes — click Save to apply.'
                : 'Changes apply to new tickets and tickets whose priority is updated after saving.'}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || hasErrors}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </CsmSettingsPageRoot>
  );
}
