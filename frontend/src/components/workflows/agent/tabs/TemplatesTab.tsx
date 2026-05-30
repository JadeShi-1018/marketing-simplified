"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Layers, Loader2, Search } from "lucide-react"
import toast from "react-hot-toast"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { CreateTemplateModal } from "@/components/agent/templates/CreateTemplateModal"
import type { AgentWorkflowTemplate, TemplateCategory } from "@/types/agent"
import { AgentAPI } from "@/lib/api/agentApi"
import { useProjectStore } from "@/lib/projectStore"
import TemplateCard from "../cards/TemplateCard"
import ApplyTemplateModal from "./ApplyTemplateModal"

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

export default function TemplatesTab({ refreshKey }: TemplatesTabProps) {
  const activeProject = useProjectStore((s) => s.activeProject)
  const currentUserId = useProjectStore((s) => s.activeProject?.id)

  const [templates, setTemplates] = useState<AgentWorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<"all" | TemplateCategory>("all")
  const [editingTemplate, setEditingTemplate] = useState<AgentWorkflowTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<AgentWorkflowTemplate | null>(null)
  const [applyingTemplate, setApplyingTemplate] = useState<AgentWorkflowTemplate | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const data = await AgentAPI.listTemplates(
        categoryFilter !== "all" ? { category: categoryFilter } : undefined
      )
      setTemplates(data)
    } catch {
      toast.error("Failed to load templates")
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

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
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
              categoryFilter === cat.value
                ? "bg-violet-600 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:text-violet-700"
            }`}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onApply={() => setApplyingTemplate(template)}
              onEdit={() => setEditingTemplate(template)}
              onDelete={() => setDeletingTemplate(template)}
            />
          ))}
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

      {/* Apply to project modal */}
      {applyingTemplate && activeProject?.id && (
        <ApplyTemplateModal
          open
          template={applyingTemplate}
          projectId={String(activeProject.id)}
          onClose={() => setApplyingTemplate(null)}
          onSuccess={() => {
            toast.success(`"${applyingTemplate.name}" applied to project`)
            setApplyingTemplate(null)
          }}
        />
      )}
      {applyingTemplate && !activeProject?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-sm text-gray-700">
              Select an active project first to apply this template.
            </p>
            <button
              type="button"
              onClick={() => setApplyingTemplate(null)}
              className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
