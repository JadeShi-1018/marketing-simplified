"use client"

import { useEffect, useState } from "react"
import { Search, Loader2, Check } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { AgentAPI } from "@/lib/api/agentApi"
import type { AgentWorkflowTemplate, AgentProjectWorkflowBinding, TriggerMode } from "@/types/agent"
import { cn } from "@/lib/utils"

interface ApplyTemplateModalProps {
  open: boolean
  onClose: () => void
  onApply: (template: AgentWorkflowTemplate, triggerData: {
    trigger_mode: TriggerMode
    trigger_keywords?: string[]
    priority: number
    is_default: boolean
  }) => void
  projectId: string
  existingBindings: AgentProjectWorkflowBinding[]
}

const CATEGORY_COLORS: Record<string, string> = {
  review: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  optimization: "bg-green-500/10 text-green-700 dark:text-green-300",
  analysis: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  reporting: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
}

export function ApplyTemplateModal({
  open,
  onClose,
  onApply,
  projectId,
  existingBindings,
}: ApplyTemplateModalProps) {
  const [templates, setTemplates] = useState<AgentWorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<AgentWorkflowTemplate | null>(null)
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("message_keyword")
  const [keywords, setKeywords] = useState("")

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const data = await AgentAPI.listTemplates({ project_id: projectId })
      setTemplates(data)
    } catch (error) {
      console.error("Failed to fetch templates:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchTemplates()
      setSelectedTemplate(null)
      setTriggerMode("message_keyword")
      setKeywords("")
    }
  }, [open, projectId])

  const existingTemplateIds = new Set(existingBindings.map(b => b.template))

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  )

  const orgTemplates = filteredTemplates.filter(t => !!t.organization)
  const projectTemplates = filteredTemplates.filter(t => !t.organization && !!t.project)
  const privateTemplates = filteredTemplates.filter(t => !t.organization && !t.project)

  const handleApply = () => {
    if (!selectedTemplate) return

    const keywordList = triggerMode === "message_keyword"
      ? keywords.split(",").map(k => k.trim()).filter(Boolean)
      : undefined

    onApply(selectedTemplate, {
      trigger_mode: triggerMode,
      trigger_keywords: keywordList,
      priority: existingBindings.length > 0 ? Math.max(...existingBindings.map(b => b.priority)) + 1 : 10,
      is_default: existingBindings.length === 0, // First binding is default
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Apply Workflow Template</DialogTitle>
          <DialogDescription>
            Select a template and configure when it should be triggered
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Search */}
          <div className="sticky top-0 bg-background pb-3 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No templates found
                </div>
              ) : (
                [
                  { label: "Organization", items: orgTemplates },
                  { label: "Project", items: projectTemplates },
                  { label: "Private", items: privateTemplates },
                ].map(({ label, items }) =>
                  items.length > 0 ? (
                    <div key={label}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        {label}
                      </h3>
                      <div className="space-y-2">
                        {items.map(template => {
                          const isApplied = existingTemplateIds.has(template.id)
                          const isSelected = selectedTemplate?.id === template.id
                          const categoryColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.other
                          return (
                            <button
                              key={template.id}
                              onClick={() => !isApplied && setSelectedTemplate(template)}
                              disabled={isApplied}
                              className={cn(
                                "w-full border rounded-lg p-3 text-left transition-colors",
                                isApplied && "opacity-50 cursor-not-allowed",
                                isSelected && "border-primary bg-primary/5",
                                !isApplied && !isSelected && "hover:bg-muted/30"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium truncate">{template.name}</span>
                                    {isApplied && (
                                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                                        <Check className="h-3 w-3 mr-1" />
                                        Applied
                                      </Badge>
                                    )}
                                  </div>
                                  {template.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                      {template.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className={cn("text-[10px]", categoryColor)}>
                                      {template.category}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      {template.workflow_step_count} steps
                                    </span>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null
                )
              )}
            </div>
          )}

          {/* Trigger Configuration (shown when template selected) */}
          {selectedTemplate && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-medium mb-3">Trigger Configuration</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">When should this workflow run?</Label>
                  <RadioGroup value={triggerMode} onValueChange={(v) => setTriggerMode(v as TriggerMode)} className="mt-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="file_upload" id="file_upload" />
                      <Label htmlFor="file_upload" className="text-sm font-normal cursor-pointer">
                        When user uploads a file
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="analyze_action" id="analyze_action" />
                      <Label htmlFor="analyze_action" className="text-sm font-normal cursor-pointer">
                        When analyze action triggered
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="message_keyword" id="message_keyword" />
                      <Label htmlFor="message_keyword" className="text-sm font-normal cursor-pointer">
                        When message contains keywords
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {triggerMode === "message_keyword" && (
                  <div>
                    <Label htmlFor="keywords" className="text-sm">
                      Keywords (comma-separated)
                    </Label>
                    <Input
                      id="keywords"
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
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedTemplate || (triggerMode === "message_keyword" && !keywords.trim())}
          >
            Apply Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
