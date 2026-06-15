"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Copy,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import type { AgentWorkflowDefinition } from "@/types/agent"
import { CreateWorkflowModal } from "./CreateWorkflowModal"
import { WorkflowEditorPage } from "./WorkflowEditorPage"
import { useAgentWorkflows } from "./hooks/useAgentWorkflows"

type StatusFilter = "all" | AgentWorkflowDefinition["status"]

function StatusBadge({ status }: { status: AgentWorkflowDefinition["status"] }) {
  const colors = {
    active: "bg-emerald-500/10 text-emerald-600",
    draft: "bg-amber-500/10 text-amber-700",
    archived: "bg-muted text-muted-foreground",
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status]}`}>
      {status}
    </span>
  )
}

function WorkflowRow({
  workflow,
  onEdit,
  onDuplicate,
  onDelete,
  duplicateDisabled,
}: {
  workflow: AgentWorkflowDefinition
  onEdit: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  duplicateDisabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted/20">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{workflow.name}</span>
          {workflow.is_system && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              System
            </span>
          )}
          <StatusBadge status={workflow.status} />
        </div>
        {workflow.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{workflow.description}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {workflow.step_count ?? 0} steps
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {workflow.is_system ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={duplicateDisabled}
            onClick={onDuplicate}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function WorkflowListPage() {
  const {
    activeProject,
    hasHydrated,
    listWorkflows,
    createWorkflow,
    duplicateWorkflow,
    deleteWorkflow,
  } = useAgentWorkflows()

  const [workflows, setWorkflows] = useState<AgentWorkflowDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null)
  const [deletingWorkflow, setDeletingWorkflow] = useState<AgentWorkflowDefinition | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

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
  }, [fetchWorkflows, hasHydrated])

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) => {
      const matchesSearch =
        !search.trim() ||
        wf.name.toLowerCase().includes(search.toLowerCase()) ||
        wf.description?.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === "all" || wf.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [workflows, search, statusFilter])

  const systemWorkflows = filteredWorkflows.filter((w) => w.is_system)
  const myWorkflows = filteredWorkflows.filter((w) => !w.is_system)
  const defaultSystemWorkflow = systemWorkflows.find((w) => w.is_default) || systemWorkflows[0]
  const needsProject = hasHydrated && !activeProject?.id

  const handleCreate = async (data: { name: string; description?: string }) => {
    const created = await createWorkflow({ ...data, status: "draft" })
    toast.success("Workflow created")
    await fetchWorkflows()
    setEditingWorkflowId(created.id)
  }

  const handleDuplicate = async (workflow: AgentWorkflowDefinition) => {
    if (!activeProject?.id) {
      toast.error("Select a project before duplicating a workflow")
      return
    }
    setDuplicatingId(workflow.id)
    try {
      const created = await duplicateWorkflow(workflow.id)
      toast.success("Workflow duplicated")
      await fetchWorkflows()
      setEditingWorkflowId(created.id)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to duplicate workflow"
      toast.error(message)
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
      await fetchWorkflows()
    } catch {
      toast.error("Failed to delete workflow")
    }
  }

  if (editingWorkflowId) {
    return (
      <WorkflowEditorPage
        workflowId={editingWorkflowId}
        onBack={() => {
          setEditingWorkflowId(null)
          fetchWorkflows()
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Workflows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define step sequences for the AI Agent. Workflows are stored in our backend — no Dify canvas required.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} disabled={needsProject}>
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      {needsProject && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800">
          Select an active project to create or duplicate custom workflows.
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border p-10 text-center">
          <Workflow className="mb-4 h-12 w-12 opacity-30" />
          <h3 className="text-base font-medium text-foreground">No workflows yet</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Start from our default analysis pipeline, or create a blank workflow and add your own steps.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {defaultSystemWorkflow && (
              <Button
                variant="outline"
                disabled={needsProject || duplicatingId === defaultSystemWorkflow.id}
                onClick={() => handleDuplicate(defaultSystemWorkflow)}
              >
                {duplicatingId === defaultSystemWorkflow.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                Duplicate Default Workflow
              </Button>
            )}
            <Button disabled={needsProject} onClick={() => setShowCreateModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Blank Workflow
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 overflow-y-auto">
          {systemWorkflows.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                System Workflows
              </h2>
              {systemWorkflows.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  duplicateDisabled={needsProject || duplicatingId === workflow.id}
                  onDuplicate={() => handleDuplicate(workflow)}
                  onEdit={() => setEditingWorkflowId(workflow.id)}
                />
              ))}
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              My Workflows
            </h2>
            {myWorkflows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No custom workflows yet. Duplicate a system workflow or create a new one.
                </p>
              </div>
            ) : (
              myWorkflows.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  onEdit={() => setEditingWorkflowId(workflow.id)}
                  onDelete={() => setDeletingWorkflow(workflow)}
                />
              ))
            )}
          </section>
        </div>
      )}

      <CreateWorkflowModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />

      <ConfirmDialog
        isOpen={!!deletingWorkflow}
        title="Delete workflow?"
        message={`This will permanently delete "${deletingWorkflow?.name}". This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingWorkflow(null)}
      />
    </div>
  )
}
