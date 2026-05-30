"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import type { WorkflowStepType } from "@/types/agent"
import { PICKER_GROUPS, getStepMeta } from "../canvasStepMeta"

const PANEL_WIDTH = 288
const PANEL_MAX_HEIGHT = 480
const GAP = 12 // px gap between anchor and panel

interface StepPickerPanelProps {
  /** Viewport coordinates of the element that triggered the picker */
  anchorX: number
  anchorY: number
  onSelect: (type: WorkflowStepType) => void
  onClose: () => void
}

export default function StepPickerPanel({
  anchorX,
  anchorY,
  onSelect,
  onClose,
}: StepPickerPanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchorX + GAP, top: anchorY })

  // Clamp so the panel stays inside the viewport
  useLayoutEffect(() => {
    const vh = window.innerHeight
    const vw = window.innerWidth
    let left = anchorX + GAP
    let top = anchorY - PANEL_MAX_HEIGHT / 2

    // Don't overflow right edge
    if (left + PANEL_WIDTH > vw - 8) left = anchorX - PANEL_WIDTH - GAP
    // Don't overflow bottom
    if (top + PANEL_MAX_HEIGHT > vh - 8) top = vh - PANEL_MAX_HEIGHT - 8
    // Don't overflow top
    if (top < 8) top = 8

    setPos({ left, top })
  }, [anchorX, anchorY])

  // Close on outside click (delayed so the triggering click doesn't immediately close)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener("mousedown", handler)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: PANEL_WIDTH,
        maxHeight: PANEL_MAX_HEIGHT,
        zIndex: 50,
      }}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Choose a step</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Groups — scrollable */}
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {PICKER_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.types.map((type) => {
                const meta = getStepMeta(type)
                const Icon = meta.icon
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      onSelect(type)
                      onClose()
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bgClass}`}
                    >
                      <Icon className="h-4 w-4 text-white" strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">
                        {meta.label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {meta.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
