"use client"

import { useEffect, useState } from "react"
import { Trash2, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepConfigForm } from "@/components/agent/workflow/stepConfig/StepConfigForm"
import { PICKER_GROUPS, getStepMeta } from "../canvasStepMeta"
import type { LocalStep } from "../useCanvasState"
import type { WorkflowStepType } from "@/types/agent"

interface StepConfigPanelProps {
  step: LocalStep
  onClose: () => void
  onUpdate: (patch: Partial<Pick<LocalStep, "name" | "step_type" | "config" | "description">>) => void
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

  // Sync local state when the selected step changes
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

  const handleTypeChange = (newType: WorkflowStepType) => {
    if (newType === step.step_type) return
    // Reset config — different types have incompatible config schemas
    setConfig({})
    onUpdate({ step_type: newType, config: {} })
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
          <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
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
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Type — grouped Select */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Type
          </label>
          <Select value={step.step_type} onValueChange={(v) => handleTypeChange(v as WorkflowStepType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>

            <SelectContent className="max-h-72">
              {PICKER_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {group.label}
                  </SelectLabel>
                  {group.types.map((type) => {
                    const m = getStepMeta(type)
                    const MIcon = m.icon
                    return (
                      <SelectItem key={type} value={type}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${m.bgClass}`}
                          >
                            <MIcon className="h-3 w-3 text-white" />
                          </span>
                          {m.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Configuration form — reacts to step_type automatically */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
