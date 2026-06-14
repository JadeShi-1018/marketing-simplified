'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Archive, Pencil, Plus } from 'lucide-react';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';
import type { SupportProjectStub } from '@/types/ticketForm';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import SettingsHubLink from '@/components/csm-settings/SettingsHubLink';
import SupportProjectFormModal from '@/components/csm-settings/SupportProjectFormModal';
import StatusBadge from '@/components/csm-settings/StatusBadge';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { PORTAL_SUBMIT_BUTTON_CLASS } from '@/components/ticket-form/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function SupportProjectsSettingsPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();
  const [projects, setProjects] = useState<SupportProjectStub[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupportProjectStub | null>(null);

  const load = useCallback(async () => {
    if (!projectValid) return;
    setLoading(true);
    setError(null);
    try {
      setProjects(
        await TicketFormAPI.listSupportProjects(projectId, { includeArchived }),
      );
    } catch {
      setError('Failed to load support projects.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid, includeArchived]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: SupportProjectStub) => {
    setEditing(row);
    setModalOpen(true);
  };

  const handleSaved = (saved: SupportProjectStub) => {
    setModalOpen(false);
    setEditing(null);
    toast.success(editing ? 'Support project updated.' : 'Support project created.');
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    if (saved.is_archived && !includeArchived) {
      load();
    }
  };

  const handleArchive = async (row: SupportProjectStub) => {
    if (
      !window.confirm(
        `Archive support project "${row.name}"? It will be hidden from form dropdowns.`,
      )
    ) {
      return;
    }
    try {
      const res = await TicketFormAPI.archiveSupportProject(row.id);
      toast.success('Support project archived.');
      setProjects((prev) =>
        prev.map((p) => (p.id === row.id ? res.data : p)),
      );
      if (!includeArchived) {
        setProjects((prev) => prev.filter((p) => p.id !== row.id));
      }
    } catch {
      toast.error('Could not archive support project.');
    }
  };

  return (
    <CsmSettingsPageRoot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Projects</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage support areas for the Project field on request forms.
          </p>
        </div>
        {projectValid && (
          <div className="flex flex-wrap items-center gap-3">
            <SettingsHubLink projectId={projectId} />
            <button type="button" onClick={openCreate} className={`gap-2 ${PORTAL_SUBMIT_BUTTON_CLASS}`}>
              <Plus className="h-4 w-4" aria-hidden />
              New support project
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
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>

          {loading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading…</p>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Default queue</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-gray-100 ${row.is_archived ? 'opacity-75' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.default_queue_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          active={!row.is_archived}
                          inactiveLabel="Archived"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            title="Edit"
                            aria-label={`Edit ${row.name}`}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          {!row.is_archived && (
                            <button
                              type="button"
                              onClick={() => handleArchive(row)}
                              title="Archive"
                              aria-label={`Archive ${row.name}`}
                              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Archive className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {projects.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm italic text-gray-400">
                        No support projects yet. Create one to populate the Project dropdown.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {projectValid && (
        <SupportProjectFormModal
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
