'use client';

import React, { useState, useEffect } from 'react';
import { CustomerProfile } from '@/types/csmConversation';
import CsmConversationAPI from '@/lib/api/csmConversationApi';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import api from '@/lib/api';

interface Queue {
  id: number;
  name: string;
}

interface CreateTicketModalProps {
  conversationId: number;
  customerProfile: CustomerProfile | null;
  defaultQueueId: number | null;
  onClose: () => void;
  onCreated?: () => void;
}

/** Build the initial description from the linked customer's profile (AC4: form pre-populated). */
function buildInitialDescription(profile: CustomerProfile | null): string {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.full_name) lines.push(`Customer: ${profile.full_name}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);
  if (profile.company) lines.push(`Company: ${profile.company}`);
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  if (profile.organisation_name) lines.push(`Organisation: ${profile.organisation_name}`);
  if (profile.region_name) lines.push(`Region: ${profile.region_name}`);
  return lines.join('\n');
}

export function CreateTicketModal({
  conversationId,
  customerProfile,
  defaultQueueId,
  onClose,
  onCreated,
}: CreateTicketModalProps) {
  const customerName = customerProfile?.full_name || 'customer';
  const [title, setTitle] = useState(`Support request from ${customerName}`);
  const [description, setDescription] = useState(() => buildInitialDescription(customerProfile));
  const [priority, setPriority] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [selectedQueueId, setSelectedQueueId] = useState<number | null>(defaultQueueId);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMessage = useCsmConversationStore((s) => s.addMessage);

  // Fetch available queues
  useEffect(() => {
    api.get('/api/csm/queues/')
      .then((res) => {
        const data: Queue[] = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
        setQueues(data);
        // Auto-select first queue if no default
        if (!selectedQueueId && data.length > 0) {
          setSelectedQueueId(data[0].id);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueId) {
      setError('Please select a queue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await CsmConversationAPI.createTicket(conversationId, {
        title,
        description,
        priority,
        queue: selectedQueueId,
      });
      addMessage(conversationId, result.system_message);
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Failed to create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Create Ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Queue *</label>
            {queues.length === 0 ? (
              <p className="text-xs text-orange-500">No queues found. Please create a queue in CSM settings first.</p>
            ) : (
              <select
                value={selectedQueueId ?? ''}
                onChange={(e) => setSelectedQueueId(Number(e.target.value))}
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                <option value="" disabled>Select a queue…</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || queues.length === 0}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
