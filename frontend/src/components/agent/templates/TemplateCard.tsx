"use client"

import { useState } from "react"
import { MoreVertical, Pencil, Trash2, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import type { AgentWorkflowTemplate } from "@/types/agent"
import { cn } from "@/lib/utils"

interface TemplateCardProps {
  template: AgentWorkflowTemplate
  onEdit: (template: AgentWorkflowTemplate) => void
  onDelete: (templateId: string) => void
  canEdit: boolean // Only creator can edit
}

const CATEGORY_COLORS: Record<string, string> = {
  review: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  optimization: "bg-green-500/10 text-green-700 dark:text-green-300",
  analysis: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  reporting: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
}

function ScopeBadges({ template }: { template: AgentWorkflowTemplate }) {
  const badges: React.ReactNode[] = []
  if (template.organization) {
    badges.push(
      <Badge key="org" variant="outline" className="shrink-0 text-[10px] bg-teal-50 text-teal-700 border-teal-200">
        Org: {template.organization_name ?? "Organization"}
      </Badge>
    )
  }
  if (template.project) {
    badges.push(
      <Badge key="proj" variant="outline" className="shrink-0 text-[10px] bg-violet-50 text-violet-700 border-violet-200">
        Project: {template.project_name ?? "Project"}
      </Badge>
    )
  }
  if (badges.length === 0) {
    badges.push(
      <Badge key="private" variant="outline" className="shrink-0 text-[10px]">
        Private
      </Badge>
    )
  }
  return <>{badges}</>
}

export function TemplateCard({
  template,
  onEdit,
  onDelete,
  canEdit,
}: TemplateCardProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const categoryColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.other

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Template info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-card-foreground truncate">
              {template.name}
            </h3>
            <Badge variant="secondary" className={cn("shrink-0", categoryColor)}>
              {template.category}
            </Badge>
            <ScopeBadges template={template} />
          </div>

          {template.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {template.description}
            </p>
          )}

          {/* Workflow info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Workflow: {template.workflow_name || "Unknown"}</span>
            {template.workflow_step_count !== undefined && (
              <span>{template.workflow_step_count} steps</span>
            )}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {template.applied_project_count !== undefined && (
              <span>Applied to {template.applied_project_count} project{template.applied_project_count !== 1 ? "s" : ""}</span>
            )}
            <span className="text-[10px]">
              {new Date(template.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        {canEdit && (
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(template)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {/* TODO: Clone */}}>
                <Copy className="h-4 w-4 mr-2" />
                Clone
              </DropdownMenuItem>
              {template.workflow_definition && (
                <DropdownMenuItem onClick={() => {/* TODO: View workflow */}}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Workflow
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(template.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
