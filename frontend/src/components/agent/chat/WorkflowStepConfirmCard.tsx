"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WorkflowStepConfirmCardProps {
  message: string
  onContinue: () => void
  disabled?: boolean
}

/** Shown when a workflow pauses at an await_confirmation step. */
export function WorkflowStepConfirmCard({
  message,
  onContinue,
  disabled,
}: WorkflowStepConfirmCardProps) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-600">{message}</p>
      <Button
        size="sm"
        className="h-8 w-fit text-xs"
        disabled={disabled}
        onClick={onContinue}
      >
        <Check className="mr-1.5 h-3.5 w-3.5" />
        Continue
      </Button>
    </div>
  )
}
