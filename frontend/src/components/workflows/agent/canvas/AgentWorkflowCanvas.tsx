"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow"
import "reactflow/dist/style.css"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, X } from "lucide-react"
import toast from "react-hot-toast"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentWorkflowDefinition, WorkflowStepType } from "@/types/agent"
import { useAgentWorkflowProjectParams } from "../hooks/useAgentWorkflows"
import useCanvasState, { makeTempId } from "./useCanvasState"
import { getStepMeta } from "./canvasStepMeta"
import AgentStepNode, { type AgentStepNodeData } from "./nodes/AgentStepNode"
import AgentAddNode, { type AgentAddNodeData } from "./nodes/AgentAddNode"
import StepPickerPanel from "./panels/StepPickerPanel"
import StepConfigPanel from "./panels/StepConfigPanel"
import CanvasToolbar from "./CanvasToolbar"
import { CreateTemplateModal } from "@/components/agent/templates/CreateTemplateModal"

// ── Unsaved-changes guard dialog ──────────────────────────────────────────────
interface UnsavedChangesDialogProps {
  isSaving: boolean
  onClose: () => void
  onLeave: () => void
  onSave: () => void
}

function UnsavedChangesDialog({ isSaving, onClose, onLeave, onSave }: UnsavedChangesDialogProps) {
  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <h2 className="text-base font-semibold text-slate-800">Unsaved Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          You have unsaved changes. Would you like to save before leaving?
        </p>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={onLeave}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Leave
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── React Flow node type registry ──────────────────────────────────────────────
const nodeTypes = {
  agentStep: AgentStepNode,
  agentAdd: AgentAddNode,
}

// Layout constants
const STEP_X_GAP = 200
const NODE_Y = 0
const ADD_NODE_ID = "__add__"

// ── Inner canvas (needs ReactFlow context) ────────────────────────────────────
interface CanvasInnerProps {
  workflowId: string
  workflow: AgentWorkflowDefinition
  currentStatus: AgentWorkflowDefinition["status"]
  onStatusChange: (status: AgentWorkflowDefinition["status"]) => void
  isUpdatingStatus: boolean
}

function CanvasInner({ workflowId, workflow, currentStatus, onStatusChange, isUpdatingStatus }: CanvasInnerProps) {
  const router = useRouter()
  const { fitView } = useReactFlow()
  const { projectParams } = useAgentWorkflowProjectParams()

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [isSavingAndLeaving, setIsSavingAndLeaving] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  // picker state: insertion index + viewport anchor coordinates
  const [pickerState, setPickerState] = useState<{
    insertAfter: number
    anchorX: number
    anchorY: number
  } | null>(null)

  // Helpers that enforce mutual exclusivity between picker and config panel
  const openPicker = useCallback((insertAfter: number, e: React.MouseEvent) => {
    setSelectedStepId(null)       // close config panel
    setPickerState({ insertAfter, anchorX: e.clientX, anchorY: e.clientY })
  }, [])

  const openConfig = useCallback((stepId: string) => {
    setPickerState(null)          // close picker
    setSelectedStepId((prev) => (prev === stepId ? null : stepId))
  }, [])

  const canvasState = useCanvasState(workflow.steps ?? [])
  const { steps, canUndo, canRedo, isDirty, isSaving, dispatch, save } = canvasState

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

  // ── Derive RF nodes ─────────────────────────────────────────────────────────
  const rfNodes: Node[] = useMemo(() => {
    const nodes: Node[] = steps.map((step, idx): Node<AgentStepNodeData> => ({
      id: step.id,
      type: "agentStep",
      position: { x: idx * STEP_X_GAP, y: NODE_Y },
      draggable: false,
      selectable: false,
      data: {
        step,
        isSelected: selectedStepId === step.id,
        onSelect: () => openConfig(step.id),
        onAddAfter: (e) => openPicker(idx, e),
        onDelete: () => {
          dispatch({ type: "DELETE", stepId: step.id })
          if (selectedStepId === step.id) setSelectedStepId(null)
        },
      },
    }))

    // Add-node only when canvas is empty — acts as the entry-point prompt.
    // When steps exist, the hover "+" on each AgentStepNode covers all insertion cases.
    if (steps.length === 0) {
      nodes.push({
        id: ADD_NODE_ID,
        type: "agentAdd",
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: {
          isEmpty: true,
          onClick: (e) => openPicker(-1, e),
        } satisfies AgentAddNodeData,
      })
    }

    return nodes
  }, [steps, selectedStepId, dispatch])

  // ── Derive RF edges ─────────────────────────────────────────────────────────
  const rfEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []

    for (let i = 0; i < steps.length - 1; i++) {
      const meta = getStepMeta(steps[i].step_type)
      edges.push({
        id: `e-${steps[i].id}-${steps[i + 1].id}`,
        source: steps[i].id,
        target: steps[i + 1].id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: meta.edgeColor, width: 16, height: 16 },
        style: { stroke: meta.edgeColor, strokeWidth: 2 },
      })
    }

    return edges
  }, [steps])

  // ── Fit view when step count changes ───────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.6, duration: 350 }), 80)
    return () => clearTimeout(t)
  }, [steps.length, fitView])

  // ── Add a step (from picker) ────────────────────────────────────────────────
  const handlePickStep = useCallback(
    (type: WorkflowStepType) => {
      const meta = getStepMeta(type)
      const insertAfter = pickerState?.insertAfter ?? steps.length - 1
      setPickerState(null)

      const tempStep = {
        id: makeTempId(),
        name: meta.label,
        step_type: type,
        order: insertAfter + 2,
        config: {},
        _isTemp: true,
        _isDirty: false,
      }

      dispatch({ type: "ADD", step: tempStep, insertAfter })
      // After adding, open the config panel for the new step (picker already closed above)
      openConfig(tempStep.id)
    },
    [pickerState, steps.length, dispatch]
  )

  // ── Back (with unsaved-changes guard) ──────────────────────────────────────
  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true)
    } else {
      router.push("/workflows")
    }
  }, [isDirty, router])

  const handleLeave = useCallback(() => {
    router.push("/workflows")
  }, [router])

  const handleSaveAndLeave = useCallback(async () => {
    setIsSavingAndLeaving(true)
    try {
      await save(workflowId, projectParams)
      router.push("/workflows")
    } catch {
      // save() already shows a toast error; keep dialog open so user can retry
      setIsSavingAndLeaving(false)
    }
  }, [save, workflowId, projectParams, router])

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    save(workflowId, projectParams)
  }, [save, workflowId, projectParams])

  return (
    <div className="relative h-screen w-full bg-slate-100">
      {/* Unsaved-changes dialog */}
      {showUnsavedDialog && (
        <UnsavedChangesDialog
          isSaving={isSavingAndLeaving}
          onClose={() => setShowUnsavedDialog(false)}
          onLeave={handleLeave}
          onSave={handleSaveAndLeave}
        />
      )}

      {/* React Flow canvas */}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.6 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        // Required: React Flow v11 sets pointer-events:none on nodes when
        // nodesDraggable=false AND elementsSelectable=false AND onNodeClick is
        // absent. Providing this handler (even empty) keeps pointer-events:all
        // so buttons inside custom nodes remain interactive.
        onNodeClick={() => {}}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#cbd5e1" />
      </ReactFlow>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="text-sm font-semibold text-slate-800">{workflow.name}</span>
            {isDirty && (
              <span className="ml-2 text-xs font-medium text-amber-500">· Unsaved</span>
            )}
          </div>
        </div>

        <div className="pointer-events-auto">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              currentStatus === "active"
                ? "bg-emerald-100 text-emerald-700"
                : currentStatus === "archived"
                ? "bg-gray-100 text-gray-500"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {currentStatus}
          </span>
        </div>
      </div>

      {/* ── Right side panels (mutually exclusive) ──────────────────────────── */}

      {/* Step picker — floating bubble anchored to the + button */}
      {pickerState !== null && (
        <StepPickerPanel
          anchorX={pickerState.anchorX}
          anchorY={pickerState.anchorY}
          onSelect={handlePickStep}
          onClose={() => setPickerState(null)}
        />
      )}

      {/* Step config — slides in from the right when a node is selected */}
      {selectedStep && (
        <div className="absolute right-0 top-0 z-20 h-full">
          <StepConfigPanel
            step={selectedStep}
            onClose={() => setSelectedStepId(null)}
            onUpdate={(patch) => dispatch({ type: "UPDATE", stepId: selectedStep.id, patch })}
            onDelete={() => {
              dispatch({ type: "DELETE", stepId: selectedStep.id })
              setSelectedStepId(null)
            }}
          />
        </div>
      )}

      {/* ── Bottom toolbar ───────────────────────────────────────────────────── */}
      <CanvasToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={isDirty}
        isSaving={isSaving}
        currentStatus={currentStatus}
        isUpdatingStatus={isUpdatingStatus}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        onSave={handleSave}
        onStatusChange={onStatusChange}
        onSaveAsTemplate={() => setShowTemplateModal(true)}
      />

      {/* Save as Template modal */}
      <CreateTemplateModal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSuccess={() => {
          setShowTemplateModal(false)
          toast.success("Template created successfully")
        }}
        defaultSourceWorkflowId={workflowId}
        defaultName={workflow.name}
        defaultDescription={workflow.description}
        lockSourceWorkflow
      />
    </div>
  )
}

