"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  FileText,
  GripVertical,
  ListPlus,
  Lock,
  Plus,
  Save,
} from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentAPI } from "@/lib/api/agentApi"
import { cn } from "@/lib/utils"
import type { AgentWorkflowDefinition, AgentWorkflowStep } from "@/types/agent"
import { CreateTemplateModal } from "@/components/agent/templates/CreateTemplateModal"
import { StepEditorPanel } from "./StepEditorPanel"
import { getDefaultStepName, getStepTypeLabel } from "./stepConfig/stepTypeMeta"
import { validateStepConfig } from "./stepConfig/StepConfigForm"
import { DEFAULT_PIPELINE_STEPS } from "./stepConfig/workflowPresets"
import { useAgentWorkflowProjectParams } from "./hooks/useAgentWorkflows"
import { WorkflowRunHistoryPanel } from "./WorkflowRunHistoryPanel"

interface WorkflowEditorPageProps {
  workflowId: string
  onBack: () => void
  onUpdate?: (wf: AgentWorkflowDefinition) => void
}

export function WorkflowEditorPage({ workflowId, onBack, onUpdate }: WorkflowEditorPageProps) {
  const { projectParams } = useAgentWorkflowProjectParams()
  const [workflow, setWorkflow] = useState<AgentWorkflowDefinition | null>(null)
  const [steps, setSteps] = useState<AgentWorkflowStep[]>([])
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [wfStatus, setWfStatus] = useState<string>("draft")
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [insertingPipeline, setInsertingPipeline] = useState(false)

  const isSystem = workflow?.is_system ?? false
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

  const loadWorkflow = useCallback(async () => {
    setLoading(true)
    try {
      const wf = await AgentAPI.getWorkflow(workflowId, projectParams)
      setWorkflow(wf)
      setName(wf.name)
      setDescription(wf.description)
      setWfStatus(wf.status)
      const loadedSteps = wf.steps || []
      setSteps(loadedSteps)
      setSelectedStepId((prev) => {
        if (prev && loadedSteps.some((s) => s.id === prev)) return prev
        return loadedSteps[0]?.id ?? null
      })
    } catch {
      toast.error("Failed to load workflow")
      setWorkflow(null)
    } finally {
      setLoading(false)
    }
  }, [workflowId, projectParams])

  useEffect(() => {
    loadWorkflow()
  }, [loadWorkflow])

  const validateForActivate = (): string | null => {
    if (steps.length === 0) return "Add at least one step before activating."
    for (const step of steps) {
      const err = validateStepConfig(step.step_type, step.config || {})
      if (err) return `${step.name}: ${err}`
    }
    return null
  }

  const handleSaveAsTemplate = async () => {
    if (isSystem || saving) return
    const validationError = validateForActivate()
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSaving(true)
    try {
      const updated = await AgentAPI.updateWorkflow(
        workflowId,
        { name, description, status: "active" },
        projectParams
      )
      setWorkflow(updated)
      setWfStatus("active")
      onUpdate?.(updated)
      setShowTemplateModal(true)
    } catch {
      toast.error("Failed to save workflow before creating template")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMetadata = async (nextStatus?: string) => {
    if (isSystem || saving) return
    const statusToSave = nextStatus ?? wfStatus
    if (statusToSave === "active") {
      const validationError = validateForActivate()
      if (validationError) {
        toast.error(validationError)
        return
      }
    }

    setSaving(true)
    try {
      const updated = await AgentAPI.updateWorkflow(
        workflowId,
        { name, description, status: statusToSave },
        projectParams
      )
      setWorkflow(updated)
      setWfStatus(updated.status)
      onUpdate?.(updated)
      toast.success(nextStatus === "active" ? "Workflow activated" : "Workflow saved")
    } catch {
      toast.error("Failed to save workflow")
    } finally {
      setSaving(false)
    }
  }

  const handleAddStep = async () => {
    if (isSystem) return
    try {
      const stepType = "analyze_data"
      const newStep = await AgentAPI.createStep(
        workflowId,
        { name: getDefaultStepName(stepType), step_type: stepType },
        projectParams
      )
      setSteps((prev) => [...prev, newStep])
      setSelectedStepId(newStep.id)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: Record<string, unknown> } })?.response?.data?.detail ||
        (err as { response?: { data?: { order?: string[] } } })?.response?.data?.order?.[0] ||
        "Failed to add step"
      toast.error(typeof message === "string" ? message : "Failed to add step")
    }
  }

  const handleInsertDefaultPipeline = async () => {
    if (isSystem || insertingPipeline || steps.length > 0) return
    setInsertingPipeline(true)
    try {
      const created: AgentWorkflowStep[] = []
      for (const preset of DEFAULT_PIPELINE_STEPS) {
        const step = await AgentAPI.createStep(
          workflowId,
          {
            name: preset.name,
            step_type: preset.step_type,
            config: preset.config,
          },
          projectParams
        )
        created.push(step)
      }
      setSteps(created)
      setSelectedStepId(created[0]?.id ?? null)
      toast.success("Default pipeline inserted")
    } catch {
      toast.error("Failed to insert default pipeline")
    } finally {
      setInsertingPipeline(false)
    }
  }

  const handleSaveStep = async (
    stepId: string,
    data: Partial<AgentWorkflowStep>
  ) => {
    const updated = await AgentAPI.updateStep(workflowId, stepId, data, projectParams)
    setSteps((prev) => prev.map((s) => (s.id === stepId ? updated : s)))
    toast.success("Step saved")
  }

  const handleDeleteStep = async (stepId: string) => {
    await AgentAPI.deleteStep(workflowId, stepId, projectParams)
    setSteps((prev) => {
      const next = prev.filter((s) => s.id !== stepId)
      if (selectedStepId === stepId) {
        setSelectedStepId(next[0]?.id ?? null)
      }
      return next
    })
    toast.success("Step deleted")
  }

  const handleDragStart = (idx: number) => {
    if (isSystem) return
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) return
    setSteps((prev) => {
      const updated = [...prev]
      const [moved] = updated.splice(dragIdx, 1)
      updated.splice(targetIdx, 0, moved)
      return updated
    })
    setDragIdx(targetIdx)
  }

  const handleDragEnd = async () => {
    if (dragIdx === null || isSystem) return
    setDragIdx(null)
    setSteps((current) => {
      void AgentAPI.reorderSteps(
        workflowId,
        current.map((s) => s.id),
        projectParams
      )
        .then(setSteps)
        .catch(() => {
          toast.error("Failed to reorder steps")
          loadWorkflow()
        })
      return current
    })
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col p-6">
        <Skeleton className="h-9 w-32 mb-6" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 flex-1">
          <Skeleton className="h-full min-h-[320px]" />
          <Skeleton className="h-full min-h-[320px]" />
        </div>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground">Workflow not found</p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-2">
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-foreground">{workflow.name}</h1>
          <p className="text-xs text-muted-foreground">
            {isSystem ? "System workflow (read-only)" : "Edit workflow steps and configuration"}
          </p>
        </div>
        {isSystem ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Read-only
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={handleSaveAsTemplate}
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Save as Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleSaveMetadata("draft")}
            >
              Save draft
            </Button>
            <Button size="sm" disabled={saving} onClick={() => handleSaveMetadata("active")} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Activate"}
            </Button>
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={name}
            disabled={isSystem}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={wfStatus}
            disabled={isSystem}
            onChange={(e) => setWfStatus(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
          <input
            value={description}
            disabled={isSystem}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-[360px] flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Steps</h2>
            {!isSystem && (
              <div className="flex items-center gap-2">
                {steps.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={insertingPipeline}
                    onClick={handleInsertDefaultPipeline}
                    className="h-7 gap-1 text-xs"
                  >
                    <ListPlus className="h-3 w-3" />
                    Insert default pipeline
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleAddStep} className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" />
                  Add Step
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {steps.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No steps defined. Add a step to get started.
              </div>
            ) : (
              steps.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  draggable={!isSystem}
                  onClick={() => setSelectedStepId(step.id)}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border p-2 text-left transition-all",
                    selectedStepId === step.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/30",
                    dragIdx === idx && "opacity-50 border-primary",
                    !isSystem && "cursor-grab active:cursor-grabbing"
                  )}
                >
                  {!isSystem && (
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">{step.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {getStepTypeLabel(step.step_type)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <StepEditorPanel
          step={selectedStep}
          readOnly={isSystem}
          onSave={handleSaveStep}
          onDelete={handleDeleteStep}
        />
      </div>

      <div className="mt-4">
        <WorkflowRunHistoryPanel workflowId={workflowId} />
      </div>

      <CreateTemplateModal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSuccess={() => {
          toast.success("Template created")
          setShowTemplateModal(false)
        }}
        defaultSourceWorkflowId={workflowId}
        defaultName={`${name.trim() || workflow.name} Template`}
        defaultDescription={description.trim() || workflow.description}
        lockSourceWorkflow
      />
    </div>
  )
}
