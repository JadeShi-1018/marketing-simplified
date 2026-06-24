"use client"

import { useEffect, useState } from "react"
import { Building2, FolderKanban, Lock, Loader2, Plus, Search, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import toast from "react-hot-toast"
import { AgentAPI } from "@/lib/api/agentApi"
import { useAuthStore } from "@/lib/authStore"
import type { AgentWorkflowTemplate, TemplateCategory } from "@/types/agent"
import { TemplateCard } from "./TemplateCard"
import { CreateTemplateModal } from "./CreateTemplateModal"
import { isTemplateOwner } from "./templateOwnership"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Filter } from "lucide-react"

interface TemplatesListProps {
  userId?: string
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
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  )
}

export function TemplatesList({ userId }: TemplatesListProps) {
  const user = useAuthStore((s) => s.user)

  const [templates, setTemplates] = useState<AgentWorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "all">("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<AgentWorkflowTemplate | null>(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const data = await AgentAPI.listTemplates()
      setTemplates(data)
    } catch {
      toast.error("Failed to load templates")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleDelete = async () => {
    if (!deletingTemplateId) return
    try {
      await AgentAPI.deleteTemplate(deletingTemplateId)
      toast.success("Template deleted successfully")
      fetchTemplates()
    } catch {
      toast.error("Failed to delete template")
    } finally {
      setDeletingTemplateId(null)
    }
  }

  const handleEdit = (template: AgentWorkflowTemplate) => {
    setEditingTemplate(template)
    setShowCreateModal(true)
  }

  const filtered = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  // Three sections: org → project → private
  const orgTemplates = filtered.filter((t) => !!t.organization)
  const projectTemplates = filtered.filter((t) => !t.organization && (t.project_list?.length ?? 0) > 0)
  const privateTemplates = filtered.filter((t) => !t.organization && !(t.project_list?.length))

  const isOwner = (t: AgentWorkflowTemplate) =>
    isTemplateOwner(t, userId ?? user?.id)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-card-foreground">Workflow Templates</h2>
        <Button onClick={() => setShowCreateModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as TemplateCategory | "all")}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="optimization">Optimization</SelectItem>
            <SelectItem value="analysis">Analysis</SelectItem>
            <SelectItem value="reporting">Reporting</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {templates.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Workflow className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-medium text-card-foreground mb-1">No templates yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create reusable workflow templates to standardize AI Agent behavior across projects
          </p>
          <Button onClick={() => setShowCreateModal(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Template
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No templates match your filters
        </div>
      ) : (
        <div className="space-y-6">
          {/* Organization templates */}
          {orgTemplates.length > 0 && (
            <div>
              <SectionHeading icon={Building2} label="Organization" count={orgTemplates.length} />
              <div className="space-y-3">
                {orgTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={handleEdit}
                    onDelete={setDeletingTemplateId}
                    canEdit={isOwner(t)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Project templates */}
          {projectTemplates.length > 0 && (
            <div>
              <SectionHeading icon={FolderKanban} label="Project" count={projectTemplates.length} />
              <div className="space-y-3">
                {projectTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={handleEdit}
                    onDelete={setDeletingTemplateId}
                    canEdit={isOwner(t)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Private templates */}
          {privateTemplates.length > 0 && (
            <div>
              <SectionHeading icon={Lock} label="Private" count={privateTemplates.length} />
              <div className="space-y-3">
                {privateTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={handleEdit}
                    onDelete={setDeletingTemplateId}
                    canEdit={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Template Modal */}
      <CreateTemplateModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setEditingTemplate(null)
        }}
        onSuccess={() => {
          fetchTemplates()
          toast.success(editingTemplate ? "Template updated successfully" : "Template created successfully")
        }}
        template={editingTemplate}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingTemplateId}
        title="Delete Template?"
        message="This action cannot be undone. The template will be permanently deleted."
        type="danger"
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingTemplateId(null)}
      />
    </div>
  )
}
