"use client"

import { useCallback, useReducer, useRef } from "react"
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
  | { type: "UPDATE"; stepId: string; patch: Partial<Pick<LocalStep, "name" | "step_type" | "config" | "description">> }
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
  // useRef so we can mutate after each successful save without causing re-renders
  const savedIdsRef = useRef(new Set(initialSteps.map((s) => s.id)))
  const [isSaving, setIsSaving] = useReducer((s: boolean, v: boolean) => v, false)

  const steps = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // isDirty: any temp step, any dirty step, or any deletion compared to savedIds
  const isDirty =
    steps.some((s) => s._isTemp || s._isDirty) ||
    [...savedIdsRef.current].some((id) => !steps.find((s) => s.id === id))

  const save = useCallback(
    async (workflowId: string, projectParams?: { project_id?: string | number }) => {
      setIsSaving(true)
      try {
        // 1. Delete removed steps (real IDs no longer present in local state)
        //    Treat 404 as already-deleted (idempotent) so a stale savedId doesn't abort the save.
        const presentIds = new Set(steps.map((s) => s.id))
        const deletions = [...savedIdsRef.current].filter(
          (id) => !id.startsWith("temp-") && !presentIds.has(id)
        )
        await Promise.all(
          deletions.map((id) =>
            AgentAPI.deleteStep(workflowId, id, projectParams).catch((err) => {
              if (err?.response?.status === 404) return // already gone — fine
              throw err
            })
          )
        )

        // 2. Update dirty (non-temp) steps — includes step_type if it changed
        await Promise.all(
          steps
            .filter((s) => !s._isTemp && s._isDirty)
            .map((s) =>
              AgentAPI.updateStep(
                workflowId,
                s.id,
                { name: s.name, step_type: s.step_type, config: s.config, description: s.description },
                projectParams
              )
            )
        )

        // 3. Create temp steps sequentially (order matters for auto-assigned order)
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

        // 4. Reorder — must include ALL active backend steps (not just canvas steps).
        //    If a delete was 404-ignored, those steps are still active in the backend.
        //    Sending only canvas IDs would cause an order=N conflict → 500.
        const finalOrder = steps.map((s) => idMap[s.id] ?? s.id)
        const fresh = await AgentAPI.getWorkflow(workflowId, projectParams)
        const backendIds = (fresh.steps ?? []).map((s) => s.id)

        if (backendIds.length > 0) {
          // Canvas steps in canvas order → unknown backend-only steps appended at the end
          const canvasPos = new Map(finalOrder.map((id, i) => [id, i]))
          const sortedIds = [...backendIds].sort(
            (a, b) =>
              (canvasPos.get(a) ?? Number.MAX_SAFE_INTEGER) -
              (canvasPos.get(b) ?? Number.MAX_SAFE_INTEGER)
          )
          await AgentAPI.reorderSteps(workflowId, sortedIds, projectParams)
        }

        // 5. Re-fetch fresh state to reset dirty flags (reuse the fetch from step 4)
        // (fresh already fetched above)
        // Update savedIds to reflect the new real IDs
        savedIdsRef.current = new Set((fresh.steps ?? []).map((s) => s.id))
        dispatch({ type: "INIT", steps: fresh.steps ?? [] })
        toast.success("Workflow saved")
      } catch (e) {
        console.error("[AgentWorkflowCanvas] save failed:", e)
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to save workflow"
        toast.error(msg)
      } finally {
        setIsSaving(false)
      }
    },
    [steps]
  )

  return { steps, canUndo, canRedo, isDirty, isSaving, dispatch, save }
}

export default useCanvasState
