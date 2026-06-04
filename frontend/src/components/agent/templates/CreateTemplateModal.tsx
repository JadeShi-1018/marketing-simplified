"use client"

import { useState, useEffect, useRef } from "react"
import { Building2, Check, FolderKanban, Loader2, X } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
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
import { UseCasesEditor } from "./UseCasesEditor"

interface CreateTemplateModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  template?: AgentWorkflowTemplate | null
  defaultSourceWorkflowId?: string
  defaultName?: string
  defaultDescription?: string
  lockSourceWorkflow?: boolean
}

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "review", label: "Review" },
  { value: "optimization", label: "Optimization" },
  { value: "analysis", label: "Analysis" },
  { value: "reporting", label: "Reporting" },
  { value: "other", label: "Other" },
]

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
  const nameRef = useRef<HTMLInputElement>(null)

  const [workflows, setWorkflows] = useState<AgentWorkflowDefinition[]>([])
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [sourceWorkflowId, setSourceWorkflowId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<TemplateCategory>("other")
  const [shareOrg, setShareOrg] = useState(false)
  const [shareProject, setShareProject] = useState(false)
  // Multi-select: set of project IDs (numbers)
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set())
  const [useCases, setUseCases] = useState<string[]>([])

  const isEditMode = !!template

  useEffect(() => {
    if (!open) return

    if (isEditMode && template) {
      setName(template.name)
      setDescription(template.description || "")
      setCategory(template.category)
      setShareOrg(!!template.organization)
      const existing = template.project_list ?? []
      setShareProject(existing.length > 0)
      setSelectedProjectIds(new Set(existing.map((p) => p.id)))
      setUseCases(template.use_cases ?? [])
    } else {
      setName(defaultName || "")
      setDescription(defaultDescription || "")
      setCategory("other")
      setShareOrg(false)
      setShareProject(false)
      setSelectedProjectIds(new Set())
      setUseCases([])
      setSourceWorkflowId(defaultSourceWorkflowId || "")
      if (!lockSourceWorkflow) {
        setLoadingWorkflows(true)
        AgentAPI.listWorkflows()
          .then((data) => setWorkflows(data.filter((w) => w.status === "active")))
          .catch(() => {})
          .finally(() => setLoadingWorkflows(false))
      }
    }

    setLoadingProjects(true)
    ProjectAPI.getProjects()
      .then((data) => setProjects(data.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
      .finally(() => setLoadingProjects(false))

    setTimeout(() => nameRef.current?.focus(), 80)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProject = (id: number) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const orgId = shareOrg && userOrg ? String(userOrg.id) : null
      const projectIds = shareProject ? Array.from(selectedProjectIds) : []
      const payload = {
        name,
        description: description || undefined,
        category,
        organization_id: orgId,
        project_ids: projectIds,
        use_cases: useCases,
      }

      if (isEditMode && template) {
        await AgentAPI.updateTemplate(template.id, payload)
      } else {
        await AgentAPI.createTemplate({
          source_workflow_id: sourceWorkflowId,
          ...payload,
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

  const canSubmit =
    name.trim().length > 0 &&
    (isEditMode || sourceWorkflowId.length > 0) &&
    (!shareProject || selectedProjectIds.size > 0)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-[520px] rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header label */}
        <div className="px-6 pt-6 pb-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {isEditMode ? "Edit Template" : "Create Workflow Template"}
          </p>
          {!isEditMode && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              {lockSourceWorkflow && defaultName
                ? <>From: <span className="font-medium text-gray-500">{defaultName}</span></>
                : "Create a reusable template from an existing workflow"}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-5">

          {/* Source workflow picker (create, not locked) */}
          {!isEditMode && !lockSourceWorkflow && (
            <div>
              {loadingWorkflows ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading workflows…
                </div>
              ) : (
                <Select value={sourceWorkflowId} onValueChange={setSourceWorkflowId}>
                  <SelectTrigger className="h-8 rounded-lg border-dashed text-xs">
                    <SelectValue placeholder="Select source workflow…" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.length === 0
                      ? <div className="p-2 text-center text-xs text-gray-400">No active workflows</div>
                      : workflows.map((wf) => (
                        <SelectItem key={wf.id} value={wf.id}>
                          {wf.name}{wf.is_system ? " (System)" : ""}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Notion-style title + description */}
          <div className="-mx-1">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled Template"
              className="w-full bg-transparent px-1 text-[26px] font-bold leading-tight text-gray-900 placeholder:text-gray-300 outline-none border-none"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this reusable template..."
              className="mt-1 w-full bg-transparent px-1 text-sm text-gray-400 placeholder:text-gray-300 outline-none border-none"
            />
          </div>

          {/* Use cases (documentation for users) */}
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">When to use this template</p>
            <p className="mb-2 text-[11px] text-gray-400">
              Optional example phrases so your team knows when to run this template.
            </p>
            <UseCasesEditor
              value={useCases}
              onChange={setUseCases}
              placeholder="e.g. run a full campaign review"
            />
          </div>

          {/* Category chips */}
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                    category === cat.value
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sharing cards */}
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Sharing</p>
            <p className="mb-3 text-[11px] text-gray-400">
              Choose who else can see this template. Leave both unselected to keep it private.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Organization card */}
              <button
                type="button"
                disabled={!userOrg}
                onClick={() => setShareOrg((v) => !v)}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all",
                  !userOrg && "cursor-not-allowed opacity-40",
                  shareOrg ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                {shareOrg && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", shareOrg ? "bg-indigo-100" : "bg-gray-100")}>
                  <Building2 className={cn("h-5 w-5", shareOrg ? "text-indigo-600" : "text-gray-500")} />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", shareOrg ? "text-indigo-800" : "text-gray-800")}>
                    Share with Organization
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                    {userOrg
                      ? <>Visible to everyone in <span className="font-medium text-gray-500">{userOrg.name}</span></>
                      : "No organization found"}
                  </p>
                </div>
              </button>

              {/* Project card */}
              <button
                type="button"
                onClick={() => {
                  const next = !shareProject
                  setShareProject(next)
                  if (!next) setSelectedProjectIds(new Set())
                }}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all",
                  shareProject ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                {shareProject && selectedProjectIds.size > 0 && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500">
                    <span className="text-[10px] font-bold text-white">{selectedProjectIds.size}</span>
                  </span>
                )}
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", shareProject ? "bg-indigo-100" : "bg-gray-100")}>
                  <FolderKanban className={cn("h-5 w-5", shareProject ? "text-indigo-600" : "text-gray-500")} />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", shareProject ? "text-indigo-800" : "text-gray-800")}>
                    Apply to Projects
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                    Agent will use this workflow in selected projects
                  </p>
                </div>
              </button>
            </div>

            {/* Project multi-select checklist */}
            {shareProject && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                {loadingProjects ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading projects…
                  </div>
                ) : projects.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-400 text-center">No projects available</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto divide-y divide-gray-100">
                    {projects.map((p) => {
                      const checked = selectedProjectIds.has(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProject(p.id)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                            checked ? "bg-indigo-50 text-indigo-800" : "text-gray-700 hover:bg-white"
                          )}
                        >
                          <span className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked ? "border-indigo-500 bg-indigo-500" : "border-gray-300 bg-white"
                          )}>
                            {checked && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                          <span className="truncate font-medium">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {selectedProjectIds.size > 0 && (
                  <div className="border-t border-gray-200 px-3 py-2">
                    <span className="text-[11px] text-indigo-600 font-medium">
                      {selectedProjectIds.size} project{selectedProjectIds.size !== 1 ? "s" : ""} selected
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditMode ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  )
}
