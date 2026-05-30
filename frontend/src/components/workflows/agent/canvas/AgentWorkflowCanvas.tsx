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
import { ArrowLeft, Loader2 } from "lucide-react"
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
}

function CanvasInner({ workflowId, workflow }: CanvasInnerProps) {
  const router = useRouter()
  const { fitView } = useReactFlow()
  const { projectParams } = useAgentWorkflowProjectParams()

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  // pickerInsertAfter: index of the step after which to insert (-1 = prepend / empty canvas)
  const [pickerInsertAfter, setPickerInsertAfter] = useState<number | null>(null)

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
        onSelect: () => setSelectedStepId((prev) => (prev === step.id ? null : step.id)),
        onAddAfter: () => setPickerInsertAfter(idx),
        onDelete: () => {
          dispatch({ type: "DELETE", stepId: step.id })
          if (selectedStepId === step.id) setSelectedStepId(null)
        },
      },
    }))

    // Add-node at the end
    nodes.push({
      id: ADD_NODE_ID,
      type: "agentAdd",
      position: { x: steps.length * STEP_X_GAP, y: steps.length === 0 ? 0 : NODE_Y },
      draggable: false,
      selectable: false,
      data: {
        isEmpty: steps.length === 0,
        onClick: () => setPickerInsertAfter(steps.length - 1),
      } satisfies AgentAddNodeData,
    })

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

    // Dashed edge from last step → add-node
    if (steps.length > 0) {
      edges.push({
        id: `e-${steps[steps.length - 1].id}-add`,
        source: steps[steps.length - 1].id,
        target: ADD_NODE_ID,
        type: "smoothstep",
        style: { stroke: "#cbd5e1", strokeWidth: 1.5, strokeDasharray: "5 4" },
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
      const insertAfter = pickerInsertAfter ?? steps.length - 1
      setPickerInsertAfter(null)

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
      setSelectedStepId(tempStep.id)
    },
    [pickerInsertAfter, steps.length, dispatch]
  )

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    save(workflowId, projectParams)
  }, [save, workflowId, projectParams])

  return (
    <div className="relative h-screen w-full bg-slate-100">
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
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#cbd5e1" />
      </ReactFlow>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/workflows")}
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
              workflow.status === "active"
                ? "bg-emerald-100 text-emerald-700"
                : workflow.status === "archived"
                ? "bg-gray-100 text-gray-500"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {workflow.status}
          </span>
        </div>
      </div>

      {/* ── Step picker panel ────────────────────────────────────────────────── */}
      {pickerInsertAfter !== null && (
        <StepPickerPanel
          onSelect={handlePickStep}
          onClose={() => setPickerInsertAfter(null)}
        />
      )}

      {/* ── Step config panel (right side) ──────────────────────────────────── */}
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
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        onSave={handleSave}
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

  useEffect(() => {
    AgentAPI.getWorkflow(workflowId, projectParams)
      .then(setWorkflow)
      .catch(() => toast.error("Failed to load workflow"))
      .finally(() => setLoading(false))
  }, [workflowId, projectParams])

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
      <CanvasInner workflowId={workflowId} workflow={workflow} />
    </ReactFlowProvider>
  )
}
