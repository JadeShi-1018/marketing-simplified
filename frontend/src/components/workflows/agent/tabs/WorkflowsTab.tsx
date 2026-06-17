"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, GitBranch, Loader2, Plus, Search } from "lucide-react"
import toast from "react-hot-toast"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import type { AgentWorkflowDefinition } from "@/types/agent"
import WorkflowCard from "../cards/WorkflowCard"
import { useAgentWorkflows } from "../hooks/useAgentWorkflows"
import { brandBtnHeader } from "../workflowBrandClasses"

interface WorkflowsTabProps {
  onCreateClick: () => void
  refreshKey?: number
  onWorkflowCreated?: (id: string) => void
}

export default function WorkflowsTab({ onCreateClick, refreshKey }: WorkflowsTabProps) {
  const {
    activeProject,
    hasHydrated,
    listWorkflows,
    duplicateWorkflow,
    deleteWorkflow,
  } = useAgentWorkflows()

  const [workflows, setWorkflows] = useState<AgentWorkflowDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [deletingWorkflow, setDeletingWorkflow] = useState<AgentWorkflowDefinition | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const needsProject = hasHydrated && !activeProject?.id

  const fetchWorkflows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listWorkflows()
      setWorkflows(data)
    } catch {
      toast.error("Failed to load workflows")
      setWorkflows([])
    } finally {
      setLoading(false)
    }
  }, [listWorkflows])

  useEffect(() => {
    if (!hasHydrated) return
    fetchWorkflows()
  }, [fetchWorkflows, hasHydrated, refreshKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return workflows
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q)
    )
  }, [workflows, search])

  const systemWorkflows = filtered.filter((w) => w.is_system)
  const activeWorkflows = filtered.filter((w) => !w.is_system && w.trigger_config?.trigger_type)
  const allWorkflows = filtered.filter((w) => !w.is_system)
  const defaultSystemWorkflow = systemWorkflows.find((w) => w.is_default) ?? systemWorkflows[0]

  const handleDuplicate = async (workflow: AgentWorkflowDefinition) => {
    if (!activeProject?.id) {
      toast.error("Select a project before duplicating a workflow")
      return
    }
    setDuplicatingId(workflow.id)
    try {
      await duplicateWorkflow(workflow.id)
      toast.success("Workflow duplicated")
      fetchWorkflows()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to duplicate workflow"
      toast.error(msg)
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deletingWorkflow) return
    try {
      await deleteWorkflow(deletingWorkflow.id)
      toast.success("Workflow deleted")
      setDeletingWorkflow(null)
      fetchWorkflows()
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || "Failed to delete workflow"
      toast.error(errorMsg)
    }
  }

  const handleStatusChange = (id: string, newStatus: string) => {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, status: newStatus as AgentWorkflowDefinition["status"] }
          : w
      )
    )
  }

  return (
    <div>
      {/* Sub-header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">My workflows</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {needsProject && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Select an active project to create or duplicate custom workflows.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : workflows.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
            <GitBranch className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">No workflows yet</h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Duplicate the default system pipeline or build your own workflow from scratch.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {defaultSystemWorkflow && (
              <button
                type="button"
                disabled={needsProject || duplicatingId === defaultSystemWorkflow.id}
                onClick={() => handleDuplicate(defaultSystemWorkflow)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {duplicatingId === defaultSystemWorkflow.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Duplicate default
              </button>
            )}
            <button
              type="button"
              disabled={needsProject}
              onClick={onCreateClick}
              className={brandBtnHeader}
            >
              <Plus className="h-4 w-4" />
              Create workflow
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* System workflows section */}
          {systemWorkflows.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                System workflows
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {systemWorkflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    needsProject={needsProject}
                    duplicating={duplicatingId === wf.id}
                    onDuplicate={() => handleDuplicate(wf)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Active workflows section */}
          {activeWorkflows.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Active workflows
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {activeWorkflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    needsProject={needsProject}
                    duplicating={duplicatingId === wf.id}
                    onDuplicate={() => handleDuplicate(wf)}
                    onDelete={() => setDeletingWorkflow(wf)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </section>
          )}

          {/* All workflows section */}
          {allWorkflows.length > 0 ? (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                All workflows
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {allWorkflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    needsProject={needsProject}
                    duplicating={duplicatingId === wf.id}
                    onDuplicate={() => handleDuplicate(wf)}
                    onDelete={() => setDeletingWorkflow(wf)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </section>
          ) : (
            search.trim() === "" && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
                <p className="text-sm text-gray-400">
                  No custom workflows yet.{" "}
                  <button
                    type="button"
                    onClick={onCreateClick}
                    className="font-medium text-indigo-600 hover:underline disabled:opacity-50"
                    disabled={needsProject}
                  >
                    Create one
                  </button>{" "}
                  or duplicate a system workflow.
                </p>
              </div>
            )
          )}

          {/* No search results */}
          {search.trim() !== "" && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
              <p className="text-sm text-gray-400">
                No workflows match &ldquo;{search}&rdquo;.
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingWorkflow}
        title="Delete workflow?"
        message={`"${deletingWorkflow?.name}" will be permanently deleted. This cannot be undone.`}
        confirmText="Delete"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingWorkflow(null)}
      />
    </div>
  )
}
