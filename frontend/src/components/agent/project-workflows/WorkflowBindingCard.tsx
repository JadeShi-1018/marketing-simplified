"use client"

import { useState } from "react"
import { MoreVertical, Pencil, Trash2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import type { AgentProjectWorkflowBinding } from "@/types/agent"
import { cn } from "@/lib/utils"

interface WorkflowBindingCardProps {
  binding: AgentProjectWorkflowBinding
  onEdit: (binding: AgentProjectWorkflowBinding) => void
  onRemove: (bindingId: string) => void
  onSetDefault: (bindingId: string) => void
}

const TRIGGER_MODE_LABELS: Record<string, string> = {
  file_upload: "When user uploads file",
  analyze_action: "When analyze action triggered",
  message_keyword: "Keywords",
}

const CATEGORY_COLORS: Record<string, string> = {
  review: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  optimization: "bg-green-500/10 text-green-700 dark:text-green-300",
  analysis: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  reporting: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
}

export function WorkflowBindingCard({
  binding,
  onEdit,
  onRemove,
  onSetDefault,
}: WorkflowBindingCardProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const category = binding.template_detail?.category || "other"
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other

  return (
    <div
      className={cn(
        "border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors",
        binding.is_default && "ring-2 ring-primary/20"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Template info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-card-foreground truncate">
              {binding.template_detail?.name || "Unknown Template"}
            </h3>
            {binding.is_default && (
              <Badge variant="default" className="shrink-0">
                <Star className="h-3 w-3 mr-1" />
                Default
              </Badge>
            )}
            <Badge variant="secondary" className={cn("shrink-0", categoryColor)}>
              {binding.template_detail?.category || "other"}
            </Badge>
          </div>

          {binding.template_detail?.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
              {binding.template_detail.description}
            </p>
          )}

          {/* Trigger info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium">
              Trigger: {TRIGGER_MODE_LABELS[binding.trigger_mode]}
            </span>
            {binding.trigger_mode === "message_keyword" && binding.trigger_keywords && (
              <div className="flex items-center gap-1">
                {binding.trigger_keywords.slice(0, 3).map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                    {kw}
                  </Badge>
                ))}
                {binding.trigger_keywords.length > 3 && (
                  <span className="text-[10px]">+{binding.trigger_keywords.length - 3}</span>
                )}
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Priority: {binding.priority}</span>
            {binding.applied_by_name && <span>Applied by: {binding.applied_by_name}</span>}
            {binding.template_detail?.workflow_step_count !== undefined && (
              <span>{binding.template_detail.workflow_step_count} steps</span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(binding)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Trigger
            </DropdownMenuItem>
            {!binding.is_default && (
              <DropdownMenuItem onClick={() => onSetDefault(binding.id)}>
                <Star className="h-4 w-4 mr-2" />
                Set as Default
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onRemove(binding.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
