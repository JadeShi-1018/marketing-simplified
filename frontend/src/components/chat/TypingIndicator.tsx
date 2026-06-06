'use client';

import { useChatStore } from '@/lib/chatStore';
import type { Chat } from '@/types/chat';

interface TypingIndicatorProps {
  chat: Chat;
  currentUserId: number | null;
}

function formatTypingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${
    names.length - 2 === 1 ? '' : 's'
  } are typing…`;
}

const EMPTY_IDS: number[] = [];

export default function TypingIndicator({ chat, currentUserId }: TypingIndicatorProps) {
  const typingUserIds = useChatStore((s) => s.typingUsersByChat[chat.id] ?? EMPTY_IDS);

  const otherTypingIds = currentUserId
    ? typingUserIds.filter((id) => id !== currentUserId)
    : typingUserIds;

  if (otherTypingIds.length === 0) return null;

  const names = otherTypingIds
    .map((id) => chat.participants?.find((p) => p.user.id === id)?.user?.username)
    .filter((n): n is string => Boolean(n));

  if (names.length === 0) return null;

  return (
    <div
      className="flex h-6 flex-shrink-0 items-center gap-1.5 border-t border-gray-100 bg-white px-4 text-xs italic text-gray-500"
      data-testid="messages-typing-indicator"
      aria-live="polite"
    >
      <span className="flex gap-0.5">
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-gray-400" />
      </span>
      <span className="truncate">{formatTypingLabel(names)}</span>
    </div>
  );
}
