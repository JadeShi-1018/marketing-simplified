"use client"

import { useCallback, useMemo } from "react"
import { useProjectStore } from "@/lib/projectStore"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentWorkflowDefinition } from "@/types/agent"

export function useAgentWorkflowProjectParams() {
  const activeProject = useProjectStore((s) => s.activeProject)
  const hasHydrated = useProjectStore((s) => s.hasHydrated)

  const projectParams = useMemo(
    () => (activeProject?.id ? { project_id: activeProject.id } : undefined),
    [activeProject?.id]
  )

  return { activeProject, hasHydrated, projectParams }
}

export function useAgentWorkflows() {
  const { activeProject, hasHydrated, projectParams } = useAgentWorkflowProjectParams()

  const listWorkflows = useCallback(async (): Promise<AgentWorkflowDefinition[]> => {
    return AgentAPI.listWorkflows(projectParams)
  }, [projectParams])

  const createWorkflow = useCallback(
    async (data: { name: string; description?: string; status?: string }) => {
      if (!projectParams) {
        throw new Error("Select a project before creating a workflow.")
      }
      return AgentAPI.createWorkflow(data, projectParams)
    },
    [projectParams]
  )

  const duplicateWorkflow = useCallback(
    async (workflowId: string, name?: string) => {
      if (!projectParams) {
        throw new Error("Select a project before duplicating a workflow.")
      }
      return AgentAPI.duplicateWorkflow(workflowId, name ? { name } : undefined, projectParams)
    },
    [projectParams]
  )

  const deleteWorkflow = useCallback(
    async (workflowId: string) => {
      return AgentAPI.deleteWorkflow(workflowId, projectParams)
    },
    [projectParams]
  )

  return {
    activeProject,
    hasHydrated,
    projectParams,
    listWorkflows,
    createWorkflow,
    duplicateWorkflow,
    deleteWorkflow,
  }
}
