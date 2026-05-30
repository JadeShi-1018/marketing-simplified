"use client"

import { useEffect, useState } from "react"
import { Trash2, X } from "lucide-react"
import { StepConfigForm } from "@/components/agent/workflow/stepConfig/StepConfigForm"
import { getStepMeta } from "../canvasStepMeta"
import type { LocalStep } from "../useCanvasState"

interface StepConfigPanelProps {
  step: LocalStep
  onClose: () => void
  onUpdate: (patch: Partial<Pick<LocalStep, "name" | "config" | "description">>) => void
  onDelete: () => void
}

export default function StepConfigPanel({
  step,
  onClose,
  onUpdate,
  onDelete,
}: StepConfigPanelProps) {
  const meta = getStepMeta(step.step_type)
  const Icon = meta.icon

  const [name, setName] = useState(step.name)
  const [config, setConfig] = useState<Record<string, unknown>>(step.config ?? {})

  // Sync when step changes (e.g. selection switches to a different node)
  useEffect(() => {
    setName(step.name)
    setConfig(step.config ?? {})
  }, [step.id, step.name, step.config])

  const handleNameBlur = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== step.name) {
      onUpdate({ name: trimmed })
    }
  }

  const handleConfigChange = (next: Record<string, unknown>) => {
    setConfig(next)
    onUpdate({ config: next })
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-slate-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.bgClass}`}
        >
          <Icon className="h-4.5 w-4.5 text-white" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{meta.label}</p>
          <p className="truncate text-sm font-semibold text-slate-900">{step.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close config panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Name field */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Step name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Step type (read-only) */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Type
          </label>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <span className={`flex h-5 w-5 items-center justify-center rounded ${meta.bgClass}`}>
              <Icon className="h-3 w-3 text-white" />
            </span>
            <span className="text-sm text-slate-700">{meta.label}</span>
          </div>
        </div>

        {/* Configuration */}
        <div>
          <label className="mb-2 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Configuration
          </label>
          <StepConfigForm
            stepType={step.step_type}
            config={config}
            onChange={handleConfigChange}
          />
        </div>
      </div>

      {/* Footer — delete */}
      <div className="border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete step
        </button>
      </div>
    </div>
  )
}
