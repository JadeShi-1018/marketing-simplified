'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Bell,
  Bookmark,
  CheckSquare,
  Copy,
  Edit2,
  Forward,
  Link,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Smile,
  TextQuote,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 w-72 items-center justify-center rounded-lg border border-gray-200 bg-white">
      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[#3CCED7]" />
    </div>
  ),
});

interface MessageHoverActionsProps {
  isOwnMessage: boolean;
  onEmojiReaction: (emoji: string) => void;
  onQuoteReply?: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onEdit?: () => void;         // own messages only
  onForward: () => void;
  onPin: () => void;
  onSave: () => void;
  onRemind: () => void;
  onMultiSelect: () => void;
  onReplyInThread?: () => void;
  onRevoke?: () => void;       // own messages only, placeholder
  onDelete?: () => void;       // own messages only
  onMenuOpenChange?: (isOpen: boolean) => void;
}

export default function MessageHoverActions({
  isOwnMessage,
  onEmojiReaction,
  onQuoteReply,
  onCopy,
  onCopyLink,
  onEdit,
  onForward,
  onPin,
  onSave,
  onRemind,
  onMultiSelect,
  onReplyInThread,
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

  return (
    <div className="absolute -top-5 right-2 z-[10000] flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 px-1 py-0.5 shadow-md backdrop-blur-sm">
      {/* React */}
      <Popover open={isEmojiOpen} onOpenChange={handleEmojiOpenChange}>
        <PopoverTrigger asChild>
          <button
            className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
            title="Add reaction"
          >
            <Smile className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={8}
          className="z-[10001] w-auto border-0 bg-transparent p-0 shadow-none"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            width={280}
            height={320}
            searchPlaceHolder="Search emoji…"
            previewConfig={{ showPreview: false }}
          />
        </PopoverContent>
      </Popover>

      {/* Reply in thread */}
      {onReplyInThread && (
        <button
          onClick={onReplyInThread}
          className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
          title="Reply in thread"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      )}

      {/* Quote reply */}
      {onQuoteReply && (
        <button
          onClick={onQuoteReply}
          className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
          title="Reply"
        >
          <TextQuote className="h-4 w-4" />
        </button>
      )}

      {/* More actions */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
            title="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="z-[10001] w-44">
          <DropdownMenuItem onSelect={onCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy text
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyLink}>
            <Link className="mr-2 h-4 w-4" />
            Copy link
          </DropdownMenuItem>
          {isOwnMessage && onEdit && (
            <DropdownMenuItem onSelect={onEdit}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onForward}>
            <Forward className="mr-2 h-4 w-4" />
            Forward
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onPin}>
            <Pin className="mr-2 h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span>Pin to channel</span>
              <span className="text-[11px] font-normal text-gray-400">Highlights for all members</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSave}>
            <Bookmark className="mr-2 h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span>Save for later</span>
              <span className="text-[11px] font-normal text-gray-400">Private bookmark, only you can see it</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRemind}>
            <Bell className="mr-2 h-4 w-4" />
            Remind me
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onMultiSelect}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Select
          </DropdownMenuItem>
          {isOwnMessage && (onRevoke || onDelete) && <DropdownMenuSeparator />}
          {isOwnMessage && onRevoke && (
            <DropdownMenuItem onSelect={onRevoke} className="text-amber-600 focus:text-amber-600">
              <Undo2 className="mr-2 h-4 w-4" />
              Revoke
            </DropdownMenuItem>
          )}
          {isOwnMessage && onDelete && (
            <DropdownMenuItem onSelect={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
