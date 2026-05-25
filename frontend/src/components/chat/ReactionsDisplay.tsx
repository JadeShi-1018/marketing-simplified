'use client';

import type { Reaction } from '@/types/chat';

interface ReactionsDisplayProps {
  reactions: Reaction[];
  onReactionClick?: (emoji: string, isReactedByMe: boolean) => void;
  align?: 'left' | 'right';
}

export default function ReactionsDisplay({
  reactions,
  onReactionClick,
  align = 'left',
}: ReactionsDisplayProps) {
  if (!reactions || reactions.length === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap gap-1 mt-1 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => onReactionClick?.(reaction.emoji, reaction.reacted_by_me)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
            reaction.reacted_by_me
              ? 'bg-blue-100 border border-blue-300 text-blue-700 hover:bg-blue-200'
              : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200'
          }`}
          title={reaction.users.map((u) => u.username).join(', ')}
        >
          <span className="text-sm">{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}
