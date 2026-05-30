"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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
import { AgentAPI } from "@/lib/api/agentApi"
import { cn } from "@/lib/utils"
import type { AgentWorkflowDefinition, AgentWorkflowStep } from "@/types/agent"
import { CreateTemplateModal } from "@/components/agent/templates/CreateTemplateModal"
import { StepEditorPanel } from "@/components/agent/workflow/StepEditorPanel"
import { getDefaultStepName, getStepTypeLabel } from "@/components/agent/workflow/stepConfig/stepTypeMeta"
import { validateStepConfig } from "@/components/agent/workflow/stepConfig/StepConfigForm"
import { DEFAULT_PIPELINE_STEPS } from "@/components/agent/workflow/stepConfig/workflowPresets"
import { WorkflowRunHistoryPanel } from "@/components/agent/workflow/WorkflowRunHistoryPanel"
import { useAgentWorkflowProjectParams } from "./hooks/useAgentWorkflows"
import { WorkflowStatusBadge } from "./WorkflowStatusBadge"

interface AgentWorkflowEditorProps {
  workflowId: string
}

export default function AgentWorkflowEditor({ workflowId }: AgentWorkflowEditorProps) {
  const router = useRouter()
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

  const goBack = () => router.push("/workflows")

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

  const handleSaveStep = async (stepId: string, data: Partial<AgentWorkflowStep>) => {
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
      <div className="min-h-full bg-gray-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl animate-pulse space-y-4">
          <div className="h-8 w-48 rounded-lg bg-gray-200" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-80 rounded-xl bg-gray-200" />
            <div className="h-80 rounded-xl bg-gray-200" />
          </div>
        </div>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Workflow not found</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-3 text-sm font-medium text-[#1a9ba3] hover:underline"
        >
          Back to workflows
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={goBack}
              className="mt-0.5 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-gray-900">{workflow.name}</h1>
                <WorkflowStatusBadge status={workflow.status} />
                {isSystem && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Lock className="h-3 w-3" />
                    Read-only
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                {isSystem
                  ? "System workflow — duplicate to customize for your project"
                  : "Configure steps and activate when ready"}
              </p>
            </div>
          </div>
          {!isSystem && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAsTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                Save as template
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveMetadata("draft")}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveMetadata("active")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#3CCED7] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#35b8c0] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Activate"}
              </button>
            </div>
          )}
        </div>

        <div className="mb-6 grid gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input
              value={name}
              disabled={isSystem}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              value={wfStatus}
              disabled={isSystem}
              onChange={(e) => setWfStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20 disabled:bg-gray-50"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
            <input
              value={description}
              disabled={isSystem}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/20 disabled:bg-gray-50"
            />
          </div>
        </div>

        <div className="grid min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Steps</h2>
              {!isSystem && (
                <div className="flex items-center gap-2">
                  {steps.length === 0 && (
                    <button
                      type="button"
                      disabled={insertingPipeline}
                      onClick={handleInsertDefaultPipeline}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ListPlus className="h-3 w-3" />
                      Insert default pipeline
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    <Plus className="h-3 w-3" />
                    Add step
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {steps.length === 0 ? (
                <p className="py-12 text-center text-xs text-gray-400">
                  No steps yet. Add a step or insert the default pipeline.
                </p>
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
                      "flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors",
                      selectedStepId === step.id
                        ? "border-[#3CCED7] bg-[#3CCED7]/5"
                        : "border-gray-200 bg-white hover:border-gray-300",
                      dragIdx === idx && "opacity-50",
                      !isSystem && "cursor-grab active:cursor-grabbing"
                    )}
                  >
                    {!isSystem && (
                      <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                    )}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {step.name}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {getStepTypeLabel(step.step_type)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <StepEditorPanel
              step={selectedStep}
              readOnly={isSystem}
              onSave={handleSaveStep}
              onDelete={handleDeleteStep}
            />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <WorkflowRunHistoryPanel workflowId={workflowId} />
        </div>
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
