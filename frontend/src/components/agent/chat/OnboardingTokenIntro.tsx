'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Coins, MessageSquare, BarChart3, Layers, Zap } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';

// Per-user scoped: the seen-flag is keyed by user id so dismissing on a shared
// browser doesn't suppress the intro for every other account. The base (un-scoped)
// key below is the legacy global flag we now purge on mount.
const INTRO_SEEN_KEY_BASE = 'ms-token-billing-intro-seen';

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const slides: Slide[] = [
  {
    icon: <Coins className="h-10 w-10 text-[#3CCED7]" />,
    title: 'Token-based billing',
    body: "Every AI interaction processes tokens — words, punctuation, and context. You're billed by how many tokens your conversations use each month.",
  },
  {
    icon: <MessageSquare className="h-10 w-10 text-[#A6E661]" />,
    title: '~500 tokens per simple message',
    body: 'A short back-and-forth uses roughly 500 tokens. Complex analyses with large datasets or long conversations can use 3 000–10 000 tokens.',
  },
  {
    icon: <BarChart3 className="h-10 w-10 text-[#3CCED7]" />,
    title: 'Free plan: 500K tokens included',
    body: '500K tokens is enough for approximately 100 deep data analyses or 1 000 simple conversations per month — no credit card required.',
  },
  {
    icon: <Layers className="h-10 w-10 text-[#3CCED7]" />,
    title: 'Quota is tracked per Project',
    body: "Your token counter is linked to your active Project, not your user account. If you switch to a different Project, you'll see a separate quota. That's expected — each Project has its own allowance.",
  },
  {
    icon: <Zap className="h-10 w-10 text-[#A6E661]" />,
    title: 'Team plan: 5M tokens + overage',
    body: 'Upgrade to the Team plan for 5 million tokens per month with automatic metered overage — you keep working even after the base quota runs out.',
  },
];

export default function OnboardingTokenIntro() {
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);

  // Only valid once userId resolves; guarded so the key is never `...-seen-undefined`.
  const seenKey = userId ? `${INTRO_SEEN_KEY_BASE}-${userId}` : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Purge the legacy global flag once so a prior dismissal on this browser
    // can't leak across accounts (idempotent — no-op if it's already gone).
    localStorage.removeItem(INTRO_SEEN_KEY_BASE);
    // Wait for userId before deciding visibility; re-runs when seenKey resolves.
    if (!seenKey) return;
    if (!localStorage.getItem(seenKey)) {
      setVisible(true);
    }
  }, [seenKey]);

  const dismiss = useCallback(() => {
    // Write the SAME user-scoped key we read above.
    if (seenKey) localStorage.setItem(seenKey, '1');
    setVisible(false);
  }, [seenKey]);

  // Focus trap + Escape-to-close + initial focus (ports UpgradeModal's pattern).
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
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
  }, [visible, dismiss]);

  if (!visible) return null;

  const current = slides[slide];
  const isLast = slide === slides.length - 1;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 px-4 animate-in fade-in duration-200 ease-out motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-intro-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:animate-none"
      >
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-4 text-center">
          {current.icon}

          <h2 id="token-intro-title" className="text-lg font-semibold text-gray-900">
            {current.title}
          </h2>
          <p className="text-sm leading-relaxed text-gray-600">{current.body}</p>

          {/* Pagination dots */}
          <div className="flex items-center gap-1.5 py-1">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === slide ? 'w-6 bg-[#3CCED7]' : 'w-1.5 bg-gray-300'
                }`}
              />
            ))}
          </div>

          <div className="flex w-full gap-2">
            <button
              onClick={() => setSlide((s) => s - 1)}
              disabled={slide === 0}
              tabIndex={slide === 0 ? -1 : undefined}
              aria-hidden={slide === 0}
              className={`flex-none px-6 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${
                slide === 0 ? 'invisible' : ''
              }`}
            >
              Back
            </button>
            {isLast ? (
              <button
                onClick={dismiss}
                className="flex-1 rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] py-2 text-sm font-semibold text-gray-900 hover:opacity-90"
              >
                Got it
              </button>
            ) : (
              <button
                onClick={() => setSlide((s) => s + 1)}
                className="flex-1 rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] py-2 text-sm font-semibold text-gray-900 hover:opacity-90"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
