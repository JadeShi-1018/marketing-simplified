'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle, Zap, Link2Off } from 'lucide-react';

type QuotaErrorCode = 'TOKEN_QUOTA_EXCEEDED' | 'SINGLE_CALL_TOO_LARGE' | 'PROJECT_HAS_NO_ORG';

interface ModalConfig {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string | null;
}

function getConfig(code: QuotaErrorCode): ModalConfig {
  switch (code) {
    case 'TOKEN_QUOTA_EXCEEDED':
      return {
        icon: (
          <div className="rounded-full bg-amber-50 p-3">
            <Zap className="h-8 w-8 text-amber-600" />
          </div>
        ),
        title: 'Monthly quota exceeded',
        body: "You've used all your tokens for this month. Upgrade your plan to keep working without interruption.",
        cta: 'Upgrade plan',
      };
    case 'SINGLE_CALL_TOO_LARGE':
      return {
        icon: (
          <div className="rounded-full bg-amber-50 p-3">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
        ),
        title: 'Request too large',
        body: 'This request is too large for your current plan. Please shorten your input and try again, or upgrade your plan for higher per-call limits.',
        cta: 'Upgrade plan',
      };
    case 'PROJECT_HAS_NO_ORG':
      return {
        icon: (
          <div className="rounded-full bg-red-50 p-3">
            <Link2Off className="h-8 w-8 text-red-500" />
          </div>
        ),
        title: 'Project not linked to an organization',
        body: "This project isn't linked to an organization. Please contact your admin to fix the configuration.",
        cta: null,
      };
  }
}

export default function UpgradeModal() {
  const [code, setCode] = useState<QuotaErrorCode | null>(null);
  const [closing, setClosing] = useState(false);
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (
        detail.code === 'TOKEN_QUOTA_EXCEEDED' ||
        detail.code === 'SINGLE_CALL_TOO_LARGE' ||
        detail.code === 'PROJECT_HAS_NO_ORG'
      ) {
        // A re-fired quota error must win over any in-flight close animation,
        // otherwise the stale close timer unmounts the re-opened modal.
        clearCloseTimer();
        setClosing(false);
        setCode(detail.code as QuotaErrorCode);
      }
    };
    window.addEventListener('quota:error', handler);
    return () => {
      window.removeEventListener('quota:error', handler);
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  // Fade out before unmounting; duration matches the transition classes below.
  const handleClose = useCallback(() => {
    clearCloseTimer();
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      setCode(null);
    }, 200);
  }, [clearCloseTimer]);

  // Navigate first — the close animation must never pre-empt the action.
  const handleUpgrade = useCallback(() => {
    router.push('/subscription');
    handleClose();
  }, [router, handleClose]);

  // Focus trap + Escape-to-close
  useEffect(() => {
    if (!code) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>('button')?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [code, handleClose]);

  if (!code) return null;

  const { icon, title, body, cta } = getConfig(code);

  // z-layer scale (shared across the app's overlay surfaces):
  //   z-[100]    tooltips / popovers (e.g. PlanCard feature tooltip)
  //   z-50       in-page modals (ConfirmModal, InviteMembersModal)
  //   z-[10001]  global interrupt modals (this quota modal — must beat app chrome)
  //   z-[10002]  onboarding intro (sits above the quota modal)
  return (
    <div
      className={`fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 animate-in fade-in duration-200 ease-out transition-opacity motion-reduce:animate-none motion-reduce:transition-none ${
        closing ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        className={`relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out transition-[opacity,transform] motion-reduce:animate-none motion-reduce:transition-none ${
          closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-1"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-4 text-center">
          {icon}
          <h2 id="upgrade-modal-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <p className="text-sm text-gray-600">{body}</p>

          <div className="mt-2 flex w-full flex-col gap-3">
            {cta !== null ? (
              <>
                <button
                  onClick={handleUpgrade}
                  className="w-full rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:ring-offset-1"
                >
                  {cta}
                </button>
                <button
                  onClick={handleClose}
                  className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                onClick={handleClose}
                className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-1"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
