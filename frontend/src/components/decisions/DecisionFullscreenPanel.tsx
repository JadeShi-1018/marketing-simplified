'use client';

import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  title: string;
  children: React.ReactNode;
  /** Left sidebar + tree split (children should be two flex children) */
  splitLayout?: boolean;
}

export default function DecisionFullscreenPanel({
  open,
  onClose,
  onBack,
  title,
  children,
  splitLayout = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-gray-50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              title="Back"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fullscreen"
          title="Close (Esc)"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {splitLayout ? (
          <div className="flex h-full min-h-0 overflow-hidden">{children}</div>
        ) : (
          <div className="relative h-full p-4">
            <div className="relative h-full w-full overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
              {children}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
