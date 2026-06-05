/** Query value for Quick Start exit → reopen create-project chooser on select-project. */
export const QUICK_START_FROM_CREATE_PROJECT = 'create-project';

export const SELECT_PROJECT_CREATE_CHOOSER_PARAM = 'create=chooser';

export function quickStartPathWithCreateProjectReturn(): string {
  return `/projects/quick-start?from=${QUICK_START_FROM_CREATE_PROJECT}`;
}

export function selectProjectPathWithCreateChooser(): string {
  return `/select-project?${SELECT_PROJECT_CREATE_CHOOSER_PARAM}`;
}

export function resolveQuickStartExitPath(from: string | null): string {
  if (from === QUICK_START_FROM_CREATE_PROJECT) {
    return selectProjectPathWithCreateChooser();
  }
  return '/select-project';
}
