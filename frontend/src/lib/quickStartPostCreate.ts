import type { QuickStartConfirmSummary } from '@/types/quickStart';
import type { QuickStartSelectedModules } from '@/types/quickStart';

const STORAGE_KEY = 'mediajira.quick_start.post_create_guide';
const PROGRESS_KEY = 'mediajira.quick_start.post_create_progress';

export interface QuickStartPostCreateGuide {
  projectId: number;
  projectName: string;
  summary: QuickStartConfirmSummary;
  enabledModules: QuickStartSelectedModules;
  spreadsheetId: number | null;
  miroBoardId: string | null;
  createdAt: number;
}

export interface QuickStartChecklistProgress {
  projectId: number;
  completedStepIds: string[];
}

export function saveQuickStartPostCreateGuide(guide: QuickStartPostCreateGuide): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(guide));
    sessionStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ projectId: guide.projectId, completedStepIds: [] })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readQuickStartPostCreateGuide(): QuickStartPostCreateGuide | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuickStartPostCreateGuide;
    if (!parsed?.projectId || !parsed?.projectName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearQuickStartPostCreateGuide(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

export function readQuickStartChecklistProgress(
  projectId: number
): QuickStartChecklistProgress {
  if (typeof window === 'undefined') {
    return { projectId, completedStepIds: [] };
  }
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return { projectId, completedStepIds: [] };
    const parsed = JSON.parse(raw) as QuickStartChecklistProgress;
    if (parsed?.projectId !== projectId || !Array.isArray(parsed.completedStepIds)) {
      return { projectId, completedStepIds: [] };
    }
    return parsed;
  } catch {
    return { projectId, completedStepIds: [] };
  }
}

export function markQuickStartChecklistStepComplete(
  projectId: number,
  stepId: string
): string[] {
  if (typeof window === 'undefined') return [];
  const progress = readQuickStartChecklistProgress(projectId);
  if (progress.completedStepIds.includes(stepId)) {
    return progress.completedStepIds;
  }
  const completedStepIds = [...progress.completedStepIds, stepId];
  try {
    sessionStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ projectId, completedStepIds })
    );
  } catch {
    // ignore
  }
  return completedStepIds;
}

export function shouldShowQuickStartPostCreateGuide(
  activeProjectId: number | null | undefined
): QuickStartPostCreateGuide | null {
  const guide = readQuickStartPostCreateGuide();
  if (!guide || !activeProjectId) return null;
  if (guide.projectId !== activeProjectId) return null;
  return guide;
}
