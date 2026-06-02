"use client"

import { useRouter } from "next/navigation"
import {
  Copy,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { useState, useRef, useEffect } from "react"
import type { AgentWorkflowDefinition } from "@/types/agent"
import StepIconStack from "./StepIconStack"
import { AgentAPI } from "@/lib/api/agentApi"
import { useHoverCard } from "./useHoverCard"
import HoverCardPortal from "./HoverCardPortal"
import WorkflowHoverPreview from "./WorkflowHoverPreview"

const STATUS_CONFIG: Record<
  AgentWorkflowDefinition["status"],
  { dot: string; label: string; bg: string; text: string }
> = {
  active: {
    dot: "bg-emerald-500",
    label: "Active",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  draft: {
    dot: "bg-amber-400",
    label: "Draft",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  archived: {
    dot: "bg-gray-400",
    label: "Archived",
    bg: "bg-gray-100",
    text: "text-gray-500",
  },
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return "—"
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`
    return new Date(iso).toLocaleDateString()
  } catch {
    return "—"
  }
}


interface WorkflowCardProps {
  workflow: AgentWorkflowDefinition
  onDuplicate?: () => void
  onDelete?: () => void
  onStatusChange?: (id: string, newStatus: string) => void
  duplicating?: boolean
  needsProject?: boolean
}

export default function WorkflowCard({
  workflow,
  onDuplicate,
  onDelete,
  onStatusChange,
  duplicating,
  needsProject,
}: WorkflowCardProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [localStatus, setLocalStatus] = useState(workflow.status)
  const [toggling, setToggling] = useState(false)
  const status = STATUS_CONFIG[localStatus]
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

  const openEditor = () => router.push(`/workflows/${workflow.id}`)

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const newStatus = localStatus === "active" ? "draft" : "active"
    setToggling(true)
    try {
      await AgentAPI.updateWorkflow(workflow.id, { status: newStatus })
      setLocalStatus(newStatus as AgentWorkflowDefinition["status"])
      onStatusChange?.(workflow.id, newStatus)
    } catch {
      // revert optimistic update silently; toast handled by API layer
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
    <HoverCardPortal isVisible={isVisible} style={style}>
      <WorkflowHoverPreview
        name={workflow.name}
        description={workflow.description}
        stepTypes={workflow.step_types ?? []}
      />
    </HoverCardPortal>
    <div
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-150 hover:border-indigo-200 hover:shadow-md">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <StepIconStack stepTypes={workflow.step_types ?? []} size={36} />

        <div className="relative ml-auto" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Workflow options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 min-w-[150px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  openEditor()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                disabled={needsProject || duplicating}
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(false)
                  onDuplicate?.()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </button>
              {!workflow.is_system && (
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

      {/* Content — clickable */}
      <button
        type="button"
        className="mt-3 flex-1 text-left"
        onClick={openEditor}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {workflow.name}
          </h3>
          {workflow.is_system && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              <Lock className="h-2.5 w-2.5" />
              System
            </span>
          )}
          {workflow.is_default && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
              Default
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500">
          {workflow.description || (
            <span className="italic text-gray-400">No description</span>
          )}
        </p>
      </button>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          <span className={`text-xs font-medium ${status.text}`}>
            {status.label}
          </span>

          {/* Toggle: only shown when not archived */}
          {localStatus !== "archived" && (
            <button
              type="button"
              disabled={toggling}
              onClick={handleToggleStatus}
              aria-label={localStatus === "active" ? "Set to Draft" : "Activate"}
              title={localStatus === "active" ? "Set to Draft" : "Activate"}
              className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
                localStatus === "active" ? "bg-emerald-500" : "bg-gray-300"
              }`}
              style={{ height: "18px", width: "32px" }}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${
                  localStatus === "active" ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {workflow.step_count ?? 0} step{(workflow.step_count ?? 0) !== 1 ? "s" : ""}
          {workflow.updated_at
            ? ` · ${formatTimeAgo(workflow.updated_at)}`
            : ""}
        </span>
      </div>
    </div>
    </>
  )
}
