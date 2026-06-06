'use client';

import { formatDistanceToNow } from 'date-fns';
import { Hash, MessageSquare, Paperclip } from 'lucide-react';
import type { MessageSearchResult } from '@/types/chat';

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

interface Props {
  result: MessageSearchResult;
  onClick: () => void;
}

export default function SearchResultItem({ result, onClick }: Props) {
  const { sender, chat_name, chat_type, created_at, highlight, has_attachments, attachment_count } = result;
  const initials = (sender.username || sender.email || '?')[0].toUpperCase();

  const relativeDate = (() => {
    try {
      return formatDistanceToNow(new Date(created_at), { addSuffix: true });
    } catch {
      return '';
    }
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]"
    >
      {/* Sender avatar */}
      <div className="shrink-0 pt-0.5">
        {sender.avatar ? (
          <img
            src={sender.avatar}
            alt={sender.username}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(sender.id)}`}>
            {initials}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Top row: sender + channel + date */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 shrink-0">
            {sender.username || sender.email}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
            {chat_type === 'group' ? (
              <Hash className="h-3 w-3" />
            ) : (
              <MessageSquare className="h-3 w-3" />
            )}
            {chat_name}
          </span>
          <span className="ml-auto text-[11px] text-gray-400 shrink-0">{relativeDate}</span>
        </div>

        {/* Highlighted snippet */}
        <p
          className="mt-0.5 line-clamp-2 text-sm text-gray-600 [overflow-wrap:anywhere] [&_mark]:rounded [&_mark]:bg-yellow-100 [&_mark]:px-0.5 [&_mark]:font-semibold [&_mark]:text-yellow-800"
          // highlight contains only <mark> tags produced by postgres SearchHeadline — safe
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: highlight || result.content }}
        />

        {/* Attachment badge */}
        {has_attachments && (
          <span className="mt-1 inline-flex items-center gap-1 rounded text-[11px] text-gray-400">
            <Paperclip className="h-3 w-3" />
            {attachment_count > 1 ? `${attachment_count} files` : '1 file'}
          </span>
        )}
      </div>
    </button>
  );
}
