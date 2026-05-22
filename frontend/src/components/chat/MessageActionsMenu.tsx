'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  MoreHorizontal,
  Smile,
  TextQuote,
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

interface MessageActionsMenuProps {
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

export default function MessageActionsMenu({
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
}: MessageActionsMenuProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);

  const handleDropdownOpenChange = (open: boolean) => {
    setIsDropdownOpen(open);
    // If closing dropdown, also close emoji picker
    if (!open) {
      setIsEmojiOpen(false);
    }
    onMenuOpenChange?.(open || isEmojiOpen);
  };

  const handleEmojiOpenChange = (open: boolean) => {
    setIsEmojiOpen(open);
    onMenuOpenChange?.(open || isDropdownOpen);
  };

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    onEmojiReaction(emojiData.emoji);
    setIsEmojiOpen(false);
    setIsDropdownOpen(false);
    onMenuOpenChange?.(false);
  };

  const handleAction = (action: () => void) => {
    action();
    setIsDropdownOpen(false);
    onMenuOpenChange?.(false);
  };

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="p-0.5 hover:bg-gray-200 rounded transition-colors"
          title="More actions"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isOwnMessage ? 'end' : 'start'}
        sideOffset={4}
        className="w-44 z-[10001]"
      >
        {/* Emoji Reaction - opens emoji picker */}
        <Popover open={isEmojiOpen} onOpenChange={handleEmojiOpenChange}>
          <PopoverTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault(); // Prevent dropdown from closing
                setIsEmojiOpen(true);
              }}
            >
              <Smile className="w-4 h-4 mr-2" />
              Add Reaction
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-auto p-0 border-0 bg-transparent shadow-none z-[10002]"
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

        <DropdownMenuItem onSelect={() => handleAction(onQuoteReply)}>
          <TextQuote className="w-4 h-4 mr-2" />
          Quote Reply
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => handleAction(onForward)}>
          <Forward className="w-4 h-4 mr-2" />
          Forward
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleAction(onRemind)}>
          <Bell className="w-4 h-4 mr-2" />
          Remind
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleAction(onMultiSelect)}>
          <CheckSquare className="w-4 h-4 mr-2" />
          Select
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Revoke - only for own messages */}
        {isOwnMessage && (
          <DropdownMenuItem
            onSelect={() => handleAction(onRevoke)}
            className="text-amber-600 focus:text-amber-600"
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Revoke
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onSelect={() => handleAction(onDelete)}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
