'use client';

import { X, User, Hash, Paperclip, Calendar } from 'lucide-react';
import type { SearchFilters } from '@/hooks/useMessageSearch';
import type { Chat } from '@/types/chat';

interface Props {
  filters: SearchFilters;
  onChangeFilters: (f: SearchFilters) => void;
  chats?: Chat[];
}

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#3CCED7]/40 bg-[#3CCED7]/10 px-2 py-0.5 text-xs font-medium text-[#2AB5BD]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-[#3CCED7]/20"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export default function SearchFilterBar({ filters, onChangeFilters, chats = [] }: Props) {
  const { fromUser, inChat, has, dateAfter, dateBefore } = filters;
  const hasAnyFilter = fromUser || inChat || has || dateAfter || dateBefore;

  const inChatLabel = (() => {
    if (!inChat) return null;
    const chat = chats.find((c) => c.id === inChat);
    if (!chat) return `chat:${inChat}`;
    if (chat.type === 'group') return `#${chat.name || 'group'}`;
    const other = chat.participants?.[0]?.user?.username;
    return other ? `DM:${other}` : `chat:${inChat}`;
  })();

  if (!hasAnyFilter) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2">
      <span className="text-xs text-gray-400">Filters:</span>

      {fromUser && (
        <Chip
          label={`from:${fromUser}`}
          onRemove={() => onChangeFilters({ ...filters, fromUser: '' })}
        />
      )}

      {inChatLabel && (
        <Chip
          label={`in:${inChatLabel}`}
          onRemove={() => onChangeFilters({ ...filters, inChat: null })}
        />
      )}

      {has === 'file' && (
        <Chip
          label="has:file"
          onRemove={() => onChangeFilters({ ...filters, has: '' })}
        />
      )}

      {dateAfter && (
        <Chip
          label={`after:${dateAfter}`}
          onRemove={() => onChangeFilters({ ...filters, dateAfter: '' })}
        />
      )}

      {dateBefore && (
        <Chip
          label={`before:${dateBefore}`}
          onRemove={() => onChangeFilters({ ...filters, dateBefore: '' })}
        />
      )}

      <button
        type="button"
        onClick={() =>
          onChangeFilters({
            fromUser: '',
            inChat: null,
            has: '',
            dateAfter: '',
            dateBefore: '',
            threadsOnly: false,
            mentionsMe: '',
          })
        }
        className="ml-auto text-xs text-gray-400 hover:text-gray-600"
      >
        Clear all
      </button>
    </div>
  );
}
