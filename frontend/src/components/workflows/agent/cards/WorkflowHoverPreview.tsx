"use client"

import { getStepMeta } from "../canvas/canvasStepMeta"
import type { WorkflowStepType } from "@/types/agent"

const MAX_FLOW_NODES = 6

function FlowDiagram({ stepTypes }: { stepTypes: WorkflowStepType[] }) {
  const visible = stepTypes.slice(0, MAX_FLOW_NODES)
  const remaining = stepTypes.length - MAX_FLOW_NODES

  if (stepTypes.length === 0) {
    return (
      <div className="flex h-[130px] shrink-0 items-center justify-center bg-slate-50">
        <span className="text-xs text-slate-400">No steps defined</span>
      </div>
    )
  }

  return (
    <div
      className="flex shrink-0 items-center overflow-hidden bg-slate-50 px-4"
      style={{ height: 130 }}
    >
      {visible.map((type, idx) => {
        const meta = getStepMeta(type)
        const Icon = meta.icon
        return (
          <div key={`${type}-${idx}`} className="flex shrink-0 items-center">
            <div
              title={meta.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm ${meta.bgClass}`}
            >
              <Icon className="text-white" style={{ width: 18, height: 18 }} strokeWidth={2} />
            </div>
            {(idx < visible.length - 1 || remaining > 0) && (
              <div className="mx-1 flex items-center gap-0.5">
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="h-1 w-1 rounded-full bg-slate-300" />
              </div>
            )}
          </div>
        )
      })}

      {remaining > 0 && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-600">+{remaining}</span>
        </div>
      )}
    </div>
  )
}

interface WorkflowHoverPreviewProps {
  name: string
  description?: string
  stepTypes: WorkflowStepType[]
}

export default function WorkflowHoverPreview({
  name,
  description,
  stepTypes,
}: WorkflowHoverPreviewProps) {
  return (
    <>
      {/* Diagram strip — fixed height, always at the top */}
      <FlowDiagram stepTypes={stepTypes} />

      {/* Name + description — fills remaining space */}
      <div className="flex flex-1 flex-col gap-1.5 px-5 py-4">
        <p className="text-sm font-semibold leading-snug text-slate-800">{name}</p>
        {description ? (
          <p className="line-clamp-4 text-xs leading-relaxed text-slate-500">{description}</p>
        ) : (
          <p className="text-xs italic text-slate-400">No description</p>
        )}
      </div>
    </>
  )
}
