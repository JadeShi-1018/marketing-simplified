"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AgentWorkflowStep, WorkflowStepType } from "@/types/agent"
import { STEP_TYPE_META } from "./stepConfig/stepTypeMeta"
import { getGroupedStepTypes } from "./stepConfig/workflowPresets"
import { StepConfigForm, validateStepConfig } from "./stepConfig/StepConfigForm"

interface StepEditorPanelProps {
  step: AgentWorkflowStep | null
  readOnly?: boolean
  onSave: (stepId: string, data: Partial<AgentWorkflowStep>) => Promise<void>
  onDelete: (stepId: string) => Promise<void>
}

export function StepEditorPanel({ step, readOnly, onSave, onDelete }: StepEditorPanelProps) {
  const [name, setName] = useState("")
  const [stepType, setStepType] = useState<WorkflowStepType>("analyze_data")
  const [description, setDescription] = useState("")
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!step) return
    setName(step.name)
    setStepType(step.step_type)
    setDescription(step.description || "")
    setConfig(step.config || {})
  }, [step])

  if (!step) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border p-6">
        <p className="text-sm text-muted-foreground">Select a step to edit its configuration.</p>
      </div>
    )
  }

  const meta = STEP_TYPE_META.find((s) => s.value === step.step_type)
  const isLegacy = meta?.deprecated === true
  const groupedStepTypes = getGroupedStepTypes()

  const handleSave = async () => {
    if (readOnly || !step) return
    const configError = validateStepConfig(stepType, config)
    if (configError) {
      toast.error(configError)
      return
    }
    setSaving(true)
    try {
      await onSave(step.id, { name, step_type: stepType, description, config })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (readOnly || !step) return
    setDeleting(true)
    try {
      await onDelete(step.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Step details</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Step {step.order}
            {isLegacy ? " · Legacy type (read-only type change)" : ""}
          </p>
        </div>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleting}
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        <div>
          <Label className="text-xs font-medium">Name</Label>
          <Input
            value={name}
            disabled={readOnly}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>

        <div>
          <Label className="text-xs font-medium">Type</Label>
          {readOnly || isLegacy ? (
            <Input value={meta?.label || stepType} disabled className="mt-1 text-sm" />
          ) : (
            <Select value={stepType} onValueChange={(v) => setStepType(v as WorkflowStepType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupedStepTypes.map((group) => (
                  <SelectGroup key={group.category}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
          {meta?.description && (
            <p className="text-[11px] text-muted-foreground mt-1">{meta.description}</p>
          )}
        </div>

        <div>
          <Label className="text-xs font-medium">Description</Label>
          <Input
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>

        <div>
          <Label className="text-xs font-medium">Configuration</Label>
          <div className="mt-2">
            <StepConfigForm
              stepType={stepType}
              config={config}
              disabled={readOnly}
              onChange={setConfig}
            />
          </div>
        </div>
      </div>

      {!readOnly && (
        <Button className="mt-4 w-full" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? "Saving step..." : "Save step"}
        </Button>
      )}
    </div>
  )
}
