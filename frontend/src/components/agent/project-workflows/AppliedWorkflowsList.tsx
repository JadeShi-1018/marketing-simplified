"use client"

import { useEffect, useState } from "react"
import { Plus, Loader2, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentProjectWorkflowBinding, AgentWorkflowTemplate } from "@/types/agent"
import { WorkflowBindingCard } from "./WorkflowBindingCard"
import { ApplyTemplateModal } from "./ApplyTemplateModal"
import { EditTriggerModal } from "./EditTriggerModal"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { dispatchBindingsChanged } from "@/lib/agentEvents"

interface AppliedWorkflowsListProps {
  projectId: string
}

export function AppliedWorkflowsList({ projectId }: AppliedWorkflowsListProps) {
  const [bindings, setBindings] = useState<AgentProjectWorkflowBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [editingBinding, setEditingBinding] = useState<AgentProjectWorkflowBinding | null>(null)
  const [removingBindingId, setRemovingBindingId] = useState<string | null>(null)
  const [setDefaultBindingId, setSetDefaultBindingId] = useState<string | null>(null)

  const fetchBindings = async () => {
    setLoading(true)
    try {
      const data = await AgentAPI.listProjectBindings(projectId, false)
      setBindings(data as AgentProjectWorkflowBinding[])
    } catch (error) {
      toast.error("Failed to load workflow bindings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBindings()
  }, [projectId])

  const handleApplyTemplate = async (template: AgentWorkflowTemplate, triggerData: {
    trigger_mode: string
    trigger_keywords?: string[]
    priority: number
    is_default: boolean
  }) => {
    try {
      await AgentAPI.createProjectBinding(projectId, {
        template_id: template.id,
        ...triggerData,
      })
      toast.success(`Applied template "${template.name}" to this project`)
      fetchBindings()
      dispatchBindingsChanged()
      setShowApplyModal(false)
    } catch (error: any) {
      toast.error(error.response?.data?.template?.[0] || "Failed to apply template")
    }
  }

  const handleEditTrigger = async (bindingId: string, data: {
    trigger_mode?: string
    trigger_keywords?: string[]
    priority?: number
    is_default?: boolean
  }) => {
    try {
      await AgentAPI.updateProjectBinding(projectId, bindingId, data)
      toast.success("Trigger conditions updated")
      fetchBindings()
      dispatchBindingsChanged()
      setEditingBinding(null)
    } catch (error) {
      toast.error("Failed to update trigger conditions")
    }
  }

  const handleRemoveBinding = async () => {
    if (!removingBindingId) return

    try {
      await AgentAPI.deleteProjectBinding(projectId, removingBindingId)
      toast.success("Workflow binding removed")
      fetchBindings()
      dispatchBindingsChanged()
    } catch (error) {
      toast.error("Failed to remove binding")
    } finally {
      setRemovingBindingId(null)
    }
  }

  const handleSetDefault = async () => {
    if (!setDefaultBindingId) return

    try {
      await AgentAPI.updateProjectBinding(projectId, setDefaultBindingId, {
        is_default: true,
      })
      toast.success("Default workflow updated")
      fetchBindings()
      dispatchBindingsChanged()
    } catch (error) {
      toast.error("Failed to set default workflow")
    } finally {
      setSetDefaultBindingId(null)
    }
  }

  const currentDefault = bindings.find(b => b.is_default)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-card-foreground">Applied Workflows</h2>
        <Button onClick={() => setShowApplyModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Apply Template
        </Button>
      </div>

      {bindings.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Workflow className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-medium text-card-foreground mb-1">
            No workflows configured
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Apply a template to configure how the AI Agent handles this project
          </p>
          <Button onClick={() => setShowApplyModal(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Apply Your First Template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {bindings.map(binding => (
            <WorkflowBindingCard
              key={binding.id}
              binding={binding}
              onEdit={setEditingBinding}
              onRemove={setRemovingBindingId}
              onSetDefault={setSetDefaultBindingId}
            />
          ))}
        </div>
      )}

      {/* Apply Template Modal */}
      <ApplyTemplateModal
        open={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        onApply={handleApplyTemplate}
        projectId={projectId}
        existingBindings={bindings}
      />

      {/* Edit Trigger Modal */}
      {editingBinding && (
        <EditTriggerModal
          open={!!editingBinding}
          onClose={() => setEditingBinding(null)}
          binding={editingBinding}
          onSave={(data) => handleEditTrigger(editingBinding.id, data)}
          currentDefault={currentDefault}
        />
      )}

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!removingBindingId}
        title="Remove Workflow Binding?"
        message="This will stop the Agent from using this workflow template for this project. You can re-apply it later if needed."
        type="warning"
        confirmText="Remove"
        onConfirm={handleRemoveBinding}
        onCancel={() => setRemovingBindingId(null)}
      />

      {/* Set Default Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!setDefaultBindingId}
        title="Switch Default Workflow?"
        message={
          currentDefault
            ? `Current default: ${currentDefault.template_detail?.name}. This workflow will be used when no trigger conditions match.`
            : "This workflow will be used when no trigger conditions match."
        }
        type="info"
        confirmText="Set as Default"
        onConfirm={handleSetDefault}
        onCancel={() => setSetDefaultBindingId(null)}
      />
    </div>
  )
}
