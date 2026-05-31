'use client';

import { Textarea } from '@/components/ui/textarea';
import {
  CHANNEL_CHIP_OPTIONS,
  OBJECTIVE_CHIP_OPTIONS,
  QUICK_START_MAX_PROMPT_LENGTH,
  QUICK_START_MIN_PROMPT_LENGTH,
} from '../constants';
import type { QuickStartWizardChips, QuickStartWizardState } from '../types';

type QuickStartPromptStepProps = {
  state: QuickStartWizardState;
  onChange: (patch: Partial<QuickStartWizardState>) => void;
};

function toggleChip(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function QuickStartPromptStep({ state, onChange }: QuickStartPromptStepProps) {
  const updateChips = (patch: Partial<QuickStartWizardChips>) => {
    onChange({ chips: { ...state.chips, ...patch } });
  };

  const promptLength = state.prompt.trim().length;
  const charsRemaining = Math.max(0, QUICK_START_MIN_PROMPT_LENGTH - promptLength);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="quick-start-prompt" className="block text-sm font-medium text-gray-800 mb-2">
          Campaign prompt
        </label>
        <Textarea
          id="quick-start-prompt"
          value={state.prompt}
          onChange={(event) =>
            onChange({ prompt: event.target.value.slice(0, QUICK_START_MAX_PROMPT_LENGTH) })
          }
          placeholder="Example: US Meta Q2 awareness campaign, $30k/month for 6 weeks, prospecting and retargeting…"
          maxLength={QUICK_START_MAX_PROMPT_LENGTH}
          rows={6}
          className="resize-y min-h-[140px]"
        />
        <p className="mt-2 text-xs text-gray-500">
          {charsRemaining > 0
            ? `${charsRemaining} more character${charsRemaining === 1 ? '' : 's'} needed (min ${QUICK_START_MIN_PROMPT_LENGTH}).`
            : `${promptLength.toLocaleString()} / ${QUICK_START_MAX_PROMPT_LENGTH.toLocaleString()}`}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-800 mb-2">Channels (optional)</p>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_CHIP_OPTIONS.map((channel) => {
            const selected = state.chips.channels.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                onClick={() =>
                  updateChips({
                    channels: toggleChip(state.chips.channels, channel),
                  })
                }
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  selected
                    ? 'border-[#3CCED7] bg-[#3CCED7]/10 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {channel}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-800 mb-2">Objectives (optional)</p>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVE_CHIP_OPTIONS.map((objective) => {
            const selected = state.chips.objectives.includes(objective);
            return (
              <button
                key={objective}
                type="button"
                onClick={() =>
                  updateChips({
                    objectives: toggleChip(state.chips.objectives, objective),
                  })
                }
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  selected
                    ? 'border-[#A6E661] bg-[#A6E661]/15 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {objective}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
