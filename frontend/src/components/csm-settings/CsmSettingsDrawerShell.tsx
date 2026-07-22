'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/accessibility/useFocusTrap';

const TITLE_ID = 'support-channel-drawer-title';

function isRadixPopoverTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('[data-radix-popper-content-wrapper]'))
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  footer: React.ReactNode;
  children: React.ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement>;
}

export default function CsmSettingsDrawerShell({
  open,
  onClose,
  title,
  footer,
  children,
  returnFocusRef,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  const { handleKeyDown, handleFocusCapture } = useFocusTrap({
    containerRef: panelRef,
    isOpen: open,
    returnFocusRef,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleFocusCaptureWithPopover = (e: React.FocusEvent) => {
    if (isRadixPopoverTarget(e.target)) return;
    handleFocusCapture(e);
  };

  const handleKeyDownWithEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    handleKeyDown(e);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDownWithEscape}
        onFocusCapture={handleFocusCaptureWithPopover}
        className="absolute right-0 top-0 flex h-full w-full max-w-none flex-col overflow-hidden bg-white shadow-2xl animate-csm-drawer-slide-in sm:max-w-2xl sm:rounded-l-xl"
      >
        <div
          className="h-[3px] w-full shrink-0 bg-gradient-to-r from-[#3CCED7] to-[#A6E661]"
          aria-hidden
        />

        <div className="flex shrink-0 items-start justify-between gap-4  px-6 py-4">
          <h2
            id={TITLE_ID}
            className="mb-1.5 block min-w-0 text-[12px] font-medium uppercase tracking-wider text-gray-500"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md  bg-white text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/60 focus-visible:ring-offset-1"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>

        <div className="shrink-0 bg-white px-6 py-4">
          {footer}
        </div>
      </div>

      <style jsx>{`
        @keyframes csmDrawerSlideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        :global(.animate-csm-drawer-slide-in) {
          animation: csmDrawerSlideIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
