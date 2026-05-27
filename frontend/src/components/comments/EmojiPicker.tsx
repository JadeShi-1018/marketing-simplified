'use client';

import EmojiPickerReact, { type EmojiClickData } from 'emoji-picker-react';
import { Smile } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
  iconClassName?: string;
};

export default function EmojiPicker({
  onSelect,
  disabled,
  triggerClassName,
  iconClassName,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <div className="group relative inline-flex">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Emoji"
            disabled={disabled}
            data-active={false}
            className={triggerClassName}
          >
            <Smile className={cn('h-4 w-4', iconClassName)} />
          </Button>
        </PopoverTrigger>
        <span
          className={cn(
            'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100',
            open && 'hidden',
          )}
        >
          Emoji
        </span>
      </div>
      <PopoverContent className="w-auto border-gray-200 p-0" align="start">
        <EmojiPickerReact
          width={292}
          height={340}
          lazyLoadEmojis
          skinTonesDisabled
          previewConfig={{ showPreview: false }}
          style={
            {
              '--epr-emoji-size': '22px',
              '--epr-emoji-padding': '4px',
              '--epr-category-navigation-button-size': '26px',
              '--epr-header-padding': '8px',
            } as CSSProperties
          }
          onEmojiClick={(emoji: EmojiClickData) => {
            onSelect(emoji.emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
