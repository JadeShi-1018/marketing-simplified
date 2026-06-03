'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TierType, TIER_LABELS, CreateQueueData, Queue, UpdateQueueData } from '@/types/csm';
import CsmAPI from '@/lib/api/csmApi';
import { AlertCircle } from 'lucide-react';

interface QueueFormProps {
  projectId: number;
  organisationId?: number;
  queue?: Queue;
  onSuccess: (queue: Queue) => void;
  onCancel: () => void;
}

const TIER_OPTIONS: TierType[] = ['T1', 'T2', 'T3', 'T4'];

const QueueForm: React.FC<QueueFormProps> = ({ projectId, organisationId, queue, onSuccess, onCancel }) => {
  const isEditing = !!queue;
  const [name, setName] = useState(queue?.name || '');
  const [description, setDescription] = useState(queue?.description || '');
  const [tier, setTier] = useState<TierType>(queue?.tier || 'T1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Queue name is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      let result: Queue;
      if (isEditing) {
        result = await CsmAPI.updateQueue(queue.id, { name, description, tier } as UpdateQueueData);
      } else {
        result = await CsmAPI.createQueue({ project: projectId, name, description, tier, organisation: organisationId } as CreateQueueData);
      }
      onSuccess(result);
    } catch (err: any) {
      setError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to save queue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Queue Name <span className="text-destructive">*</span></label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Billing Support" disabled={submitting} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none"
          placeholder="Brief description of this queue"
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Tier</label>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as TierType)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          disabled={submitting}
        >
          {TIER_OPTIONS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
        </select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Saving...' : isEditing ? 'Update Queue' : 'Create Queue'}
        </Button>
      </div>
    </form>
  );
};

export default QueueForm;
