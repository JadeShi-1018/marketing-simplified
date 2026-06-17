'use client';

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ProjectAPI, ProjectData } from '@/lib/api/projectApi';
import { useProjectStore } from '@/lib/projectStore';

export type ProjectFilter = 'all' | 'active' | 'completed';
export type DerivedProjectStatus = 'active' | 'completed' | 'open';

const getErrorMessage = (error: any): string => {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    'Failed to load projects'
  );
};

export const deriveProjectStatus = (
  project: ProjectData,
  activeProjectIds: (number | string)[] = [],
  inactiveProjectIds: (number | string)[] = [],
  completedProjectIds: (number | string)[] = []
): DerivedProjectStatus => {
  const isCompletedLocal = completedProjectIds.some((id) => String(id) === String(project.id));
  const isManuallyInactive = inactiveProjectIds.some((id) => String(id) === String(project.id));
  const isActiveLocal = activeProjectIds.some((id) => String(id) === String(project.id));

  if (isCompletedLocal) {
    return 'completed';
  }

  if (isManuallyInactive) {
    if (project.status === 'completed' || project.status === 'archived' || (project as any)?.is_deleted) {
      return 'completed';
    }
    return 'open';
  }

  if (isActiveLocal || project.is_active) {
    return 'active';
  }

  if (project.status === 'completed' || project.status === 'archived' || (project as any)?.is_deleted) {
    return 'completed';
  }
  return 'open';
};

