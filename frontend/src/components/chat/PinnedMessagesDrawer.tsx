'use client';

import { useState } from 'react';
import { ArrowUpRight, Loader2, Pin, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { PinnedMessageRow } from '@/lib/api/chatApi';

interface PinnedMessagesDrawerProps {
  pins: PinnedMessageRow[];
  canManageChannel: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: number, parentMessageId?: number | null) => void;
  onUnpin: (messageId: number) => Promise<void>;
}

function senderName(pin: PinnedMessageRow) {
  return pin.message.sender?.username || pin.message.sender?.email || 'Unknown';
}

export default function PinnedMessagesDrawer({
  pins,
  canManageChannel,
  onClose,
  onJumpToMessage,
  onUnpin,
}: PinnedMessagesDrawerProps) {
  const [unpinningMessageId, setUnpinningMessageId] = useState<number | null>(null);

  const handleUnpin = async (messageId: number) => {
    setUnpinningMessageId(messageId);
    try {
      await onUnpin(messageId);
    } finally {
      setUnpinningMessageId(null);
    }
  };

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-gray-200 bg-white"
      data-testid="pinned-messages-drawer"
      aria-label="Pinned messages"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
          <Pin className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Pinned messages</h3>
          <p className="text-xs text-gray-500">
            {pins.length} channel highlight{pins.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close pinned messages"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="task-tab-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {pins.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <Pin className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-gray-700">No pinned messages yet</p>
            <p className="mt-1 text-xs leading-5 text-gray-400">
              Channel managers can pin important updates for everyone.
            </p>
          </div>
        ) : (
          <ol className="space-y-2" data-testid="pinned-drawer-list">
            {pins.map((pin, index) => (
              <li
                key={pin.id}
                className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-teal-300 hover:shadow-md"
                data-testid="pinned-drawer-item"
              >
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#3CCED7] to-[#26A8B0]" />
                <button
                  type="button"
                  onClick={() => onJumpToMessage(pin.message.id, pin.message.parent_message_id ?? null)}
                  className="block w-full px-4 pb-3 pt-3 text-left"
                  aria-label={`Jump to pinned message: ${pin.message.content || 'attachment'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">
                      {senderName(pin)}
                    </span>
                    {index === 0 && (
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-700">
                        Latest
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block whitespace-pre-wrap text-sm leading-5 text-gray-800 [overflow-wrap:anywhere]">
                    {pin.message.content || '(attachment)'}
                  </span>
                  <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-teal-700">
                    Jump to message <ArrowUpRight className="h-3 w-3" />
                  </span>
                </button>

                <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50/70 px-4 py-2 text-[10px] text-gray-500">
                  <Pin className="h-3 w-3 shrink-0 text-teal-600" />
                  <span className="min-w-0 flex-1 truncate">
                    {pin.pinned_by
                      ? `Pinned by ${pin.pinned_by.username || pin.pinned_by.email} · `
                      : 'Pinned · '}
                    {format(parseISO(pin.created_at), 'MMM d, yyyy · h:mm a')}
                  </span>
                  {canManageChannel && (
                    <button
                      type="button"
                      onClick={() => void handleUnpin(pin.message.id)}
                      disabled={unpinningMessageId === pin.message.id}
                      className="shrink-0 rounded px-1.5 py-1 font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label={`Unpin message: ${pin.message.content || 'attachment'}`}
                    >
                      {unpinningMessageId === pin.message.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : 'Unpin'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
