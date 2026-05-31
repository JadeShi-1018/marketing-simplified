'use client';

import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { QuickStartWizardStep } from './types';

type QuickStartShellProps = {
  step: QuickStartWizardStep;
  stepIndex: number;
  totalSteps: number;
  children: ReactNode;
  errorMessage?: string | null;
  onExit: () => void;
  onBack?: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
  showBack?: boolean;
  showSecondary?: boolean;
  isSubmitting?: boolean;
};

export default function QuickStartShell({
  step,
  stepIndex,
  totalSteps,
  children,
  errorMessage,
  onExit,
  onBack,
  onPrimary,
  onSecondary,
  primaryLabel = 'Next',
  secondaryLabel = 'Skip',
  primaryDisabled = false,
  secondaryDisabled = false,
  showBack = false,
  showSecondary = false,
  isSubmitting = false,
}: QuickStartShellProps) {
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto">
      <div className="absolute -top-10 left-6 text-xs text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#3CCED7]" />
        Quick Start
      </div>

      <div className="bg-white shadow-2xl rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-8 pt-8 pb-4 border-b border-gray-100 bg-gradient-to-r from-[#3CCED7]/5 via-white to-[#A6E661]/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-gray-500">
                Step {stepIndex + 1} of {totalSteps}
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mt-1">{step.title}</h1>
              <p className="text-gray-600 mt-1">{step.description}</p>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
              aria-label="Exit Quick Start"
            >
              <X className="w-4 h-4" />
              Exit
            </button>
          </div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="px-8 py-6 space-y-4">
          {children}
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="px-8 py-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3 bg-gray-50">
          <div className="flex items-center gap-3">
            {showBack && onBack ? (
              <button
                type="button"
                onClick={onBack}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-70"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : null}

            {showSecondary && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                disabled={isSubmitting || secondaryDisabled}
                className="text-sm font-medium text-gray-700 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-70"
              >
                {secondaryLabel}
              </button>
            ) : null}

            {onPrimary ? (
              <button
                type="button"
                onClick={onPrimary}
                disabled={isSubmitting || primaryDisabled}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-br from-[#3CCED7] to-[#A6E661] rounded-lg hover:opacity-90 disabled:opacity-70"
              >
                {isSubmitting ? 'Working…' : primaryLabel}
                {!isSubmitting ? <ArrowRight className="w-4 h-4" /> : null}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
