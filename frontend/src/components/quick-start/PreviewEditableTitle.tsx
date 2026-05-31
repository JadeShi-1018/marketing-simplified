'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PreviewEditableTitleProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
};

export function PreviewEditableTitle({
  value,
  onChange,
  ariaLabel,
  className,
}: PreviewEditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed || value;
    setDraft(next);
    if (next !== value) {
      onChange(next);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        aria-label={ariaLabel}
        className={cn(
          'font-medium shadow-none border-[#3CCED7]/35',
          'focus-visible:border-[#3CCED7] focus-visible:ring-[#3CCED7]/40',
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'text-left w-full text-sm font-medium text-gray-900',
        'rounded-md px-2 py-1 -mx-2 transition-[color,background-color,box-shadow] duration-150',
        'hover:bg-gradient-to-r hover:from-[#3CCED7]/10 hover:to-[#A6E661]/18',
        'hover:text-[#0E8A96]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/30 focus-visible:ring-offset-1',
        className
      )}
      aria-label={`${ariaLabel}, click to edit`}
    >
      <span className="block truncate">{value || 'Untitled'}</span>
    </button>
  );
}
