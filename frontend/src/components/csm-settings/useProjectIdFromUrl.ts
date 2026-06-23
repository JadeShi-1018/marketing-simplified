'use client';

import { useProjectStore } from '@/lib/projectStore';

export function useProjectIdFromUrl(): { projectId: number; projectValid: boolean } {
  const activeProject = useProjectStore((s) => s.activeProject);
  const projectId = Number(activeProject?.id ?? 0);
  const projectValid = Number.isFinite(projectId) && projectId > 0;
  return { projectId, projectValid };
}
