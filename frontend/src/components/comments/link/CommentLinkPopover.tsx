'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { normalizeCommentLinkUrl } from './commentLinkUtils';

type CommentLinkPopoverProps = {
  initialUrl?: string;
  loading?: boolean;
  submitLabel?: string;
  onSubmit: (url: string) => void;
  onCancel?: () => void;
};

export default function CommentLinkPopover({
  initialUrl = '',
  loading,
  submitLabel = 'Add',
  onSubmit,
  onCancel,
}: CommentLinkPopoverProps) {
  const [value, setValue] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedUrl = useMemo(() => normalizeCommentLinkUrl(value), [value]);

  useEffect(() => {
    setValue(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    // Delay focus until the popover content has mounted and its focus handling has settled.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <form
      className="w-80 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!normalizedUrl || loading) return;
        onSubmit(normalizedUrl);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel?.();
      }}
    >
      <div className="text-xs font-semibold text-gray-700">Paste or search for link</div>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          disabled={loading}
          placeholder="https://example.com"
          className="h-8 w-full rounded border border-gray-300 bg-white px-2 pr-8 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:bg-gray-50"
          onChange={(event) => setValue(event.target.value)}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear link"
            disabled={loading}
            className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none"
            onClick={() => setValue('')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            disabled={loading}
            className="rounded px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!normalizedUrl || loading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:pointer-events-none disabled:bg-gray-200 disabled:text-gray-500',
          )}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {loading ? 'Loading...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
