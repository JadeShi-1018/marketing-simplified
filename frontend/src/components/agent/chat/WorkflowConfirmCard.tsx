"use client"

import { Play, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface WorkflowConfirmData {
  workflowId: string
  workflowName: string
  originalMessage: string
}

interface WorkflowConfirmCardProps {
  data: WorkflowConfirmData
  onConfirm: (workflowId: string, originalMessage: string) => void
  onReject: () => void
  disabled?: boolean
}

export function WorkflowConfirmCard({
  data,
  onConfirm,
  onReject,
  disabled,
}: WorkflowConfirmCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#3CCED7]/30 bg-[#3CCED7]/5 px-3 py-2 mt-1">
      <Play className="h-3.5 w-3.5 shrink-0 text-[#3CCED7]" />
      <span className="text-xs text-muted-foreground flex-1">
        Run <span className="font-medium text-foreground">{data.workflowName}</span>?
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-3 text-xs border-[#3CCED7]/40 text-[#1a9ba3] hover:bg-[#3CCED7]/10"
        disabled={disabled}
        onClick={() => onConfirm(data.workflowId, data.originalMessage)}
      >
        Yes, run it
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        disabled={disabled}
        onClick={onReject}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
