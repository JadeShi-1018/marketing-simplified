"use client"

import {
  MoreHorizontal,
  Pencil,
  PlusCircle,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { AgentWorkflowTemplate, TemplateCategory } from "@/types/agent"
import StepIconStack from "./StepIconStack"
import { useHoverCard } from "./useHoverCard"
import HoverCardPortal from "./HoverCardPortal"
import WorkflowHoverPreview from "./WorkflowHoverPreview"

const CATEGORY_CONFIG: Record<
  TemplateCategory,
  { label: string; bg: string; text: string }
> = {
  review: { label: "Review", bg: "bg-blue-50", text: "text-blue-700" },
  optimization: { label: "Optimization", bg: "bg-green-50", text: "text-green-700" },
  analysis: { label: "Analysis", bg: "bg-violet-50", text: "text-violet-700" },
  reporting: { label: "Reporting", bg: "bg-orange-50", text: "text-orange-700" },
  other: { label: "Other", bg: "bg-gray-100", text: "text-gray-600" },
}

const SCOPE_CONFIG = {
  private: { label: "Private", bg: "bg-gray-100", text: "text-gray-600" },
  organization: { label: "Org", bg: "bg-teal-50", text: "text-teal-700" },
  public: { label: "Public", bg: "bg-indigo-50", text: "text-indigo-700" },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

interface TemplateCardProps {
  template: AgentWorkflowTemplate
  onApply?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isOwner?: boolean
}

export default function TemplateCard({
  template,
  onApply,
  onEdit,
  onDelete,
  isOwner,
}: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const category = CATEGORY_CONFIG[template.category] ?? CATEGORY_CONFIG.other
  const scope = SCOPE_CONFIG[template.share_scope] ?? SCOPE_CONFIG.private
  const { cardRef, isVisible, style, onMouseEnter, onMouseLeave } = useHoverCard()

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  return (
    <>
    <HoverCardPortal isVisible={isVisible} style={style}>
      <WorkflowHoverPreview
        name={template.name}
        description={template.description}
        stepTypes={template.workflow_step_types ?? []}
      />
    </HoverCardPortal>
    <div
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-150 hover:border-violet-200 hover:shadow-md">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <StepIconStack stepTypes={template.workflow_step_types ?? []} size={36} />

        <div className="relative ml-auto" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Template options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 min-w-[160px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
              {isOwner && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onEdit?.()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onDelete?.()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-3 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${category.bg} ${category.text}`}
          >
            {category.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${scope.bg} ${scope.text}`}
          >
            {scope.label}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-semibold leading-snug text-gray-900">
          {template.name}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500">
          {template.description || (
            <span className="italic text-gray-400">No description</span>
          )}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {template.workflow_step_count ?? 0} step
            {(template.workflow_step_count ?? 0) !== 1 ? "s" : ""}
            {template.applied_project_count
              ? ` · Used in ${template.applied_project_count} project${template.applied_project_count !== 1 ? "s" : ""}`
              : ""}
          </span>
          <span className="text-xs text-gray-400">
            {formatDate(template.created_at)}
          </span>
        </div>
        <button
          type="button"
          onClick={onApply}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Apply to project
        </button>
      </div>
    </div>
    </>
  )
}
