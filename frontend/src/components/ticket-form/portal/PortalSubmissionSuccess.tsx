'use client';

import { Check } from 'lucide-react';
import { PORTAL_SUBMIT_BUTTON_CLASS } from '../constants';

interface Props {
  onSubmitAnother: () => void;
}

export default function PortalSubmissionSuccess({ onSubmitAnother }: Props) {
  return (
    <div
      className="flex flex-col items-center px-4 py-8 text-center sm:py-12"
      data-testid="portal-submission-success"
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[#71AF44]"
        aria-hidden
      >
        <Check className="h-8 w-8 text-[#0065D1]" strokeWidth={3} />
      </div>

      <h2 className="mt-6 text-2xl font-bold text-gray-900">We&apos;re on it!</h2>
      <p className="mt-2 text-sm text-gray-600">Thanks for your response.</p>

      <button
        type="button"
        onClick={onSubmitAnother}
        className={`mt-8 ${PORTAL_SUBMIT_BUTTON_CLASS}`}
      >
        Submit another form
      </button>
    </div>
  );
}