export const useProjects = () => {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingProjectId, setUpdatingProjectId] = useState<number | string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<number | string | null>(null);
  const {
    activeProject,
    activeProjectIds,
    inactiveProjectIds,
    completedProjectIds,
    setActiveProject: setStoreActiveProject,
    setActiveProjectIds,
    toggleActiveProjectId,
    addInactiveProjectId,
    setInactiveProjectIds,
    toggleCompletedProjectId,
    setCompletedProjectIds,
  } = useProjectStore();

  const fetchProjects = useCallback(
    async (options?: { activeOnly?: boolean }) => {
      setLoading(true);
      const activeProjectIdAtRequestStart = useProjectStore.getState().activeProject?.id ?? null;
      try {
        const data = await ProjectAPI.getProjects(options);
        const list = Array.isArray(data) ? data : [];
        setProjects(list);

        // Use current store state to merge active IDs without causing dependency loops
        const {
          activeProject: latestStoreActiveProject,
          inactiveProjectIds: inactiveIds,
          activeProjectIds: activeIds,
        } = useProjectStore.getState();
        const latestActiveProjectId = latestStoreActiveProject?.id ?? null;
        const activeChangedDuringRequest = latestActiveProjectId !== activeProjectIdAtRequestStart;
        const apiActiveIds = list
          .filter((item) => item.is_active && !inactiveIds.some((id) => String(id) === String(item.id)))
          .map((item) => item.id);
        const apiActiveProject =
          list.find((item) => item.is_active && !inactiveIds.some((id) => String(id) === String(item.id))) ?? null;
        const latestStoreActiveProjectFromList = latestActiveProjectId
          ? list.find((item) => String(item.id) === String(latestActiveProjectId)) ?? null
          : null;

        if (activeChangedDuringRequest && latestActiveProjectId) {
          setActiveProjectIds([latestActiveProjectId]);
        } else if (apiActiveIds.length > 0) {
          setActiveProjectIds((prev) => Array.from(new Set([...prev, ...apiActiveIds, ...activeIds])));
        }
        if (activeChangedDuringRequest && latestStoreActiveProjectFromList) {
          setStoreActiveProject(latestStoreActiveProjectFromList);
        } else if (apiActiveProject) {
          setStoreActiveProject(apiActiveProject);
        } else if (latestStoreActiveProjectFromList) {
          setStoreActiveProject(latestStoreActiveProjectFromList);
        }
        // Capture backend-completed flags if present
        const apiCompletedIds = list
          .filter((item: any) => item.status === 'completed' || item.status === 'archived' || item.is_deleted)
          .map((item) => item.id);
        if (apiCompletedIds.length > 0) {
          setCompletedProjectIds((prev) => Array.from(new Set([...prev, ...apiCompletedIds])));
        }
        setError(null);
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [setActiveProjectIds, setCompletedProjectIds, setStoreActiveProject]
  );

  const setActiveProject = useCallback(
    async (projectId: number | string, isCurrentlyActive: boolean) => {
      // Toggle off locally if already active
      if (isCurrentlyActive) {
        toggleActiveProjectId(projectId);
        addInactiveProjectId(projectId);
        setProjects((prev) =>
          prev.map((project) =>
            String(project.id) === String(projectId)
              ? { ...project, is_active: false, isActiveResolved: false, derivedStatus: 'open' }
              : project
          )
        );
        return false;
      }

      setUpdatingProjectId(projectId);
      try {
        const selectedProject =
          projects.find((project) => String(project.id) === String(projectId)) ?? null;

        // Project detail/action routes are slug-only; send slug, fall back to id (legacy).
        await ProjectAPI.setActiveProject(selectedProject?.slug ?? projectId);
        toast.success('Active project updated');
        setProjects((prev) =>
          prev.map((project) => ({
            ...project,
            is_active: String(project.id) === String(projectId),
            isActiveResolved: String(project.id) === String(projectId),
          }))
        );
        if (selectedProject) {
          setStoreActiveProject({ ...selectedProject, is_active: true });
        }
        setActiveProjectIds([projectId]);
        setInactiveProjectIds((prev) => prev.filter((id) => String(id) !== String(projectId)));
        await fetchProjects();
        return true;
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setUpdatingProjectId(null);
      }
    },
    [
      projects,
      fetchProjects,
      setStoreActiveProject,
      setActiveProjectIds,
      toggleActiveProjectId,
      addInactiveProjectId,
      setInactiveProjectIds,
    ]
  );

  const deleteProject = useCallback(
    async (projectId: number | string) => {
      setDeletingProjectId(projectId);
      try {
        const remainingProjects = projects.filter((project) => String(project.id) !== String(projectId));
        const nextActiveProject =
          String(activeProject?.id) === String(projectId) ? remainingProjects[0] ?? null : null;

        // Project routes are slug-only; resolve slug from the loaded list (fall back to id).
        const deleteTarget = projects.find((project) => String(project.id) === String(projectId));
        await ProjectAPI.deleteProject(deleteTarget?.slug ?? projectId);
        let nextProjects = remainingProjects;

        setCompletedProjectIds((prev) => prev.filter((id) => String(id) !== String(projectId)));

        if (nextActiveProject) {
          try {
            await ProjectAPI.setActiveProject(nextActiveProject.slug ?? nextActiveProject.id);
            nextProjects = remainingProjects.map((project) => ({
              ...project,
              is_active: String(project.id) === String(nextActiveProject.id),
              isActiveResolved: String(project.id) === String(nextActiveProject.id),
            }));
            setStoreActiveProject({ ...nextActiveProject, is_active: true });
            setActiveProjectIds([nextActiveProject.id]);
            setInactiveProjectIds((prev) =>
              prev.filter((id) => String(id) !== String(projectId) && String(id) !== String(nextActiveProject.id))
            );
          } catch {
            setStoreActiveProject(null);
            setActiveProjectIds((prev) => prev.filter((id) => String(id) !== String(projectId)));
            setInactiveProjectIds((prev) => prev.filter((id) => String(id) !== String(projectId)));
            toast.error('Project deleted, but failed to set a new active project.');
          }
        } else {
          setActiveProjectIds((prev) => prev.filter((id) => String(id) !== String(projectId)));
          setInactiveProjectIds((prev) => prev.filter((id) => String(id) !== String(projectId)));
          if (String(activeProject?.id) === String(projectId)) {
            setStoreActiveProject(null);
          }
        }

        setProjects(nextProjects);
        toast.success('Project deleted');
      } catch (err: any) {
        const status = err?.response?.status;
        const message =
          status === 403 || status === 401
            ? 'You do not have permission to delete this project.'
            : getErrorMessage(err);
        toast.error(message);
      } finally {
        setDeletingProjectId(null);
      }
    },
    [projects, activeProject?.id, setStoreActiveProject, setActiveProjectIds, setInactiveProjectIds, setCompletedProjectIds]
  );

  const derivedProjects = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        derivedStatus: deriveProjectStatus(project, activeProjectIds, inactiveProjectIds, completedProjectIds),
        isActiveResolved:
          (!inactiveProjectIds.some((id) => String(id) === String(project.id)) &&
            (activeProjectIds.some((id) => String(id) === String(project.id)) || !!project.is_active)) ||
          false,
        isCompletedResolved:
          completedProjectIds.some((id) => String(id) === String(project.id)) ||
          project.status === 'completed' ||
          project.status === 'archived' ||
          (project as any)?.is_deleted ||
          false,
      })),
    [projects, activeProjectIds, inactiveProjectIds, completedProjectIds]
  );

  return {
    projects: derivedProjects,
    loading,
    error,
    updatingProjectId,
    activeProjectIds,
    inactiveProjectIds,
    fetchProjects,
    setActiveProject,
    deletingProjectId,
    deleteProject,
    toggleCompletedProjectId,
    completedProjectIds,
  };
};
