"use client"

import { getStepMeta } from "../canvas/canvasStepMeta"
import type { WorkflowStepType } from "@/types/agent"

const MAX_VISIBLE = 3

interface StepIconStackProps {
  stepTypes: WorkflowStepType[]
  /** Circle size in px (default 36) */
  size?: number
}

/**
 * Renders up to MAX_VISIBLE step-type icon circles overlapping horizontally.
 * If there are more steps than MAX_VISIBLE, a final circle shows the remaining count.
 *
 *  ◉ ◉ ◉  +4
 */
export default function StepIconStack({ stepTypes, size = 36 }: StepIconStackProps) {
  if (!stepTypes || stepTypes.length === 0) {
    // Fallback: plain grey placeholder
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] font-bold">—</span>
      </div>
    )
  }

  const visible = stepTypes.slice(0, MAX_VISIBLE)
  const remaining = stepTypes.length - MAX_VISIBLE
  const iconSize = Math.round(size * 0.45)
  const overlap = Math.round(size * 0.3)

  return (
    <div className="flex items-center" style={{ gap: 0 }}>
      {visible.map((type, idx) => {
        const meta = getStepMeta(type)
        const Icon = meta.icon
        return (
          <div
            key={`${type}-${idx}`}
            title={meta.label}
            className={`flex shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm ${meta.bgClass}`}
            style={{
              width: size,
              height: size,
              marginLeft: idx === 0 ? 0 : -overlap,
              zIndex: visible.length - idx,
            }}
          >
            <Icon style={{ width: iconSize, height: iconSize }} className="text-white" strokeWidth={2} />
          </div>
        )
      })}

      {remaining > 0 && (
        <div
          className="flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-200 shadow-sm"
          style={{
            width: size,
            height: size,
            marginLeft: -overlap,
            zIndex: 0,
          }}
        >
          <span className="text-[10px] font-bold text-slate-600">+{remaining}</span>
        </div>
      )}
    </div>
  )
}
