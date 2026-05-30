'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Smile,
  TextQuote,
  MoreHorizontal,
  Forward,
  Bell,
  CheckSquare,
  Undo2,
  Trash2,
} from 'lucide-react';
import type { Message } from '@/types/chat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Dynamic import emoji picker to avoid SSR issues
const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => (
    <div className="w-72 h-80 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3CCED7]" />
    </div>
  ),
});

interface MessageHoverActionsProps {
  message: Message;
  isOwnMessage: boolean;
  onEmojiReaction: (emoji: string) => void;
  onQuoteReply: () => void;
  onForward: () => void;
  onRemind: () => void;
  onMultiSelect: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onMenuOpenChange?: (isOpen: boolean) => void;
}

export default function MessageHoverActions({
  message,
  isOwnMessage,
  onEmojiReaction,
  onQuoteReply,
  onForward,
  onRemind,
  onMultiSelect,
  onRevoke,
  onDelete,
  onMenuOpenChange,
}: MessageHoverActionsProps) {
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleEmojiOpenChange = (open: boolean) => {
    setIsEmojiOpen(open);
    onMenuOpenChange?.(open || isDropdownOpen);
  };

  const handleDropdownOpenChange = (open: boolean) => {
    setIsDropdownOpen(open);
    onMenuOpenChange?.(open || isEmojiOpen);
  };

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    onEmojiReaction(emojiData.emoji);
    setIsEmojiOpen(false);
    onMenuOpenChange?.(false);
  };

  // Position the toolbar close to the bubble
  // Own messages (bubble on right, max-w-88%): toolbar at ~10% from left
  // Others' messages (bubble on left): toolbar at ~10% from right
  const positionClass = isOwnMessage
    ? 'left-[10%]' // Near where the right-aligned bubble starts
    : 'right-[10%]'; // Near where the left-aligned bubble ends

  return (
    <div
      className={`
        absolute top-0
        ${positionClass}
        flex items-center gap-0.5
        bg-white/95 backdrop-blur-sm
        rounded-lg shadow-md border border-gray-200
        px-1 py-0.5
        z-[10000]
      `}
    >
      {/* Emoji Reaction Button */}
      <Popover open={isEmojiOpen} onOpenChange={handleEmojiOpenChange}>
        <PopoverTrigger asChild>
          <button
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Add reaction"
          >
            <Smile className="w-4 h-4 text-gray-500" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={8}
          className="w-auto p-0 border-0 bg-transparent shadow-none z-[10001]"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            width={280}
            height={320}
            searchPlaceHolder="Search emoji..."
            previewConfig={{ showPreview: false }}
          />
        </PopoverContent>
      </Popover>

      {/* Quote Reply Button */}
      <button
        onClick={onQuoteReply}
        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
        title="Quote reply"
      >
        <TextQuote className="w-4 h-4 text-gray-500" />
      </button>

      {/* More Actions Dropdown */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="w-40 z-[10001]">
          <DropdownMenuItem onClick={onForward}>
            <Forward className="w-4 h-4 mr-2" />
            Forward
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRemind}>
            <Bell className="w-4 h-4 mr-2" />
            Remind
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMultiSelect}>
            <CheckSquare className="w-4 h-4 mr-2" />
            Select
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Revoke - only for own messages */}
          {isOwnMessage && (
            <DropdownMenuItem
              onClick={onRevoke}
              className="text-amber-600 focus:text-amber-600"
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Revoke
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={onDelete}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
