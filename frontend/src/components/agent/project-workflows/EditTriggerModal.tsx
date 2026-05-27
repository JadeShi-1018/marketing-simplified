"use client"

import { useState, useEffect } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import type { AgentProjectWorkflowBinding, TriggerMode } from "@/types/agent"

interface EditTriggerModalProps {
  open: boolean
  onClose: () => void
  binding: AgentProjectWorkflowBinding
  onSave: (data: {
    trigger_mode?: TriggerMode
    trigger_keywords?: string[]
    priority?: number
    is_default?: boolean
  }) => void
  currentDefault?: AgentProjectWorkflowBinding
}

export function EditTriggerModal({
  open,
  onClose,
  binding,
  onSave,
  currentDefault,
}: EditTriggerModalProps) {
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(binding.trigger_mode)
  const [keywords, setKeywords] = useState("")
  const [priority, setPriority] = useState(binding.priority)
  const [isDefault, setIsDefault] = useState(binding.is_default)

  useEffect(() => {
    if (open) {
      setTriggerMode(binding.trigger_mode)
      setKeywords(binding.trigger_keywords?.join(", ") || "")
      setPriority(binding.priority)
      setIsDefault(binding.is_default)
    }
  }, [open, binding])

  const handleSave = () => {
    const keywordList = triggerMode === "message_keyword"
      ? keywords.split(",").map(k => k.trim()).filter(Boolean)
      : undefined

    onSave({
      trigger_mode: triggerMode,
      trigger_keywords: keywordList,
      priority,
      is_default: isDefault,
    })
  }

  const hasChanges =
    triggerMode !== binding.trigger_mode ||
    keywords !== (binding.trigger_keywords?.join(", ") || "") ||
    priority !== binding.priority ||
    isDefault !== binding.is_default

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Trigger Conditions</DialogTitle>
          <DialogDescription>
            Configure when this workflow should be triggered for {binding.template_detail?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trigger Mode */}
          <div>
            <Label className="text-sm font-medium">Trigger Mode</Label>
            <RadioGroup
              value={triggerMode}
              onValueChange={(v) => setTriggerMode(v as TriggerMode)}
              className="mt-2 space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="file_upload" id="edit-file_upload" />
                <Label htmlFor="edit-file_upload" className="text-sm font-normal cursor-pointer">
                  File Upload - When user uploads a file
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="analyze_action" id="edit-analyze_action" />
                <Label htmlFor="edit-analyze_action" className="text-sm font-normal cursor-pointer">
                  Analyze Action - When analyze action triggered
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="message_keyword" id="edit-message_keyword" />
                <Label htmlFor="edit-message_keyword" className="text-sm font-normal cursor-pointer">
                  Message Keywords - When message contains specific keywords
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Keywords (only for message_keyword mode) */}
          {triggerMode === "message_keyword" && (
            <div>
              <Label htmlFor="edit-keywords" className="text-sm font-medium">
                Keywords (comma-separated)
              </Label>
              <Input
                id="edit-keywords"
                placeholder="analyze, review, check"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This workflow will run when user messages contain any of these keywords
              </p>
            </div>
          )}

          {/* Priority */}
          <div>
            <Label className="text-sm font-medium">
              Priority: <span className="font-mono">{priority}</span>
            </Label>
            <Slider
              value={[priority]}
              onValueChange={(v) => setPriority(v[0])}
              min={0}
              max={100}
              step={1}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Higher priority wins when multiple workflows match the same trigger
            </p>
          </div>

          {/* Set as Default */}
          <div className="flex items-start space-x-2 rounded-lg border border-border p-3">
            <Checkbox
              id="edit-is_default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="edit-is_default"
                className="text-sm font-medium cursor-pointer"
              >
                Set as default workflow for this project
              </Label>
              {!binding.is_default && currentDefault && isDefault && (
                <div className="flex items-start gap-2 mt-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Current default: <strong>{currentDefault.template_detail?.name}</strong>.
                    This will be unset.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Default workflow runs when no trigger conditions match
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !hasChanges ||
              (triggerMode === "message_keyword" && !keywords.trim())
            }
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
