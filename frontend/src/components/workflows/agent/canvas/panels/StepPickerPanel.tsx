"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import type { WorkflowStepType } from "@/types/agent"
import { PICKER_GROUPS, getStepMeta } from "../canvasStepMeta"

interface StepPickerPanelProps {
  onSelect: (type: WorkflowStepType) => void
  onClose: () => void
}

export default function StepPickerPanel({ onSelect, onClose }: StepPickerPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-1/2 z-30 w-72 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      style={{ maxHeight: "70vh", overflowY: "auto" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Choose a step</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Groups */}
      <div className="p-3 space-y-4">
        {PICKER_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {group.label}
            </p>
            <div className="space-y-1">
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
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
