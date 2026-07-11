'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuthStore } from '@/lib/authStore';
import {
  ProjectAPI,
  ProjectData,
} from '@/lib/api/projectApi';
import { useProjectStore } from '@/lib/projectStore';

interface OnboardingContextValue {
  needsOnboarding: boolean;
  checking: boolean;
  fetchError: string | null;
  projects: ProjectData[];
  activeProject: ProjectData | null;
  refreshProjects: () => Promise<void>;
  markCompleted: (project: ProjectData | null) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export const OnboardingProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, initialized, loading } = useAuthStore();
  const {
    projects,
    activeProject,
    setProjects,
    setActiveProject,
    setLoading,
    setError,
    clearProjects,
  } = useProjectStore();

  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const refreshRequestIdRef = useRef(0);

  const normalizeProjects = (data: unknown): ProjectData[] => {
    if (Array.isArray(data)) return data as ProjectData[];
    if (data && typeof data === 'object' && Array.isArray((data as any).results)) {
      return (data as any).results as ProjectData[];
    }
    return [];
  };

  const evaluateProjects = useCallback(
    (
      rawProjects: any,
      pendingInviteCount: number,
      options?: { preferLatestActive?: boolean; skipOnboardingDecision?: boolean }
    ) => {
      const list = normalizeProjects(rawProjects);
      setProjects(list);

      if (list.length === 0) {
        // When skipOnboardingDecision is true, the caller (refreshProjects) has
        // already set needsOnboarding from the dedicated onboarding-status API.
        // We only fall back to the old pending-invite heuristic if the caller
        // didn't supply an authoritative answer.
        if (!options?.skipOnboardingDecision) {
          setNeedsOnboarding(pendingInviteCount === 0);
        }
        setActiveProject(null);
        return;
      }

      const backendActive = list.find((project) => project.is_active);
      const latestActiveProjectId = useProjectStore.getState().activeProject?.id;
      const latestActive = latestActiveProjectId
        ? list.find((project) => project.id === latestActiveProjectId)
        : null;
      const nextActive = options?.preferLatestActive
        ? latestActive || backendActive || list[0]
        : backendActive || latestActive || list[0];

      setActiveProject(nextActive);
      if (!options?.skipOnboardingDecision) {
        setNeedsOnboarding(false);
      }
    },
    [setActiveProject, setNeedsOnboarding, setProjects]
  );

  const refreshProjects = useCallback(async () => {
    if (!isAuthenticated) {
      refreshRequestIdRef.current += 1;
      setNeedsOnboarding(false);
      setFetchError(null);
      setLoading(false);
      return;
    }

    setChecking(true);
    setLoading(true);
    const requestId = ++refreshRequestIdRef.current;
    const activeProjectIdAtRequestStart = useProjectStore.getState().activeProject?.id ?? null;

    try {
      const [onboardingStatus, projectList, invitations] = await Promise.all([
        ProjectAPI.getOnboardingStatus(),
        ProjectAPI.getProjects(),
        ProjectAPI.getMyPendingInvitations().catch(() => []),
      ]);
      if (requestId !== refreshRequestIdRef.current) return;

      // Onboarding is driven by org membership, not by the project list.
      // A user in an org but with no projects yet (e.g. waiting for a project
      // invite) should NOT be pushed into the onboarding wizard.
      setNeedsOnboarding(onboardingStatus.needs_onboarding);

      const pendingCount = Array.isArray(invitations) ? invitations.length : 0;
      const latestActiveProjectId = useProjectStore.getState().activeProject?.id ?? null;
      evaluateProjects(projectList, pendingCount, {
        preferLatestActive: latestActiveProjectId !== activeProjectIdAtRequestStart,
        // When user has an org but no projects, don't trigger onboarding
        // (evaluateProjects would set needsOnboarding=true for empty lists without this)
        skipOnboardingDecision: true,
      });
      setFetchError(null);
      setError(null);
    } catch (error: any) {
      if (requestId !== refreshRequestIdRef.current) return;

      const message = error?.response?.data?.error || 'Failed to load projects';
      setFetchError(message);
      setError(message);
      // On error, don't block the UI with onboarding unless we know for sure
      // there's no org — leave needsOnboarding as its current value.
    } finally {
      if (requestId !== refreshRequestIdRef.current) return;

      setChecking(false);
      setLoading(false);
    }
  }, [evaluateProjects, isAuthenticated, setError, setLoading, setNeedsOnboarding]);

  useEffect(() => {
    if (!initialized || loading) return;

    if (!isAuthenticated) {
      setNeedsOnboarding(false);
      setFetchError(null);
      setLoading(false);
      setError(null);
      clearProjects();
      return;
    }

    refreshProjects();
  }, [
    initialized,
    loading,
    isAuthenticated,
    refreshProjects,
    clearProjects,
    setError,
    setFetchError,
    setLoading,
    setNeedsOnboarding,
  ]);

  const markCompleted = useCallback(
    (project: ProjectData | null) => {
      if (project) {
        const baseList = Array.isArray(projects) ? projects : [];
        const updatedList = baseList.filter((existing) => existing.id !== project.id);
        updatedList.unshift(project);
        setProjects(updatedList);
        setActiveProject(project);
        setNeedsOnboarding(false);
        setFetchError(null);
      } else {
        setNeedsOnboarding(false);
      }
    },
    [projects, setActiveProject, setFetchError, setNeedsOnboarding, setProjects]
  );

  const value = useMemo(
    () => ({
      needsOnboarding,
      checking,
      fetchError,
      projects,
      activeProject,
      refreshProjects,
      markCompleted,
    }),
    [
      needsOnboarding,
      checking,
      fetchError,
      projects,
      activeProject,
      refreshProjects,
      markCompleted,
    ]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = (): OnboardingContextValue => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
