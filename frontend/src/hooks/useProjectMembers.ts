'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectAPI, type ProjectMemberData } from '@/lib/api/projectApi';

interface UseProjectMembersResult {
  members: ProjectMemberData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useProjectMembers(projectId: number | string | null | undefined): UseProjectMembersResult {
  const [members, setMembers] = useState<ProjectMemberData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestProjectIdRef = useRef<number | string | null>(null);

  const fetchMembers = useCallback(async () => {
    // Slug ids are strings; guard empty/null and any non-positive legacy numeric id.
    if (
      projectId == null ||
      projectId === '' ||
      (typeof projectId === 'number' && projectId <= 0)
    ) {
      setMembers([]);
      return;
    }

    latestProjectIdRef.current = projectId;
    setIsLoading(true);
    setError(null);

    try {
      const result = await ProjectAPI.getAllProjectMembers(projectId);
      // Only apply if this is still the latest request
      if (latestProjectIdRef.current === projectId) {
        setMembers(result);
      }
    } catch (err: any) {
      if (latestProjectIdRef.current === projectId) {
        setError(err?.message || 'Failed to load members');
        setMembers([]);
      }
    } finally {
      if (latestProjectIdRef.current === projectId) {
        setIsLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return { members, isLoading, error, refetch: fetchMembers };
}
