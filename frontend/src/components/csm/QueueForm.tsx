'use client';

import React, { useState } from 'react';
import { TierType, TIER_LABELS, CreateQueueData, Queue, UpdateQueueData } from '@/types/csm';
import CsmAPI from '@/lib/api/csmApi';

interface QueueFormProps {
  projectId: number;
  queue?: Queue; // If provided, editing mode
  onSuccess: (queue: Queue) => void;
  onCancel: () => void;
}

const TIER_OPTIONS: TierType[] = ['T1', 'T2', 'T3', 'T4'];

const QueueForm: React.FC<QueueFormProps> = ({ projectId, queue, onSuccess, onCancel }) => {
  const isEditing = !!queue;
  const [name, setName] = useState(queue?.name || '');
  const [description, setDescription] = useState(queue?.description || '');
  const [tier, setTier] = useState<TierType>(queue?.tier || 'T1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Queue name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let result: Queue;
      if (isEditing) {
        const data: UpdateQueueData = { name, description, tier };
        result = await CsmAPI.updateQueue(queue.id, data);
      } else {
        const data: CreateQueueData = {
          project: projectId,
          name,
          description,
          tier,
        };
        result = await CsmAPI.createQueue(data);
      }
      onSuccess(result);
    } catch (err: any) {
      const detail =
        err?.response?.data?.name?.[0] ||
        err?.response?.data?.detail ||
        'Failed to save queue';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Queue Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="e.g. Billing Support"
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Brief description of this queue"
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as TierType)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          disabled={submitting}
        >
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : isEditing ? 'Update Queue' : 'Create Queue'}
        </button>
      </div>
    </form>
  );
};

export default QueueForm;
