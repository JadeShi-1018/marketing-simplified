"use client"

import { useEffect, useState } from "react"
import { Star, FileUp, Zap, MessageSquare } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AgentAPI } from "@/lib/api/agentApi"
import { AGENT_EVENTS } from "@/lib/agentEvents"
import type { LightweightBinding } from "@/types/agent"
import { cn } from "@/lib/utils"

interface ActiveWorkflowTagsProps {
  projectId: string
}

const TRIGGER_MODE_ICONS = {
  file_upload: FileUp,
  analyze_action: Zap,
  message_keyword: MessageSquare,
}

const CATEGORY_COLORS: Record<string, string> = {
  review: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  optimization: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  analysis: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  reporting: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20",
}

export function ActiveWorkflowTags({ projectId }: ActiveWorkflowTagsProps) {
  const [bindings, setBindings] = useState<LightweightBinding[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBindings = async () => {
    try {
      const data = await AgentAPI.listProjectBindings(projectId, true)
      setBindings(data as LightweightBinding[])
    } catch (error) {
      console.error("Failed to fetch workflow bindings:", error)
      setBindings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBindings()

    // Listen for bindings changed events
    const handleBindingsChanged = () => {
      fetchBindings()
    }

    window.addEventListener(AGENT_EVENTS.BINDINGS_CHANGED, handleBindingsChanged)

    return () => {
      window.removeEventListener(AGENT_EVENTS.BINDINGS_CHANGED, handleBindingsChanged)
    }
  }, [projectId])

  if (loading || bindings.length === 0) {
    return null
  }

  const defaultBinding = bindings.find(b => b.is_default)
  const triggerBindings = bindings.filter(b => !b.is_default)

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border">
      <span className="text-xs text-muted-foreground shrink-0">Active Workflows:</span>

      {/* Default workflow */}
      {defaultBinding && (
        <Badge
          variant="outline"
          className={cn(
            "text-xs gap-1.5",
            CATEGORY_COLORS[defaultBinding.template_category] || CATEGORY_COLORS.other
          )}
        >
          <Star className="h-3 w-3 fill-current" />
          {defaultBinding.template_name}
          <span className="text-[10px] opacity-70">(Default)</span>
        </Badge>
      )}

      {/* Trigger-based workflows */}
      {triggerBindings.map((binding) => {
        const Icon = TRIGGER_MODE_ICONS[binding.trigger_mode]
        const categoryColor = CATEGORY_COLORS[binding.template_category] || CATEGORY_COLORS.other

        return (
          <Badge
            key={binding.id}
            variant="outline"
            className={cn("text-xs gap-1.5", categoryColor)}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {binding.template_name}
            {binding.trigger_mode === "message_keyword" && binding.trigger_keywords && binding.trigger_keywords.length > 0 && (
              <span className="text-[10px] opacity-70">
                ({binding.trigger_keywords.slice(0, 2).join(", ")}
                {binding.trigger_keywords.length > 2 && `, +${binding.trigger_keywords.length - 2}`})
              </span>
            )}
          </Badge>
        )
      })}
    </div>
  )
}
