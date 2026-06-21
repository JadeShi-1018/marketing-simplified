'use client';

import React, { useState, useEffect } from 'react';
import { Conversation, ConversationStatus, UpdateConversationPayload } from '@/types/csmConversation';
import CsmConversationAPI from '@/lib/api/csmConversationApi';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import api from '@/lib/api';

const STATUS_OPTIONS: { value: ConversationStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_COLORS: Record<ConversationStatus, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

interface Queue {
  id: number;
  name: string;
}

interface ConversationActionsProps {
  conversation: Conversation;
}

export function ConversationActions({ conversation }: ConversationActionsProps) {
  const [tagInput, setTagInput] = useState('');
  const [queues, setQueues] = useState<Queue[]>([]);
  const updateConversation = useCsmConversationStore((s) => s.updateConversation);

  // Fetch available queues once
  useEffect(() => {
    const params: Record<string, string> = {};
    if (conversation.queue_organisation_id) {
      params.organisation = String(conversation.queue_organisation_id);
    }
    api.get('/api/csm/queues/', { params })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
        setQueues(data);
      })
      .catch(() => {});
  }, [conversation.queue_organisation_id]);

  const patch = async (data: UpdateConversationPayload) => {
    try {
      const updated = await CsmConversationAPI.update(conversation.id, data);
      updateConversation(updated);
    } catch (err) {
      console.error('Failed to update conversation', err);
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    patch({ status: e.target.value as ConversationStatus });
  };

  const handleQueueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    patch({ queue: val ? Number(val) : null });
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      patch({ tags: [...(conversation.tags ?? []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    patch({ tags: conversation.tags.filter((t) => t !== tag) });
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white flex-wrap">
      {/* Customer name */}
      <span className="font-semibold text-sm text-gray-900 truncate max-w-[160px]">
        {conversation.customer_name ?? conversation.customer_email ?? 'Unknown'}
      </span>

      {/* Ticket title */}
      {conversation.ticket && (
        <>
          <span className="text-gray-200">|</span>
          <span className="text-xs text-gray-500 truncate max-w-[200px]">
            #{conversation.ticket.id} {conversation.ticket.title}
          </span>
        </>
      )}

      <span className="text-gray-200">|</span>

      {/* Status selector */}
      <select
        value={conversation.status}
        onChange={handleStatusChange}
        className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer outline-none ${STATUS_COLORS[conversation.status]}`}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <span className="text-gray-200">|</span>

      {/* Queue selector */}
      <select
        value={conversation.queue ?? ''}
        onChange={handleQueueChange}
        className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white cursor-pointer"
      >
        <option value="">No queue</option>
        {queues.map((q) => (
          <option key={q.id} value={q.id}>{q.name}</option>
        ))}
      </select>

      <span className="text-gray-200">|</span>

      {/* Tags */}
      <div className="flex items-center gap-1 flex-wrap">
        {(conversation.tags ?? []).map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
          >
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="text-gray-400 hover:text-gray-700 leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          placeholder="Add tag…"
          className="text-xs text-gray-600 placeholder-gray-300 outline-none w-20 bg-transparent"
        />
      </div>
    </div>
  );
}
