"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, FolderKanban, Layers, Loader2, Lock, Search } from "lucide-react"
import toast from "react-hot-toast"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { CreateTemplateModal } from "@/components/agent/templates/CreateTemplateModal"
import type { AgentWorkflowTemplate, TemplateCategory } from "@/types/agent"
import { AgentAPI } from "@/lib/api/agentApi"
import { useAuthStore } from "@/lib/authStore"
import { isTemplateOwner } from "@/components/agent/templates/templateOwnership"
import { useAgentWorkflowProjectParams } from "../hooks/useAgentWorkflows"
import TemplateCard from "../cards/TemplateCard"
import { brandChipActive, brandChipInactive } from "../workflowBrandClasses"
import { cn } from "@/lib/utils"

const CATEGORIES: Array<{ value: "all" | TemplateCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "review", label: "Review" },
  { value: "analysis", label: "Analysis" },
  { value: "optimization", label: "Optimization" },
  { value: "reporting", label: "Reporting" },
  { value: "other", label: "Other" },
]

interface TemplatesTabProps {
  refreshKey?: number
}

function SectionHeading({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ElementType
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-gray-400" />
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </h3>
      <span className="text-xs text-gray-400">({count})</span>
    </div>
  )
}

export default function TemplatesTab({ refreshKey }: TemplatesTabProps) {
  const user = useAuthStore((s) => s.user)
  const { projectParams } = useAgentWorkflowProjectParams()

  const [templates, setTemplates] = useState<AgentWorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<"all" | TemplateCategory>("all")
  const [editingTemplate, setEditingTemplate] = useState<AgentWorkflowTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<AgentWorkflowTemplate | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      // Pass current project ID to filter templates by visibility
      const params = {
        ...(categoryFilter !== "all" && { category: categoryFilter }),
        ...(projectParams && { project_id: Number(projectParams.project_id) }),
      }
      const data = await AgentAPI.listTemplates(params)
      setTemplates(data)
    } catch {
      toast.error("Failed to load templates")
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, projectParams])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates, refreshKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
    )
  }, [templates, search])

  const userId = user?.id
  const isOwner = (t: AgentWorkflowTemplate) => isTemplateOwner(t, userId)

  // Three groups: org → project → private
  // Note: A template can appear in both Project and Private sections
  const orgTemplates = filtered.filter((t) => !!t.organization)
  // Project templates: shared to current active project (regardless of ownership)
  const projectTemplates = filtered.filter((t) => !t.organization && t.is_shared_to_current_project)
  // Private templates: created by current user (regardless of sharing)
  const privateTemplates = filtered.filter((t) => !t.organization && isOwner(t))

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return
    try {
      await AgentAPI.deleteTemplate(deletingTemplate.id)
      toast.success("Template deleted")
      setDeletingTemplate(null)
      fetchTemplates()
    } catch {
      toast.error("Failed to delete template")
    }
  }

  return (
    <div>
      {/* Sub-header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Templates</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>
      </div>

      {/* Category filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategoryFilter(cat.value)}
            className={cn(
              categoryFilter === cat.value ? brandChipActive : brandChipInactive
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
            <Layers className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-gray-900">No templates found</h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            {search.trim()
              ? `No templates match "${search}".`
              : "Save a workflow as a template to reuse it across projects."}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Organization section */}
          {orgTemplates.length > 0 && (
            <section>
              <SectionHeading icon={Building2} label="Organization" count={orgTemplates.length} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {orgTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={isOwner(t) ? () => setEditingTemplate(t) : undefined}
                    onDelete={isOwner(t) ? () => setDeletingTemplate(t) : undefined}
                    isOwner={isOwner(t)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Project section */}
          {projectTemplates.length > 0 && (
            <section>
              <SectionHeading icon={FolderKanban} label="Project" count={projectTemplates.length} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {projectTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={isOwner(t) ? () => setEditingTemplate(t) : undefined}
                    onDelete={isOwner(t) ? () => setDeletingTemplate(t) : undefined}
                    isOwner={isOwner(t)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Private section */}
          {privateTemplates.length > 0 && (
            <section>
              <SectionHeading icon={Lock} label="Private" count={privateTemplates.length} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {privateTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={() => setEditingTemplate(t)}
                    onDelete={() => setDeletingTemplate(t)}
                    isOwner={true}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Edit template modal */}
      <CreateTemplateModal
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSuccess={() => {
          setEditingTemplate(null)
          fetchTemplates()
        }}
        template={editingTemplate}
      />

      <ConfirmDialog
        isOpen={!!deletingTemplate}
        title="Delete template?"
        message={`"${deletingTemplate?.name}" will be permanently deleted.`}
        confirmText="Delete"
        type="danger"
        onConfirm={handleDeleteTemplate}
        onCancel={() => setDeletingTemplate(null)}
      />
    </div>
  )
}
