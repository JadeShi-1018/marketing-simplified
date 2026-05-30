"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentProjectWorkflowBinding, AgentWorkflowTemplate, TriggerMode } from "@/types/agent"

interface ApplyTemplateModalProps {
  open: boolean
  template: AgentWorkflowTemplate
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

export default function ApplyTemplateModal({
  open,
  template,
  projectId,
  onClose,
  onSuccess,
}: ApplyTemplateModalProps) {
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("message_keyword")
  const [keywords, setKeywords] = useState("")
  const [existingBindings, setExistingBindings] = useState<AgentProjectWorkflowBinding[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setTriggerMode("message_keyword")
    setKeywords("")
    AgentAPI.listProjectBindings(projectId, false).then((data) => {
      setExistingBindings(data as AgentProjectWorkflowBinding[])
    }).catch(() => {
      setExistingBindings([])
    })
  }, [open, projectId])

  const handleApply = async () => {
    if (triggerMode === "message_keyword" && !keywords.trim()) return
    setSubmitting(true)
    try {
      const keywordList =
        triggerMode === "message_keyword"
          ? keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : undefined
      const priority =
        existingBindings.length > 0
          ? Math.max(...existingBindings.map((b) => b.priority)) + 1
          : 10
      await AgentAPI.createProjectBinding(projectId, {
        template_id: template.id,
        trigger_mode: triggerMode,
        trigger_keywords: keywordList,
        priority,
        is_default: existingBindings.length === 0,
      })
      onSuccess()
    } catch {
      // let parent handle toast
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    triggerMode !== "message_keyword" || keywords.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply template to project</DialogTitle>
          <DialogDescription>
            Configure when &ldquo;{template.name}&rdquo; should be triggered for this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label className="mb-2 block text-sm font-medium">
              When should this workflow run?
            </Label>
            <RadioGroup
              value={triggerMode}
              onValueChange={(v) => setTriggerMode(v as TriggerMode)}
              className="space-y-2"
            >
              {[
                { value: "file_upload", label: "When user uploads a file" },
                { value: "analyze_action", label: "When analyze action is triggered" },
                { value: "message_keyword", label: "When message contains keywords" },
              ].map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={opt.value} />
                  <Label
                    htmlFor={opt.value}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {triggerMode === "message_keyword" && (
            <div>
              <Label htmlFor="kw" className="mb-1 block text-sm font-medium">
                Keywords{" "}
                <span className="font-normal text-gray-400">(comma-separated)</span>
              </Label>
              <Input
                id="kw"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="analyze, review, check"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500">
                The workflow runs when any of these words appear in a user message.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canSubmit || submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              "Apply template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
