import { DEFAULT_QUICK_START_SELECTED_MODULES } from '@/types/quickStart';
import type { QuickStartWizardState, QuickStartWizardStep } from './types';

/** Matches backend quick_start.constants input limits. */
export const QUICK_START_MIN_PROMPT_LENGTH = 10;
export const QUICK_START_MAX_PROMPT_LENGTH = 3000;
export const QUICK_START_MAX_SUPPLEMENT_LENGTH = 2000;
export const QUICK_START_MAX_COMBINED_LENGTH = 5000;

export const QUICK_START_WIZARD_STEPS: QuickStartWizardStep[] = [
  {
    id: 'prompt',
    title: 'Describe your campaign',
    description:
      'Tell us about the market, channels, budget, and timeline. We will draft tasks, budget, calendar, decisions, and planning boards.',
  },
  {
    id: 'supplement',
    title: 'Add optional context',
    description:
      'Share audience notes, creative constraints, or reporting cadence. You can skip this step.',
  },
  {
    id: 'preview',
    title: 'Review your project draft',
    description:
      'Preview what we will create. Adjust the project title and modules before confirming.',
  },
];

export const CHANNEL_CHIP_OPTIONS = [
  'Meta',
  'Google Ads',
  'TikTok',
  'LinkedIn',
  'Programmatic',
] as const;

export const OBJECTIVE_CHIP_OPTIONS = [
  'Awareness',
  'Consideration',
  'Conversion',
  'Retention',
] as const;

export const INITIAL_QUICK_START_WIZARD_STATE: QuickStartWizardState = {
  prompt: '',
  supplement: '',
  chips: { channels: [], objectives: [] },
  projectTitle: '',
  selectedModules: { ...DEFAULT_QUICK_START_SELECTED_MODULES },
};
