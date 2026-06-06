'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  MoreHorizontal,
  Plus,
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

// Default emojis if no recent ones are stored
const DEFAULT_EMOJIS = ['😊', '👍', '❤️', '😂'];
const RECENT_EMOJIS_KEY = 'chat_recent_emojis';
const MAX_RECENT_EMOJIS = 4;

// Get recent emojis from localStorage
function getRecentEmojis(): string[] {
  if (typeof window === 'undefined') return DEFAULT_EMOJIS;
  try {
    const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, MAX_RECENT_EMOJIS);
      }
    }
  } catch (e) {
    console.warn('Failed to parse recent emojis:', e);
  }
  return DEFAULT_EMOJIS;
}

// Save emoji to recent list
function saveRecentEmoji(emoji: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getRecentEmojis();
    // Remove if already exists, then add to front
    const filtered = current.filter((e) => e !== emoji);
    const updated = [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS);
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save recent emoji:', e);
  }
}

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
  const [recentEmojis, setRecentEmojis] = useState<string[]>(DEFAULT_EMOJIS);

  // Load recent emojis on mount
  useEffect(() => {
    setRecentEmojis(getRecentEmojis());
  }, []);

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

  // Handle quick emoji click (from recent emojis row)
  const handleQuickEmojiClick = (emoji: string) => {
    saveRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    onEmojiReaction(emoji);
    setIsDropdownOpen(false);
    setIsEmojiOpen(false);
    onMenuOpenChange?.(false);
  };

  // Handle emoji picker selection
  const handleEmojiPickerClick = (emojiData: { emoji: string }) => {
    saveRecentEmoji(emojiData.emoji);
    setRecentEmojis(getRecentEmojis());
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
        className="w-48 z-[10001]"
        onPointerDownOutside={(e) => {
          // If emoji picker is open, check if click is inside emoji picker
          if (isEmojiOpen) {
            const target = e.target as HTMLElement;
            const emojiPicker = target.closest('.EmojiPickerReact');
            if (emojiPicker) {
              // Click is inside emoji picker, prevent dropdown from closing
              e.preventDefault();
            }
            // Otherwise let both close (click on blank area)
          }
        }}
        onFocusOutside={(e) => {
          // Prevent closing dropdown when focus moves to emoji picker
          if (isEmojiOpen) {
            const target = e.target as HTMLElement;
            const emojiPicker = target.closest('.EmojiPickerReact');
            if (emojiPicker) {
              e.preventDefault();
            }
          }
        }}
      >
        {/* Quick Emoji Reactions Row */}
        <div className="flex items-center gap-1 px-2 py-1.5">
          {recentEmojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              onClick={() => handleQuickEmojiClick(emoji)}
              className="w-8 h-8 flex items-center justify-center text-lg rounded-full hover:bg-gray-100 transition-colors"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          {/* Plus button to open full emoji picker */}
          <Popover open={isEmojiOpen} onOpenChange={handleEmojiOpenChange} modal={false}>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsEmojiOpen(true);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                title="More emojis"
              >
                <Plus className="w-4 h-4 text-gray-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              className="w-auto p-0 border-0 bg-transparent shadow-none z-[10002]"
              onPointerDownOutside={(e) => {
                const target = e.target as HTMLElement;
                const dropdownMenu = target.closest('[data-radix-menu-content]');
                const emojiPicker = target.closest('.EmojiPickerReact');
                if (dropdownMenu || emojiPicker) {
                  // Click is inside dropdown or emoji picker, prevent closing
                  e.preventDefault();
                }
                // Otherwise allow closing (click on blank area)
              }}
              onFocusOutside={(e) => {
                const target = e.target as HTMLElement;
                const dropdownMenu = target.closest('[data-radix-menu-content]');
                if (dropdownMenu) {
                  e.preventDefault();
                }
              }}
            >
              <EmojiPicker
                onEmojiClick={handleEmojiPickerClick}
                width={280}
                height={320}
                searchPlaceHolder="Search emoji..."
                previewConfig={{ showPreview: false }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <DropdownMenuSeparator />

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

        {/* Revoke - only for own messages within 2 minutes */}
        {isOwnMessage && message.can_revoke && (
          <DropdownMenuItem
            onSelect={() => handleAction(onRevoke)}
            className="text-amber-600 focus:text-amber-600"
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Revoke
          </DropdownMenuItem>
        )}

        {/* Delete - own messages become tombstones; others are hidden locally. */}
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
