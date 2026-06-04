'use client';

import { Textarea } from '@/components/ui/textarea';
import { getQuickStartMaxSupplementLength } from '../inputLimits';
import type { QuickStartWizardState } from '../types';

const SUPPLEMENT_PLACEHOLDER =
  'Optional — audience, budget, timeline, KPIs, creative constraints, reporting cadence, brand guidelines. Skip if your prompt already covers everything.';

type QuickStartSupplementStepProps = {
  state: QuickStartWizardState;
  onChange: (patch: Partial<QuickStartWizardState>) => void;
};

export default function QuickStartSupplementStep({
  state,
  onChange,
}: QuickStartSupplementStepProps) {
  const promptTrimmedLength = state.prompt.trim().length;
  const supplementTrimmedLength = state.supplement.trim().length;
  const maxSupplementLength = getQuickStartMaxSupplementLength(promptTrimmedLength);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <span className="font-medium text-gray-900">Your prompt: </span>
        {state.prompt.trim() || '—'}
      </div>

      <div>
        <label
          htmlFor="quick-start-supplement"
          className="block text-sm font-medium text-gray-800 mb-2"
        >
          Additional context
        </label>
        <Textarea
          id="quick-start-supplement"
          value={state.supplement}
          onChange={(event) =>
            onChange({
              supplement: event.target.value.slice(0, maxSupplementLength),
            })
          }
          placeholder={SUPPLEMENT_PLACEHOLDER}
          maxLength={maxSupplementLength}
          rows={5}
          className="resize-y min-h-[120px]"
        />
        <p className="mt-2 text-xs text-gray-500">
          {supplementTrimmedLength.toLocaleString()} / {maxSupplementLength.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
