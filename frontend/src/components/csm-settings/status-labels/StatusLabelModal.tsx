'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { CustomerStatusLabelAPI } from '@/lib/api/customerStatusLabelApi';
import type { CustomerStatusLabel } from '@/types/customer';
import {
  BUILDER_CONTROL_CLASS,
  BUILDER_PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/components/csm-settings/constants';
import ColorPicker, { DEFAULT_STATUS_LABEL_COLOR } from './ColorPicker';
import StatusLabelBadge from './StatusLabelBadge';

interface Props {
  isOpen: boolean;
  projectId: number;
  editing: CustomerStatusLabel | null;
  onClose: () => void;
  onSaved: (label: CustomerStatusLabel) => void;
}

export default function StatusLabelModal({
  isOpen,
  projectId,
  editing,
  onClose,
  onSaved,
}: Props) {
  const isEdit = editing !== null;
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_STATUS_LABEL_COLOR);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? '');
    setColor(editing?.color ?? DEFAULT_STATUS_LABEL_COLOR);
    setFieldError(null);
    setServerError(null);
  }, [isOpen, editing]);

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
      const res = isEdit
        ? await CustomerStatusLabelAPI.update(editing!.id, { name: trimmed, color })
        : await CustomerStatusLabelAPI.create(projectId, { name: trimmed, color });
      onSaved(res.data);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const nameErr = Array.isArray(data?.name) ? String(data?.name[0]) : null;
      if (nameErr) {
        setFieldError(nameErr);
      } else {
        const detail = typeof data?.detail === 'string' ? data.detail : null;
        setServerError(detail ?? (isEdit ? 'Could not update label.' : 'Could not create label.'));
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
            {isEdit ? 'Edit status label' : 'New status label'}
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
            <label htmlFor="label-name" className="text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="label-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gold, Partner, Internal"
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

          {/* Live preview */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Preview</span>
            <StatusLabelBadge name={name.trim() || 'Label'} color={color} />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={SECONDARY_BUTTON_CLASS}
            >
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
