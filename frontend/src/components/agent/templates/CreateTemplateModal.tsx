"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import toast from "react-hot-toast"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { AgentAPI } from "@/lib/api/agentApi"
import type {
  AgentWorkflowTemplate,
  AgentWorkflowDefinition,
  TemplateCategory,
  TemplateShareScope,
} from "@/types/agent"

interface CreateTemplateModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  template?: AgentWorkflowTemplate | null
  /** Pre-fill source workflow (e.g. from workflow editor). */
  defaultSourceWorkflowId?: string
  defaultName?: string
  defaultDescription?: string
  /** Hide source workflow picker when source is fixed. */
  lockSourceWorkflow?: boolean
}

export function CreateTemplateModal({
  open,
  onClose,
  onSuccess,
  template,
  defaultSourceWorkflowId,
  defaultName,
  defaultDescription,
  lockSourceWorkflow = false,
}: CreateTemplateModalProps) {
  const [workflows, setWorkflows] = useState<AgentWorkflowDefinition[]>([])
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [sourceWorkflowId, setSourceWorkflowId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<TemplateCategory>("other")
  const [shareScope, setShareScope] = useState<TemplateShareScope>("private")

  const isEditMode = !!template

  useEffect(() => {
    if (open) {
      if (isEditMode && template) {
        setName(template.name)
        setDescription(template.description || "")
        setCategory(template.category)
        setShareScope(template.share_scope)
      } else {
        setName(defaultName || "")
        setDescription(defaultDescription || "")
        setCategory("other")
        setShareScope("private")
        setSourceWorkflowId(defaultSourceWorkflowId || "")
        if (!lockSourceWorkflow) {
          fetchWorkflows()
        }
      }
    }
  }, [open, template, defaultSourceWorkflowId, defaultName, defaultDescription, lockSourceWorkflow])

  const fetchWorkflows = async () => {
    setLoadingWorkflows(true)
    try {
      const data = await AgentAPI.listWorkflows()
      const available = data.filter((w) => w.status === "active")
      setWorkflows(available)
    } catch (error) {
      console.error("Failed to fetch workflows:", error)
    } finally {
      setLoadingWorkflows(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      if (isEditMode && template) {
        await AgentAPI.updateTemplate(template.id, {
          name,
          description: description || undefined,
          category,
          share_scope: shareScope,
        })
      } else {
        await AgentAPI.createTemplate({
          source_workflow_id: sourceWorkflowId,
          name,
          description: description || undefined,
          category,
          share_scope: shareScope,
        })
      }
      onSuccess()
      onClose()
    } catch (error) {
      console.error("Failed to save template:", error)
      toast.error("Failed to save template")
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = isEditMode
    ? name.trim().length > 0
    : name.trim().length > 0 && sourceWorkflowId.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Template" : "Create Workflow Template"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the template information"
              : "Create a reusable template from an existing workflow"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Workflow Selection (create mode only) */}
          {!isEditMode && (
            <div>
              <Label htmlFor="workflow" className="text-sm font-medium">
                Source Workflow <span className="text-destructive">*</span>
              </Label>
              {lockSourceWorkflow && sourceWorkflowId ? (
                <p className="mt-1 rounded-md border border-input bg-muted/20 px-3 py-2 text-sm text-foreground">
                  Current workflow (will be cloned)
                </p>
              ) : loadingWorkflows ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={sourceWorkflowId} onValueChange={setSourceWorkflowId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a workflow to use as template" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No active workflows available
                      </div>
                    ) : (
                      workflows.map((workflow) => (
                        <SelectItem key={workflow.id} value={workflow.id}>
                          <div className="flex flex-col items-start">
                            <span className="font-medium">
                              {workflow.name}
                              {workflow.is_system ? " (System)" : ""}
                            </span>
                            {workflow.description && (
                              <span className="text-xs text-muted-foreground">
                                {workflow.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The workflow will be cloned to create an independent template
              </p>
            </div>
          )}

          {/* Template Name */}
          <div>
            <Label htmlFor="name" className="text-sm font-medium">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Weekly Performance Review"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Describe what this template does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 resize-none"
              rows={3}
            />
          </div>

          {/* Category */}
          <div>
            <Label className="text-sm font-medium">
              Category <span className="text-destructive">*</span>
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="optimization">Optimization</SelectItem>
                <SelectItem value="analysis">Analysis</SelectItem>
                <SelectItem value="reporting">Reporting</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Share Scope */}
          <div>
            <Label className="text-sm font-medium">
              Share Scope <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={shareScope}
              onValueChange={(v) => setShareScope(v as TemplateShareScope)}
              className="mt-2 space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="private" />
                <Label htmlFor="private" className="text-sm font-normal cursor-pointer">
                  <span className="font-medium">Private</span> - Only visible to you
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="organization" id="organization" />
                <Label htmlFor="organization" className="text-sm font-normal cursor-pointer">
                  <span className="font-medium">Organization</span> - Visible to your entire organization
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditMode ? "Updating..." : "Creating..."}
              </>
            ) : (
              isEditMode ? "Update Template" : "Create Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
