"use client"

import { memo } from "react"
import { Handle, Position } from "reactflow"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStepMeta } from "../canvasStepMeta"
import type { LocalStep } from "../useCanvasState"

export interface AgentStepNodeData {
  step: LocalStep
  isSelected: boolean
  hasNext: boolean
  isPreviewMode?: boolean  // Preview mode: no interactions
  onSelect?: () => void
  onAddAfter?: (e: React.MouseEvent) => void
  onDelete?: () => void
}

const AgentStepNode = memo(function AgentStepNode({
  data,
}: {
  data: AgentStepNodeData
}) {
  const { step, isSelected, hasNext, isPreviewMode, onSelect, onAddAfter, onDelete } = data
  const meta = getStepMeta(step.step_type)
  const Icon = meta.icon

  return (
    // `relative` on the outer wrapper so the + button can be absolutely positioned correctly
    <div className="group relative flex flex-col items-center" style={{ width: 100 }}>
      {/* Left connection handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-400"
        style={{ left: -6 }}
      />

      {/* The circular node */}
      <div className="relative">
        {isPreviewMode ? (
          // Preview mode: non-interactive div
          <div
            className={cn(
              "flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-lg",
              meta.bgClass
            )}
          >
            <Icon className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
        ) : (
          // Edit mode: interactive button
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.()
            }}
            className={cn(
              "flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-lg transition-all duration-150",
              meta.bgClass,
              isSelected
                ? "ring-4 ring-white ring-offset-2 ring-offset-slate-200 shadow-xl scale-110"
                : "hover:shadow-xl hover:scale-105"
            )}
          >
            <Icon className="h-7 w-7 text-white" strokeWidth={1.8} />
          </button>
        )}

        {/* Delete button — only show in edit mode */}
        {!isPreviewMode && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-red-600"
            aria-label="Delete step"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {/* Unsaved indicator — only show in edit mode */}
        {!isPreviewMode && (step._isTemp || step._isDirty) && (
          <span
            className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400"
            title="Unsaved changes"
          />
        )}
      </div>

      {/* Label below the circle */}
      <p className="mt-2 max-w-[96px] text-center text-[11px] font-semibold leading-tight text-slate-700">
        {step.name}
      </p>

      {/* Right connection handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-400"
        style={{ right: -6, top: 36 }}
      />

      {/* + button — only show in edit mode when this is the last node */}
      {!isPreviewMode && !hasNext && onAddAfter && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAddAfter(e)
          }}
          className="absolute right-[-28px] top-[22px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-indigo-400 hover:text-indigo-600"
          aria-label="Add step after"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
})

export default AgentStepNode