// ── Loader wrapper ────────────────────────────────────────────────────────────
interface AgentWorkflowCanvasProps {
  workflowId: string
}

export default function AgentWorkflowCanvas({ workflowId }: AgentWorkflowCanvasProps) {
  const { projectParams } = useAgentWorkflowProjectParams()
  const [workflow, setWorkflow] = useState<AgentWorkflowDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStatus, setCurrentStatus] = useState<AgentWorkflowDefinition["status"]>("draft")
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  useEffect(() => {
    AgentAPI.getWorkflow(workflowId, projectParams)
      .then((wf) => {
        setWorkflow(wf)
        setCurrentStatus(wf.status)
      })
      .catch(() => toast.error("Failed to load workflow"))
      .finally(() => setLoading(false))
  }, [workflowId, projectParams])

  const handleStatusChange = useCallback(
    async (status: AgentWorkflowDefinition["status"]) => {
      setIsUpdatingStatus(true)
      try {
        await AgentAPI.updateWorkflow(workflowId, { status }, projectParams)
        setCurrentStatus(status)
        toast.success(`Workflow set to ${status}`)
      } catch {
        toast.error("Failed to update status")
      } finally {
        setIsUpdatingStatus(false)
      }
    },
    [workflowId, projectParams]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-600">Workflow not found.</p>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <CanvasInner
        workflowId={workflowId}
        workflow={workflow}
        currentStatus={currentStatus}
        onStatusChange={handleStatusChange}
        isUpdatingStatus={isUpdatingStatus}
      />
    </ReactFlowProvider>
  )
}
