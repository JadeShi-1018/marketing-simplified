'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Plus } from 'lucide-react';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';
import type { CsmWorkTypeStub } from '@/types/ticketForm';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import WorkTypeFormModal from '@/components/csm-settings/WorkTypeFormModal';
import WorkTypesSortableList from '@/components/csm-settings/WorkTypesSortableList';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { PORTAL_SUBMIT_BUTTON_CLASS } from '@/components/ticket-form/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function WorkTypesSettingsPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();
  const [workTypes, setWorkTypes] = useState<CsmWorkTypeStub[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CsmWorkTypeStub | null>(null);

  const load = useCallback(async () => {
    if (!projectValid) return;
    setLoading(true);
    setError(null);
    try {
      setWorkTypes(
        await TicketFormAPI.listWorkTypes(projectId, { includeInactive }),
      );
    } catch {
      setError('Failed to load work types.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid, includeInactive]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: CsmWorkTypeStub) => {
    setEditing(row);
    setModalOpen(true);
  };

  const handleSaved = (saved: CsmWorkTypeStub) => {
    setModalOpen(false);
    setEditing(null);
    toast.success(editing ? 'Work type updated.' : 'Work type created.');
    setWorkTypes((prev) => {
      const idx = prev.findIndex((w) => w.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    if (!saved.is_active && !includeInactive) {
      load();
    }
  };

  const handleDeactivate = async (row: CsmWorkTypeStub) => {
    if (!window.confirm(`Deactivate work type "${row.name}"?`)) return;
    try {
      const res = await TicketFormAPI.deactivateWorkType(row.id);
      toast.success('Work type deactivated.');
      if (includeInactive) {
        setWorkTypes((prev) => prev.map((w) => (w.id === row.id ? res.data : w)));
      } else {
        setWorkTypes((prev) => prev.filter((w) => w.id !== row.id));
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(
        typeof detail === 'string' && detail.includes('active')
          ? 'At least one active work type is required.'
          : 'Could not deactivate work type.',
      );
    }
  };

  return (
    <CsmSettingsPageRoot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Types</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define request kinds for the Work Type field on request forms.
          </p>
        </div>
        {projectValid && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={openCreate} className={`gap-2 ${PORTAL_SUBMIT_BUTTON_CLASS}`}>
              <Plus className="h-4 w-4" aria-hidden />
              New work type
            </button>
          </div>
        )}
      </div>

      {!projectValid ? (
        <CsmSettingsProjectGuard />
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
              <button
                type="button"
                onClick={load}
                className="ml-auto rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>

          {loading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading…</p>
            </div>
          ) : workTypes.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-200">
              <p className="text-sm italic text-gray-400">
                No work types yet. Create at least one — it is required on every request form.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
              >
                New work type
              </button>
            </div>
          ) : (
            <WorkTypesSortableList
              projectId={projectId}
              items={workTypes}
              onChange={setWorkTypes}
              onEdit={openEdit}
              onDeactivate={handleDeactivate}
            />
          )}
        </>
      )}

      {projectValid && (
        <WorkTypeFormModal
          isOpen={modalOpen}
          projectId={projectId}
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </CsmSettingsPageRoot>
  );
}
