'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Archive, Pencil, Plus } from 'lucide-react';
import { SupportChannelAPI } from '@/lib/api/supportChannelApi';
import type { SupportChannelDetail, SupportChannelListItem } from '@/types/supportChannel';
import CsmSettingsPageRoot, { CsmSettingsProjectGuard } from '@/components/csm-settings/CsmSettingsPageRoot';
import SettingsHubLink from '@/components/csm-settings/SettingsHubLink';
import SupportChannelFormDrawer from '@/components/csm-settings/SupportChannelFormDrawer';
import ChannelTypeBadge from '@/components/csm-settings/ChannelTypeBadge';
import StatusBadge from '@/components/csm-settings/StatusBadge';
import { useProjectIdFromUrl } from '@/components/csm-settings/useProjectIdFromUrl';
import { PORTAL_SUBMIT_BUTTON_CLASS } from '@/components/ticket-form/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function detailAsListItem(detail: SupportChannelDetail): SupportChannelListItem {
  return {
    id: detail.id,
    display_name: detail.display_name,
    channel_type: detail.channel_type,
    is_active: detail.is_active,
    assignment_count: detail.assignment_count,
    default_queue_name: detail.default_queue_name,
    experience_groups: detail.experience_groups,
    sort_order: detail.sort_order,
  };
}

export default function SupportChannelsSettingsPage() {
  const { projectId, projectValid } = useProjectIdFromUrl();
  const [channels, setChannels] = useState<SupportChannelListItem[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SupportChannelDetail | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const load = useCallback(async () => {
    if (!projectValid) return;
    setLoading(true);
    setError(null);
    try {
      setChannels(
        await SupportChannelAPI.list(projectId, { includeInactive }),
      );
    } catch {
      setError('Failed to load support channels.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid, includeInactive]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = async (row: SupportChannelListItem) => {
    setLoadingEdit(true);
    try {
      const res = await SupportChannelAPI.retrieve(row.id);
      setEditing(res.data);
      setDrawerOpen(true);
    } catch {
      toast.error('Could not load channel details.');
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleSaved = (saved: SupportChannelDetail) => {
    const wasEditing = editing !== null;
    setDrawerOpen(false);
    setEditing(null);
    toast.success(wasEditing ? 'Support channel updated.' : 'Support channel created.');
    const listRow = detailAsListItem(saved);
    setChannels((prev) => {
      const idx = prev.findIndex((c) => c.id === listRow.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = listRow;
        return next;
      }
      return [...prev, listRow];
    });
    if (!saved.is_active && !includeInactive) {
      load();
    }
  };

  const handleDeactivate = async (row: SupportChannelListItem) => {
    if (
      !window.confirm(
        `Deactivate channel "${row.display_name}"? Customers will no longer see it.`,
      )
    ) {
      return;
    }
    try {
      await SupportChannelAPI.deactivate(row.id);
      toast.success('Support channel deactivated.');
      if (includeInactive) {
        setChannels((prev) =>
          prev.map((c) => (c.id === row.id ? { ...c, is_active: false } : c)),
        );
      } else {
        setChannels((prev) => prev.filter((c) => c.id !== row.id));
      }
    } catch {
      toast.error('Could not deactivate channel.');
    }
  };

  return (
    <CsmSettingsPageRoot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Channels</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure live chat, contact forms, and email channels per experience group.
          </p>
        </div>
        {projectValid && (
          <div className="flex flex-wrap items-center gap-3">
            <SettingsHubLink projectId={projectId} />
            <button
              type="button"
              onClick={openCreate}
              disabled={loadingEdit}
              className={`gap-2 ${PORTAL_SUBMIT_BUTTON_CLASS}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New channel
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
          ) : (
            <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Display name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Queue</th>
                    <th className="px-4 py-3">Experience groups</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-gray-100 ${!row.is_active ? 'opacity-75' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.display_name}
                      </td>
                      <td className="px-4 py-3">
                        <ChannelTypeBadge type={row.channel_type} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.default_queue_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.experience_groups.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.experience_groups.map((eg) => (
                              <span
                                key={eg.id}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                              >
                                {eg.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge active={row.is_active} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            disabled={loadingEdit}
                            title="Edit"
                            aria-label={`Edit ${row.display_name}`}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          {row.is_active && (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(row)}
                              title="Deactivate"
                              aria-label={`Deactivate ${row.display_name}`}
                              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Archive className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {channels.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm italic text-gray-400">
                        No support channels yet. Create one to assign to experience groups.
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
        <SupportChannelFormDrawer
          isOpen={drawerOpen}
          projectId={projectId}
          editing={editing}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </CsmSettingsPageRoot>
  );
}
