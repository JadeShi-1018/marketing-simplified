"use client"

import { memo } from "react"
import { Handle, Position } from "reactflow"
import { Plus } from "lucide-react"

export interface AgentAddNodeData {
  /** True when no steps exist yet — renders a larger prominent circle */
  isEmpty: boolean
  onClick: () => void
}

const AgentAddNode = memo(function AgentAddNode({
  data,
}: {
  data: AgentAddNodeData
}) {
  const { isEmpty, onClick } = data

  return (
    <div className="flex flex-col items-center" style={{ width: isEmpty ? 80 : 52 }}>
      {/* Target handle (only when not empty — receives the edge from last step) */}
      {!isEmpty && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-white !bg-slate-300"
          style={{ left: -6 }}
        />
      )}

      <button
        type="button"
        onClick={onClick}
        className={
          isEmpty
            ? "flex h-20 w-20 items-center justify-center rounded-full border-4 border-dashed border-indigo-300 bg-white text-indigo-400 shadow-sm transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-md"
            : "flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-500"
        }
        aria-label="Add step"
      >
        <Plus className={isEmpty ? "h-8 w-8" : "h-4 w-4"} strokeWidth={isEmpty ? 1.5 : 2} />
      </button>

      {isEmpty && (
        <p className="mt-2 text-center text-xs font-medium text-slate-400">
          Add a step
        </p>
      )}
    </div>
  )
})

export default AgentAddNode
