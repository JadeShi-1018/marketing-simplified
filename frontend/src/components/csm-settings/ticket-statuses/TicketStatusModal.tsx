'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  BUILDER_CONTROL_CLASS,
  BUILDER_PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/components/csm-settings/constants';
import ColorPicker, { DEFAULT_STATUS_LABEL_COLOR } from '@/components/csm-settings/status-labels/ColorPicker';
import StatusLabelBadge from '@/components/csm-settings/status-labels/StatusLabelBadge';
import { TicketStatusMachineAPI, type TicketStatus } from '@/lib/api/ticketStatusMachineApi';

interface Props {
  isOpen: boolean;
  projectId: number;
  editing: TicketStatus | null;
  /** Current statuses in order — used to build the "insert position" options. */
  statuses: TicketStatus[];
  onClose: () => void;
  onSaved: () => void;
}

export default function TicketStatusModal({
  isOpen,
  projectId,
  editing,
  statuses,
  onClose,
  onSaved,
}: Props) {
  const isEdit = editing !== null;
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_STATUS_LABEL_COLOR);
  // Insertion index into the ordered sequence (new custom statuses only).
  const [position, setPosition] = useState(statuses.length);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? '');
    setColor(editing?.color ?? DEFAULT_STATUS_LABEL_COLOR);
    setPosition(statuses.length);
    setFieldError(null);
    setServerError(null);
  }, [isOpen, editing, statuses.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError('Name is required.');
      return;
    }
    setSubmitting(true);
    setFieldError(null);
    setServerError(null);
    try {
      if (isEdit) {
        await TicketStatusMachineAPI.updateStatus(editing!.id, { name: trimmed, color });
      } else {
        await TicketStatusMachineAPI.createStatus(projectId, { name: trimmed, color, position });
      }
      onSaved();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const nameErr = Array.isArray(data?.name) ? String(data?.name[0]) : null;
      if (nameErr) {
        setFieldError(nameErr);
      } else {
        const detail = typeof data?.detail === 'string' ? data.detail : null;
        setServerError(detail ?? (isEdit ? 'Could not update status.' : 'Could not create status.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit status' : 'New custom status'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          {serverError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {serverError}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="status-name" className="text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="status-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Awaiting Review, Escalated"
              disabled={submitting}
              className={BUILDER_CONTROL_CLASS}
              autoFocus
            />
            {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Color</span>
            <ColorPicker value={color} onChange={setColor} disabled={submitting} />
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="status-position" className="text-sm font-medium text-gray-700">
                Position
              </label>
              <select
                id="status-position"
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                disabled={submitting}
                className={BUILDER_CONTROL_CLASS}
              >
                <option value={0}>At the beginning</option>
                {statuses.map((s, i) => (
                  <option key={s.id} value={i + 1}>
                    After “{s.name}”
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live preview */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Preview</span>
            <StatusLabelBadge name={name.trim() || 'Status'} color={color} />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
            <button type="button" onClick={onClose} disabled={submitting} className={SECONDARY_BUTTON_CLASS}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={BUILDER_PRIMARY_BUTTON_CLASS}>
              {submitting
                ? isEdit ? 'Saving...' : 'Creating...'
                : isEdit ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
