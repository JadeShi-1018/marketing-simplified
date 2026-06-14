'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import CsmAPI from '@/lib/api/csmApi';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';
import type { Queue } from '@/types/csm';
import type { SupportProjectStub } from '@/types/ticketForm';
import { parseFieldErrors } from '@/components/ticket-form/formErrors';
import { BUILDER_CONTROL_CLASS, BUILDER_PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './constants';

interface Props {
  isOpen: boolean;
  projectId: number;
  editing: SupportProjectStub | null;
  onClose: () => void;
  onSaved: (project: SupportProjectStub) => void;
}

export default function SupportProjectFormModal({
  isOpen,
  projectId,
  editing,
  onClose,
  onSaved,
}: Props) {
  const isEdit = editing !== null;
  const [name, setName] = useState('');
  const [defaultQueueId, setDefaultQueueId] = useState<string>('');
  const [isArchived, setIsArchived] = useState(false);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? '');
    setDefaultQueueId(editing?.default_queue ? String(editing.default_queue) : '');
    setIsArchived(editing?.is_archived ?? false);
    setFieldErrors({});
    setServerError(null);
  }, [isOpen, editing]);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    let cancelled = false;
    CsmAPI.listProjectQueues(projectId)
      .then((rows) => { if (!cancelled) setQueues(rows); })
      .catch(() => { if (!cancelled) setQueues([]); });
    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldErrors({ name: 'Name is required.' });
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setServerError(null);
    const queuePayload =
      defaultQueueId === '' ? null : Number(defaultQueueId);
    try {
      const res = isEdit
        ? await TicketFormAPI.updateSupportProject(editing!.id, {
            name: trimmed,
            default_queue: queuePayload,
            is_archived: isArchived,
          })
        : await TicketFormAPI.createSupportProject(projectId, {
            name: trimmed,
            default_queue: queuePayload,
          });
      onSaved(res.data);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      const parsed = parseFieldErrors(data);
      if (Object.keys(parsed).length > 0) {
        setFieldErrors(parsed);
      } else {
        setServerError(
          isEdit ? 'Could not update support project.' : 'Could not create support project.',
        );
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
            {isEdit ? 'Edit support project' : 'New support project'}
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
            <label htmlFor="sp-name" className="text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="sp-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Billing"
              disabled={submitting}
              className={BUILDER_CONTROL_CLASS}
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sp-queue" className="text-sm font-medium text-gray-700">
              Default queue
            </label>
            <p className="text-xs text-gray-500">
              Optional. Routes new tickets to this queue when this support project is selected.
            </p>
            <select
              id="sp-queue"
              value={defaultQueueId}
              onChange={(e) => setDefaultQueueId(e.target.value)}
              disabled={submitting}
              className={BUILDER_CONTROL_CLASS}
            >
              <option value="">None</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
            {fieldErrors.default_queue && (
              <p className="text-xs text-red-600">{fieldErrors.default_queue}</p>
            )}
          </div>

          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isArchived}
                  onChange={(e) => setIsArchived(e.target.checked)}
                  disabled={submitting}
                />
                <span className="font-medium text-gray-700">Archived</span>
              </label>
              <p className="text-xs text-gray-500">
                Archived projects are hidden from form dropdowns.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={BUILDER_PRIMARY_BUTTON_CLASS}
            >
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
