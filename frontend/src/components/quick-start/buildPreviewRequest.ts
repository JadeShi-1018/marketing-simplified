import type { QuickStartPreviewRequest } from '@/types/quickStart';
import type { QuickStartWizardChips, QuickStartWizardState } from './types';

const CHANNEL_SLUGS: Record<string, string> = {
  Meta: 'meta',
  'Google Ads': 'google_ads',
  TikTok: 'tiktok',
  LinkedIn: 'linkedin',
  Programmatic: 'programmatic_dsp',
};

const OBJECTIVE_SLUGS: Record<string, string> = {
  Awareness: 'awareness',
  Consideration: 'consideration',
  Conversion: 'conversion',
  Retention: 'retention_loyalty',
};

export function buildQuickStartChipsPayload(
  chips: QuickStartWizardChips
): Record<string, unknown> | undefined {
  const payload: Record<string, unknown> = {};
  if (chips.channels.length > 0) {
    payload.channels = chips.channels.map((label) => CHANNEL_SLUGS[label] ?? label);
  }
  if (chips.objectives.length > 0) {
    payload.objectives = chips.objectives.map((label) => OBJECTIVE_SLUGS[label] ?? label);
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function buildQuickStartPreviewRequest(
  state: QuickStartWizardState,
  step: 1 | 2
): QuickStartPreviewRequest {
  const prompt = state.prompt.trim();
  const chips = buildQuickStartChipsPayload(state.chips);

  const base: QuickStartPreviewRequest = {
    step,
    prompt,
    selected_modules: state.selectedModules,
  };

  if (chips) {
    base.chips = chips;
  }

  if (step === 2) {
    const supplement = state.supplement.trim();
    base.supplement = supplement || null;
  }

  return base;
}
