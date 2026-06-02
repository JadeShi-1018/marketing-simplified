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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AgentAPI } from "@/lib/api/agentApi"
import { ProjectAPI } from "@/lib/api/projectApi"
import { useAuthStore } from "@/lib/authStore"
import type {
  AgentWorkflowTemplate,
  AgentWorkflowDefinition,
  TemplateCategory,
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
  const user = useAuthStore((s) => s.user)
  const userOrg = user?.organization ?? null

  const [workflows, setWorkflows] = useState<AgentWorkflowDefinition[]>([])
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [sourceWorkflowId, setSourceWorkflowId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<TemplateCategory>("other")

  // Sharing
  const [shareOrg, setShareOrg] = useState(false)
  const [shareProject, setShareProject] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")

  const isEditMode = !!template

  const fetchWorkflows = async () => {
    setLoadingWorkflows(true)
    try {
      const data = await AgentAPI.listWorkflows()
      setWorkflows(data.filter((w) => w.status === "active"))
    } catch {
      // silent
    } finally {
      setLoadingWorkflows(false)
    }
  }

  const fetchProjects = async () => {
    setLoadingProjects(true)
    try {
      const data = await ProjectAPI.getProjects()
      setProjects(data.map((p) => ({ id: p.id, name: p.name })))
    } catch {
      // silent
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (isEditMode && template) {
      setName(template.name)
      setDescription(template.description || "")
      setCategory(template.category)
      setShareOrg(!!template.organization)
      setShareProject(!!template.project)
      setSelectedProjectId(template.project || "")
    } else {
      setName(defaultName || "")
      setDescription(defaultDescription || "")
      setCategory("other")
      setShareOrg(false)
      setShareProject(false)
      setSelectedProjectId("")
      setSourceWorkflowId(defaultSourceWorkflowId || "")
      if (!lockSourceWorkflow) {
        fetchWorkflows()
      }
    }
    fetchProjects()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const orgId = shareOrg && userOrg ? String(userOrg.id) : null
      const projId = shareProject && selectedProjectId ? selectedProjectId : null

      if (isEditMode && template) {
        await AgentAPI.updateTemplate(template.id, {
          name,
          description: description || undefined,
          category,
          organization_id: orgId,
          project_id: projId,
        })
      } else {
        await AgentAPI.createTemplate({
          source_workflow_id: sourceWorkflowId,
          name,
          description: description || undefined,
          category,
          organization_id: orgId,
          project_id: projId,
        })
      }
      onSuccess()
      onClose()
    } catch {
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
          {/* Source workflow (create mode only) */}
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
                      workflows.map((wf) => (
                        <SelectItem key={wf.id} value={wf.id}>
                          <div className="flex flex-col items-start">
                            <span className="font-medium">
                              {wf.name}
                              {wf.is_system ? " (System)" : ""}
                            </span>
                            {wf.description && (
                              <span className="text-xs text-muted-foreground">{wf.description}</span>
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

          {/* Name */}
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

          {/* Sharing */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Sharing</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Choose who else can see this template. Leave both unchecked to keep it private.
            </p>

            {/* Organization */}
            {userOrg ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-org"
                  checked={shareOrg}
                  onCheckedChange={(v) => setShareOrg(!!v)}
                />
                <Label htmlFor="share-org" className="text-sm font-normal cursor-pointer">
                  Share with organization&nbsp;
                  <span className="font-medium text-foreground">{userOrg.name}</span>
                </Label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                You are not part of an organization — org sharing is unavailable.
              </p>
            )}

            {/* Project */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="share-project"
                checked={shareProject}
                onCheckedChange={(v) => {
                  setShareProject(!!v)
                  if (!v) setSelectedProjectId("")
                }}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="share-project" className="text-sm font-normal cursor-pointer">
                  Share with a specific project
                </Label>
                {shareProject && (
                  loadingProjects ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting || (shareProject && !selectedProjectId)}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditMode ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
