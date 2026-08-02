'use client';

import { ArrowUpRight, ChevronRight, Pin } from 'lucide-react';
import type { PinnedMessageRow } from '@/lib/api/chatApi';

interface PinnedMessageBannerProps {
  latestPin: PinnedMessageRow;
  pinCount: number;
  isNew: boolean;
  onJumpToMessage: (messageId: number, parentMessageId?: number | null) => void;
  onViewAll: () => void;
}

export default function PinnedMessageBanner({
  latestPin,
  pinCount,
  isNew,
  onJumpToMessage,
  onViewAll,
}: PinnedMessageBannerProps) {
  const sender = latestPin.message.sender?.username || latestPin.message.sender?.email || 'Unknown';

  return (
    <section
      className={[
        'relative flex items-stretch overflow-hidden px-4 py-2.5',
        isNew
          ? 'bg-gradient-to-r from-teal-100 via-cyan-50 to-lime-50 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.12)]'
          : 'bg-gradient-to-r from-teal-50/90 via-white to-cyan-50/70',
      ].join(' ')}
      data-testid="pinned-message-banner"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => onJumpToMessage(latestPin.message.id, latestPin.message.parent_message_id ?? null)}
        className="group flex min-w-0 flex-1 items-start gap-3 text-left"
        aria-label={`Jump to latest pinned message: ${latestPin.message.content || 'attachment'}`}
      >
        <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm shadow-teal-600/25 transition group-hover:scale-105 group-hover:bg-teal-700">
          <Pin className="h-4 w-4" />
          {isNew && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500" />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-800">
              {isNew ? 'New pinned message' : 'Pinned message'}
            </span>
            <span className="truncate text-[11px] font-normal normal-case tracking-normal text-gray-500">by {sender}</span>
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900">
            {latestPin.message.content || '(attachment)'}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-teal-700 opacity-80 group-hover:opacity-100">
            Jump to message <ArrowUpRight className="h-3 w-3" />
          </span>
        </span>
      </button>

      <div className="ml-3 flex shrink-0 items-center border-l border-teal-200 pl-3">
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-white/90 px-2.5 py-2 text-xs font-semibold text-teal-800 shadow-sm transition hover:border-teal-400 hover:bg-white hover:shadow"
          aria-label={`View all ${pinCount} pinned messages`}
        >
          <span className="hidden sm:inline">View all</span>
          <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px]">{pinCount}</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
