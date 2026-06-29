'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Plus } from 'lucide-react';
import { CustomerStatusLabelAPI } from '@/lib/api/customerStatusLabelApi';
import type { CustomerStatusLabel } from '@/types/customer';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import SettingsHubLink from '@/components/csm-settings/SettingsHubLink';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { PORTAL_SUBMIT_BUTTON_CLASS } from '@/components/ticket-form/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import StatusLabelModal from '@/components/csm-settings/status-labels/StatusLabelModal';
import StatusLabelSortableList from '@/components/csm-settings/status-labels/StatusLabelSortableList';

export default function CustomerStatusLabelsPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();

  const [labels, setLabels] = useState<CustomerStatusLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerStatusLabel | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // In-use delete confirmation (AC2): holds the label + warning while the modal is open.
  const [confirmDelete, setConfirmDelete] = useState<{ label: CustomerStatusLabel; detail: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLabels(await CustomerStatusLabelAPI.list(projectId));
    } catch {
      setError('Failed to load status labels.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row: CustomerStatusLabel) => { setEditing(row); setModalOpen(true); };

  const handleSaved = (saved: CustomerStatusLabel) => {
    setModalOpen(false);
    setEditing(null);
    toast.success(editing ? 'Label updated.' : 'Label created.');
    setLabels((prev) => {
      const idx = prev.findIndex((l) => l.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
  };

  const handleDelete = async (row: CustomerStatusLabel) => {
    setDeletingId(row.id);
    try {
      await CustomerStatusLabelAPI.destroy(row.id);
      toast.success('Label deleted.');
      setLabels((prev) => prev.filter((l) => l.id !== row.id));
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { detail?: string } } })?.response;
      // 409 → label in use; open a confirmation modal before forcing (AC2).
      if (resp?.status === 409) {
        setConfirmDelete({ label: row, detail: resp.data?.detail ?? 'This label is in use.' });
      } else {
        toast.error('Could not delete label.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const forceDelete = async () => {
    if (!confirmDelete) return;
    const { label } = confirmDelete;
    setConfirmBusy(true);
    try {
      await CustomerStatusLabelAPI.destroy(label.id, { force: true });
      toast.success('Label deleted.');
      setLabels((prev) => prev.filter((l) => l.id !== label.id));
      setConfirmDelete(null);
    } catch {
      toast.error('Could not delete label.');
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <CsmSettingsPageRoot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Status Labels</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, color, reorder, and delete the status labels used to segment customers in this project.
          </p>
        </div>
        {projectValid && (
          <div className="flex flex-wrap items-center gap-3">
            <SettingsHubLink projectId={projectId} />
            <button
              type="button"
              onClick={openCreate}
              className={`gap-2 ${PORTAL_SUBMIT_BUTTON_CLASS}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New label
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

          {loading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading…</p>
            </div>
          ) : labels.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-200">
              <p className="text-sm italic text-gray-400">No status labels yet.</p>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
              >
                New label
              </button>
            </div>
          ) : (
            <StatusLabelSortableList
              projectId={projectId}
              items={labels}
              onChange={setLabels}
              onEdit={openEdit}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          )}
        </>
      )}

      {projectValid && (
        <StatusLabelModal
          isOpen={modalOpen}
          projectId={projectId}
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        type="danger"
        title="Delete label in use?"
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
