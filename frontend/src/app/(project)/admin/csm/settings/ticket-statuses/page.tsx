'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Minus, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import {
  TicketStatusMachineAPI,
  type StatusMachine,
  type TicketStatus,
} from '@/lib/api/ticketStatusMachineApi';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import SettingsHubLink from '@/components/csm-settings/SettingsHubLink';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { PORTAL_SUBMIT_BUTTON_CLASS } from '@/components/ticket-form/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import StatusLabelBadge from '@/components/csm-settings/status-labels/StatusLabelBadge';
import TicketStatusModal from '@/components/csm-settings/ticket-statuses/TicketStatusModal';

const edgeKey = (from: string, to: string) => `${from}|${to}`;

export default function TicketStatusesPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();

  const [machine, setMachine] = useState<StatusMachine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status create/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TicketStatus | null>(null);

  // Delete-in-use confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ status: TicketStatus; detail: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Transition matrix draft (Set of "from|to")
  const [edges, setEdges] = useState<Set<string>>(new Set());
  const [edgesDirty, setEdgesDirty] = useState(false);
  const [savingEdges, setSavingEdges] = useState(false);

  // Auto-resolution draft
  const [arEnabled, setArEnabled] = useState(false);
  const [arDays, setArDays] = useState('2');
  const [arMessage, setArMessage] = useState('');
  const [arDirty, setArDirty] = useState(false);
  const [savingAr, setSavingAr] = useState(false);

  const applyMachine = useCallback((m: StatusMachine) => {
    setMachine(m);
    setEdges(new Set(m.transitions.map((t) => edgeKey(t.from_status, t.to_status))));
    setEdgesDirty(false);
    setArEnabled(m.auto_resolve.enabled);
    setArDays(String(m.auto_resolve.days_until_resolve));
    setArMessage(m.auto_resolve.notification_message);
    setArDirty(false);
  }, []);

  const load = useCallback(async () => {
    if (!projectValid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      applyMachine(await TicketStatusMachineAPI.get(projectId));
    } catch {
      setError('Failed to load ticket statuses.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid, applyMachine]);

  useEffect(() => { load(); }, [load]);

  const statuses = machine?.statuses ?? [];

  const handleSaved = () => {
    setModalOpen(false);
    setEditing(null);
    toast.success(editing ? 'Status updated.' : 'Status created.');
    load(); // reload — order may have shifted
  };

  const handleDelete = async (status: TicketStatus, confirm = false) => {
    try {
      await TicketStatusMachineAPI.deleteStatus(projectId, status.id, { confirm });
      toast.success('Status deleted.');
      setConfirmDelete(null);
      load();
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string; tickets_in_use?: unknown } } })?.response;
      // 400 + tickets_in_use → status is on live tickets; confirm before forcing.
      // Build a friendly prompt from the count rather than surfacing the raw API detail.
      if (resp?.status === 400 && resp.data?.tickets_in_use != null && !confirm) {
        const count = Number(resp.data.tickets_in_use) || 0;
        const subject = count === 1 ? '1 ticket currently uses' : `${count} tickets currently use`;
        setConfirmDelete({
          status,
          detail: `${subject} “${status.name}”. Deleting it will move ${count === 1 ? 'that ticket' : 'those tickets'} to “In Progress”. Are you sure you want to delete it?`,
        });
      } else {
        toast.error(resp?.data?.detail ?? 'Could not delete status.');
      }
    }
  };

  const forceDelete = async () => {
    if (!confirmDelete) return;
    setConfirmBusy(true);
    await handleDelete(confirmDelete.status, true);
    setConfirmBusy(false);
  };

  const toggleEdge = (from: string, to: string) => {
    if (from === to) return; // a status never transitions to itself
    setEdges((prev) => {
      const next = new Set(prev);
      const key = edgeKey(from, to);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setEdgesDirty(true);
  };

  const saveEdges = async () => {
    setSavingEdges(true);
    try {
      const transitions = Array.from(edges).map((k) => {
        const [from_status, to_status] = k.split('|');
        return { from_status, to_status };
      });
      applyMachine(await TicketStatusMachineAPI.replaceTransitions(projectId, transitions));
      toast.success('Transitions saved.');
    } catch {
      toast.error('Could not save transitions.');
    } finally {
      setSavingEdges(false);
    }
  };

  const stepDays = (delta: number) => {
    const current = parseInt(arDays, 10);
    const next = Math.max(1, (isNaN(current) ? 1 : current) + delta);
    setArDays(String(next));
    setArDirty(true);
  };

  const saveAutoResolve = async () => {
    const days = parseInt(arDays, 10);
    if (arEnabled && (isNaN(days) || days < 1)) {
      toast.error('Days must be a positive number.');
      return;
    }
    setSavingAr(true);
    try {
      const updated = await TicketStatusMachineAPI.updateAutoResolve(projectId, {
        enabled: arEnabled,
        days_until_resolve: isNaN(days) ? 1 : days,
        notification_message: arMessage,
      });
      setArEnabled(updated.enabled);
      setArDays(String(updated.days_until_resolve));
      setArMessage(updated.notification_message);
      setArDirty(false);
      toast.success('Auto-resolution rule saved.');
    } catch {
      toast.error('Could not save the rule.');
    } finally {
      setSavingAr(false);
    }
  };

  return (
    <CsmSettingsPageRoot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ticket Statuses</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define the statuses a ticket can hold, which transitions agents may make, and the automatic
            resolution rule for tickets awaiting a customer reply.
          </p>
        </div>
        {projectValid && (
          <div className="flex flex-wrap items-center gap-3">
            <SettingsHubLink projectId={projectId} />
            <button
              type="button"
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className={`gap-2 ${PORTAL_SUBMIT_BUTTON_CLASS}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New custom status
            </button>
          </div>
        )}
      </div>

      {!projectValid ? (
        <CsmSettingsProjectGuard />
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
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
        <div className="flex flex-col gap-8">
          {/* ── Statuses ─────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Statuses</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200 divide-y divide-gray-100">
              {statuses.map((s) => (
                <div key={s.id} className="flex items-center gap-3 bg-white px-5 py-3">
                  <span className="w-6 text-xs text-gray-400 tabular-nums">{s.order + 1}</span>
                  <StatusLabelBadge name={s.name} color={s.color} />
                  {s.is_builtin && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      Built-in
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditing(s); setModalOpen(true); }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    {!s.is_builtin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Transition matrix ────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Allowed transitions</h2>
              <p className="mt-1 text-xs text-gray-400">
                Check a cell to allow moving a ticket from the row status to the column status. Agents can
                only make checked transitions.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      From ↓ / To →
                    </th>
                    {statuses.map((s) => (
                      <th key={s.id} className="px-3 py-3 text-center">
                        <StatusLabelBadge name={s.name} color={s.color} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statuses.map((from) => (
                    <tr key={from.id} className="bg-white">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">
                        <StatusLabelBadge name={from.name} color={from.color} />
                      </td>
                      {statuses.map((to) => {
                        const same = from.slug === to.slug;
                        const checked = edges.has(edgeKey(from.slug, to.slug));
                        return (
                          <td key={to.id} className="px-3 py-2 text-center">
                            {same ? (
                              <span className="text-gray-200">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEdge(from.slug, to.slug)}
                                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#3CCED7] focus:ring-[#3CCED7]"
                                aria-label={`Allow ${from.name} to ${to.name}`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={saveEdges}
                disabled={savingEdges || !edgesDirty}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                {savingEdges ? 'Saving…' : 'Save transitions'}
              </button>
            </div>
          </section>

          {/* ── Auto-resolution rule ─────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Automatic resolution</h2>
              <p className="mt-1 text-xs text-gray-400">
                Tickets sitting in “Pending Customer Response” with no customer reply are moved to Resolved
                after the configured number of days, and the message below is sent to the customer.
              </p>
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={arEnabled}
                  onChange={(e) => { setArEnabled(e.target.checked); setArDirty(true); }}
                  className="h-4 w-4 rounded border-gray-300 text-[#3CCED7] focus:ring-[#3CCED7]"
                />
                <span className="text-sm font-medium text-gray-700">Enable automatic resolution</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Resolve after</span>
                <div className="inline-flex items-center rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => stepDays(-1)}
                    disabled={!arEnabled || (parseInt(arDays, 10) || 1) <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-l-lg text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                    aria-label="Decrease days"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    inputMode="numeric"
                    value={arDays}
                    onChange={(e) => {
                      if (e.target.value !== '' && !/^\d+$/.test(e.target.value)) return;
                      setArDays(e.target.value); setArDirty(true);
                    }}
                    onBlur={() => { if (arDays === '' || arDays === '0') { setArDays('1'); setArDirty(true); } }}
                    disabled={!arEnabled}
                    className="h-8 w-12 border-x border-gray-200 text-center text-sm outline-none focus:bg-blue-50/40 disabled:bg-gray-50 disabled:text-gray-400"
                    aria-label="Days of no reply"
                  />
                  <button
                    type="button"
                    onClick={() => stepDays(1)}
                    disabled={!arEnabled}
                    className="flex h-8 w-8 items-center justify-center rounded-r-lg text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                    aria-label="Increase days"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-sm text-gray-600">day(s) of no reply</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="ar-message" className="text-sm font-medium text-gray-700">
                  Notification message to customer
                </label>
                <textarea
                  id="ar-message"
                  value={arMessage}
                  onChange={(e) => { setArMessage(e.target.value); setArDirty(true); }}
                  disabled={!arEnabled}
                  rows={3}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveAutoResolve}
                  disabled={savingAr || !arDirty}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  {savingAr ? 'Saving…' : 'Save rule'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {projectValid && (
        <TicketStatusModal
          isOpen={modalOpen}
          projectId={projectId}
          editing={editing}
          statuses={statuses}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        type="danger"
        title="Delete status in use?"
        message={confirmDelete?.detail ?? ''}
        confirmText="Delete anyway"
        cancelText="Cancel"
        loading={confirmBusy}
        onConfirm={forceDelete}
        onClose={() => { if (!confirmBusy) setConfirmDelete(null); }}
      />
    </CsmSettingsPageRoot>
  );
}
