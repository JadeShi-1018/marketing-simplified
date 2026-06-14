'use client';

import { useSearchParams } from 'next/navigation';

export function useProjectIdFromUrl(): { projectId: number; projectValid: boolean } {
  const searchParams = useSearchParams();
  const projectId = Number(searchParams.get('project'));
  const projectValid = Number.isFinite(projectId) && projectId > 0;
  return { projectId, projectValid };
}
