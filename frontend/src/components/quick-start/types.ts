import type {
  QuickStartBlueprint,
  QuickStartOutline,
  QuickStartSelectedModules,
} from '@/types/quickStart';

export type QuickStartWizardStepId = 'prompt' | 'supplement' | 'preview';

export type QuickStartWizardStep = {
  id: QuickStartWizardStepId;
  title: string;
  description: string;
};

export type QuickStartWizardChips = {
  channels: string[];
  objectives: string[];
};

export type QuickStartWizardState = {
  prompt: string;
  supplement: string;
  chips: QuickStartWizardChips;
  projectTitle: string;
  selectedModules: QuickStartSelectedModules;
};

export type QuickStartPreviewPayload = {
  outline: QuickStartOutline;
  blueprint: QuickStartBlueprint;
};
