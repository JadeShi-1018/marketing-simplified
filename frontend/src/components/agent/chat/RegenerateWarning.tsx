'use client';

import { RefreshCw } from 'lucide-react';

interface RegenerateWarningProps {
  isOpen: boolean;
  estimatedTokens?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RegenerateWarning({
  isOpen,
  estimatedTokens = 500,
  onConfirm,
  onCancel,
}: RegenerateWarningProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw className="h-8 w-8 text-orange-400" />
          <h2 className="text-lg font-semibold text-gray-900">Regenerate project draft?</h2>
          <p className="text-sm text-gray-600">
            Regenerating will use approximately{' '}
            <span className="font-medium">~{estimatedTokens.toLocaleString()} tokens</span> from
            your monthly quota.
          </p>

          <div className="mt-2 flex w-full flex-col gap-2">
            <button
              onClick={onConfirm}
              className="w-full rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Regenerate
            </button>
            <button
              onClick={onCancel}
              className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
