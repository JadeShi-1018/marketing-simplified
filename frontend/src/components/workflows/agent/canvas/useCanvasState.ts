"use client"

import { useCallback, useReducer, useState } from "react"
import toast from "react-hot-toast"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentWorkflowStep, WorkflowStepType } from "@/types/agent"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalStep {
  id: string           // real UUID or "temp-<random>" for unsaved steps
  name: string
  step_type: WorkflowStepType
  order: number
  config: Record<string, unknown>
  description?: string
  _isTemp?: boolean    // true → not yet saved to backend
  _isDirty?: boolean   // true → config/name changed from saved version
}

interface CanvasHistory {
  past: LocalStep[][]
  present: LocalStep[]
  future: LocalStep[][]
}

type HistoryAction =
  | { type: "INIT"; steps: AgentWorkflowStep[] }
  | { type: "ADD"; step: LocalStep; insertAfter: number }
  | { type: "DELETE"; stepId: string }
  | { type: "UPDATE"; stepId: string; patch: Partial<Pick<LocalStep, "name" | "config" | "description">> }
  | { type: "REORDER"; fromIdx: number; toIdx: number }
  | { type: "UNDO" }
  | { type: "REDO" }

// ── Helpers ───────────────────────────────────────────────────────────────────

function renumber(steps: LocalStep[]): LocalStep[] {
  return steps.map((s, i) => ({ ...s, order: i + 1 }))
}

function apiToLocal(s: AgentWorkflowStep): LocalStep {
  return { ...s, _isTemp: false, _isDirty: false }
}

function pushHistory(h: CanvasHistory, next: LocalStep[]): CanvasHistory {
  return { past: [...h.past, h.present], present: next, future: [] }
}

let _tempSeq = 0
export function makeTempId(): string {
  return `temp-${++_tempSeq}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(h: CanvasHistory, action: HistoryAction): CanvasHistory {
  switch (action.type) {
    case "INIT":
      return { past: [], present: action.steps.map(apiToLocal), future: [] }

    case "ADD": {
      const next = [...h.present]
      const insertIdx = Math.min(action.insertAfter + 1, next.length)
      next.splice(insertIdx, 0, action.step)
      return pushHistory(h, renumber(next))
    }

    case "DELETE": {
      const next = h.present.filter((s) => s.id !== action.stepId)
      return pushHistory(h, renumber(next))
    }

    case "UPDATE": {
      const next = h.present.map((s) =>
        s.id === action.stepId ? { ...s, ...action.patch, _isDirty: !s._isTemp } : s
      )
      return pushHistory(h, next)
    }

    case "REORDER": {
      const next = [...h.present]
      const [moved] = next.splice(action.fromIdx, 1)
      next.splice(action.toIdx, 0, moved)
      return pushHistory(h, renumber(next))
    }

    case "UNDO":
      if (!h.past.length) return h
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future],
      }

    case "REDO":
      if (!h.future.length) return h
      return {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }

    default:
      return h
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseCanvasStateReturn {
  steps: LocalStep[]
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  isSaving: boolean
  dispatch: React.Dispatch<HistoryAction>
  save: (workflowId: string, projectParams?: { project_id?: string | number }) => Promise<void>
}

/** Tracks which step IDs existed at INIT (real, not temp). */
function useCanvasState(initialSteps: AgentWorkflowStep[]): UseCanvasStateReturn {
  const [history, dispatch] = useReducer(reducer, {
    past: [],
    present: initialSteps.map(apiToLocal),
    future: [],
  })
  const [savedIds] = useState(() => new Set(initialSteps.map((s) => s.id)))
  const [isSaving, setIsSaving] = useState(false)

  const steps = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // isDirty: any temp step, any dirty step, or any deletion compared to savedIds
  const isDirty =
    steps.some((s) => s._isTemp || s._isDirty) ||
    [...savedIds].some((id) => !steps.find((s) => s.id === id))

  const save = useCallback(
    async (workflowId: string, projectParams?: { project_id?: string | number }) => {
      setIsSaving(true)
      try {
        // 1. Delete removed steps (real IDs that are no longer in the list)
        const presentIds = new Set(steps.map((s) => s.id))
        const deletions = [...savedIds].filter(
          (id) => !id.startsWith("temp-") && !presentIds.has(id)
        )
        await Promise.all(
          deletions.map((id) => AgentAPI.deleteStep(workflowId, id, projectParams))
        )

        // 2. Update dirty (non-temp) steps
        await Promise.all(
          steps
            .filter((s) => !s._isTemp && s._isDirty)
            .map((s) =>
              AgentAPI.updateStep(
                workflowId,
                s.id,
                { name: s.name, config: s.config, description: s.description },
                projectParams
              )
            )
        )

        // 3. Create temp steps sequentially (order matters)
        const idMap: Record<string, string> = {}
        for (const s of steps) {
          if (s._isTemp) {
            const created = await AgentAPI.createStep(
              workflowId,
              { name: s.name, step_type: s.step_type, config: s.config },
              projectParams
            )
            idMap[s.id] = created.id
          }
        }

        // 4. Reorder with resolved IDs
        const finalOrder = steps.map((s) => idMap[s.id] ?? s.id)
        if (finalOrder.length > 0) {
          await AgentAPI.reorderSteps(workflowId, finalOrder, projectParams)
        }

        toast.success("Workflow saved")
        // Re-init with fresh data so dirty flags reset
        const fresh = await AgentAPI.getWorkflow(workflowId, projectParams)
        dispatch({ type: "INIT", steps: fresh.steps ?? [] })
      } catch {
        toast.error("Failed to save workflow")
      } finally {
        setIsSaving(false)
      }
    },
    [steps, savedIds]
  )

  return { steps, canUndo, canRedo, isDirty, isSaving, dispatch, save }
}

export default useCanvasState
