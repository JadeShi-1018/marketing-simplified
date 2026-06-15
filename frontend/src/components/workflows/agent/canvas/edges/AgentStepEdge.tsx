"use client"

import { memo } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "reactflow"
import { Plus } from "lucide-react"

export interface AgentStepEdgeData {
  onAddBetween: (e: React.MouseEvent) => void
}

const AgentStepEdge = memo(function AgentStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<AgentStepEdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      {/* The actual edge path */}
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />

      {/* The + button in the middle of the edge */}
      <EdgeLabelRenderer>
        <div
          className="group absolute pointer-events-auto"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              data?.onAddBetween(e)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-indigo-400 hover:text-indigo-600"
            aria-label="Add step between"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})

export default AgentStepEdge
