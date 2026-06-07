'use client';

import { useEffect, useState } from 'react';
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
        icon: <Zap className="h-8 w-8 text-orange-500" />,
        title: 'Monthly quota exceeded',
        body: "You've used all your tokens for this month. Upgrade your plan to keep working without interruption.",
        cta: 'Upgrade plan',
      };
    case 'SINGLE_CALL_TOO_LARGE':
      return {
        icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
        title: 'Request too large',
        body: 'This request is too large for your current plan. Please shorten your input and try again, or upgrade your plan for higher per-call limits.',
        cta: 'Upgrade plan',
      };
    case 'PROJECT_HAS_NO_ORG':
      return {
        icon: <Link2Off className="h-8 w-8 text-red-500" />,
        title: 'Project not linked to an organization',
        body: "This project isn't linked to an organization. Please contact your admin to fix the configuration.",
        cta: null,
      };
  }
}

export default function UpgradeModal() {
  const [code, setCode] = useState<QuotaErrorCode | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (
        detail.code === 'TOKEN_QUOTA_EXCEEDED' ||
        detail.code === 'SINGLE_CALL_TOO_LARGE' ||
        detail.code === 'PROJECT_HAS_NO_ORG'
      ) {
        setCode(detail.code as QuotaErrorCode);
      }
    };
    window.addEventListener('quota:error', handler);
    return () => window.removeEventListener('quota:error', handler);
  }, []);

  if (!code) return null;

  const { icon, title, body, cta } = getConfig(code);

  const handleClose = () => setCode(null);

  const handleUpgrade = () => {
    setCode(null);
    router.push('/plans');
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          {icon}
          <h2 id="upgrade-modal-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <p className="text-sm text-gray-600">{body}</p>

          <div className="mt-4 flex w-full flex-col gap-2">
            {cta !== null ? (
              <>
                <button
                  onClick={handleUpgrade}
                  className="w-full rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90"
                >
                  {cta}
                </button>
                <button
                  onClick={handleClose}
                  className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                onClick={handleClose}
                className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
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
