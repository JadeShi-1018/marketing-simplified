import type { QuickStartConfirmRequest, QuickStartModuleKey } from '@/types/quickStart';
import type { QuickStartPreviewPayload, QuickStartWizardState } from './types';

/** All Quick Start module keys (MVP + optional). Defaults for decisions/miro remain false. */
export const QUICK_START_MODULE_KEYS: QuickStartModuleKey[] = [
  'tasks',
  'spreadsheet',
  'calendar',
  'decisions',
  'miro',
];

/** @deprecated Use QUICK_START_MODULE_KEYS */
export const QUICK_START_MVP_MODULE_KEYS = QUICK_START_MODULE_KEYS;

export function hasEnabledQuickStartModule(
  modules: QuickStartWizardState['selectedModules']
): boolean {
  return QUICK_START_MODULE_KEYS.some((key) => modules[key]);
}

export function validateQuickStartConfirm(
  preview: QuickStartPreviewPayload | null,
  state: QuickStartWizardState
): string | null {
  if (!preview?.blueprint) {
    return 'Generate a preview before creating the project.';
  }
  if (!state.projectTitle.trim()) {
    return 'Project title is required.';
  }
  if (!hasEnabledQuickStartModule(state.selectedModules)) {
    return 'Select at least one module to create.';
  }
  return null;
}

export function buildQuickStartConfirmRequest(
  preview: QuickStartPreviewPayload,
  state: QuickStartWizardState
): QuickStartConfirmRequest {
  const title = state.projectTitle.trim();
  return {
    blueprint: preview.blueprint,
    project_title: title,
    selected_modules: state.selectedModules,
  };
}
