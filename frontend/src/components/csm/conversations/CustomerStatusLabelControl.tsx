'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CustomerStatusLabelAPI } from '@/lib/api/customerStatusLabelApi';
import { CustomerAPI } from '@/lib/api/customerApi';
import type { CustomerStatusLabel } from '@/types/customer';
import StatusLabelBadge from '@/components/csm-settings/status-labels/StatusLabelBadge';

interface Props {
  customerId: number;
  projectId: number | null;
  value: number | null;
  valueName: string | null;
  valueColor: string | null;
  /** Notify the parent so the header badge updates immediately. */
  onChange: (next: { id: number | null; name: string | null; color: string | null }) => void;
}

export default function CustomerStatusLabelControl({
  customerId,
  projectId,
  value,
  valueName,
  valueColor,
  onChange,
}: Props) {
  const [labels, setLabels] = useState<CustomerStatusLabel[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadLabels = useCallback(async () => {
    if (projectId == null) return;
    try {
      setLabels(await CustomerStatusLabelAPI.list(projectId));
    } catch {
      /* non-blocking: dropdown just stays empty */
    }
  }, [projectId]);

  useEffect(() => {
    if (editing) loadLabels();
  }, [editing, loadLabels]);

  const assign = async (labelId: number | null) => {
    setSaving(true);
    try {
      await CustomerAPI.update(customerId, { status_label: labelId });
      const picked = labelId == null ? null : labels.find((l) => l.id === labelId) ?? null;
      onChange({
        id: labelId,
        name: picked?.name ?? null,
        color: picked?.color ?? null,
      });
      setEditing(false);
    } catch {
      toast.error('Could not update status label.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Status Label</p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[#3CCED7] hover:underline"
          >
            {value ? 'Change' : 'Add'}
          </button>
        )}
      </div>

      {editing ? (
        <select
          autoFocus
          disabled={saving}
          value={value ?? ''}
          onChange={(e) => assign(e.target.value === '' ? null : Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-[#86E9A8] focus:outline-none focus:ring-2 focus:ring-[#86E9A8]/40"
        >
          <option value="">— No status —</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      ) : value && valueName ? (
        <div className="mt-1">
          <StatusLabelBadge name={valueName} color={valueColor ?? '#475569'} />
        </div>
      ) : (
        <p className="mt-1 text-sm italic text-gray-300">None</p>
      )}
    </div>
  );
}
