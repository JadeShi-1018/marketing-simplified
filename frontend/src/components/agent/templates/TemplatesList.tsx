"use client"

import { useEffect, useState } from "react"
import { Plus, Loader2, Search, Filter, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import toast from "react-hot-toast"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentWorkflowTemplate, TemplateCategory, TemplateShareScope } from "@/types/agent"
import { TemplateCard } from "./TemplateCard"
import { CreateTemplateModal } from "./CreateTemplateModal"
import ConfirmDialog from "@/components/common/ConfirmDialog"

interface TemplatesListProps {
  userId?: string
}

export function TemplatesList({ userId }: TemplatesListProps) {
  const [templates, setTemplates] = useState<AgentWorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "all">("all")
  const [scopeFilter, setScopeFilter] = useState<TemplateShareScope | "all">("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<AgentWorkflowTemplate | null>(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const data = await AgentAPI.listTemplates()
      setTemplates(data)
    } catch (error) {
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
    } catch (error: any) {
      const errorData = error.response?.data
      if (errorData?.error === "Template is in use by active project bindings") {
        const projects = errorData.active_bindings?.map((b: any) => b.project_name).join(", ") || "some projects"
        toast.error(`Cannot delete: This template is currently applied to ${projects}. Remove the bindings first.`)
      } else {
        toast.error("Failed to delete template")
      }
    } finally {
      setDeletingTemplateId(null)
    }
  }

  const handleEdit = (template: AgentWorkflowTemplate) => {
    setEditingTemplate(template)
    setShowCreateModal(true)
  }

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter
    const matchesScope = scopeFilter === "all" || t.share_scope === scopeFilter
    return matchesSearch && matchesCategory && matchesScope
  })

  // Group by scope
  const myTemplates = filteredTemplates.filter(t => t.share_scope === "private")
  const orgTemplates = filteredTemplates.filter(t => t.share_scope === "organization")

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
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as TemplateShareScope | "all")}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <Workflow className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-medium text-card-foreground mb-1">
            No templates yet
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create reusable workflow templates to standardize AI Agent behavior across projects
          </p>
          <Button onClick={() => setShowCreateModal(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Template
          </Button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No templates match your filters
        </div>
      ) : (
        <div className="space-y-6">
          {/* My Templates */}
          {myTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">My Templates</h3>
              <div className="space-y-3">
                {myTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={handleEdit}
                    onDelete={setDeletingTemplateId}
                    canEdit={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Organization Templates */}
          {orgTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Organization Templates</h3>
              <div className="space-y-3">
                {orgTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={handleEdit}
                    onDelete={setDeletingTemplateId}
                    canEdit={userId === template.created_by}
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
        message="This action cannot be undone. The template will be permanently deleted. If this template is applied to any projects, you must remove those bindings first."
        type="danger"
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingTemplateId(null)}
      />
    </div>
  )
}
