"use client"

import { useState } from "react"
import { Bookmark, PlusCircle } from "lucide-react"
import { getStepMeta } from "../canvas/canvasStepMeta"
import { Building2, FolderKanban, Lock } from "lucide-react"
import type { AgentWorkflowDefinition, WorkflowStepType, TemplateCategory } from "@/types/agent"

const MAX_FLOW_NODES = 6

// ── Shared sub-components ─────────────────────────────────────────────────────

function FlowDiagram({ stepTypes }: { stepTypes: WorkflowStepType[] }) {
  const visible = stepTypes.slice(0, MAX_FLOW_NODES)
  const remaining = stepTypes.length - MAX_FLOW_NODES

  if (stepTypes.length === 0) {
    return (
      <div className="flex shrink-0 items-center justify-center bg-slate-50" style={{ height: 130 }}>
        <span className="text-xs text-slate-400">No steps defined</span>
      </div>
    )
  }

  return (
    <div
      className="flex shrink-0 items-center overflow-hidden bg-slate-50 px-4"
      style={{ height: 130 }}
    >
      {visible.map((type, idx) => {
        const meta = getStepMeta(type)
        const Icon = meta.icon
        return (
          <div key={`${type}-${idx}`} className="flex shrink-0 items-center">
            <div
              title={meta.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm ${meta.bgClass}`}
            >
              <Icon className="text-white" style={{ width: 18, height: 18 }} strokeWidth={2} />
            </div>
            {(idx < visible.length - 1 || remaining > 0) && (
              <div className="mx-1 flex items-center gap-0.5">
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="h-1 w-1 rounded-full bg-slate-300" />
              </div>
            )}
          </div>
        )
      })}
      {remaining > 0 && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-600">+{remaining}</span>
        </div>
      )}
    </div>
  )
}

// Pill-style toggle switch
function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
      style={{ width: 32, height: 18 }}
      aria-label={checked ? "Set to Draft" : "Activate"}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}

// ── Workflow hover content ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  AgentWorkflowDefinition["status"],
  { dot: string; text: string; label: string }
> = {
  active:   { dot: "bg-emerald-500", text: "text-emerald-700", label: "Active" },
  draft:    { dot: "bg-amber-400",   text: "text-amber-700",   label: "Draft" },
  archived: { dot: "bg-gray-400",    text: "text-gray-500",    label: "Archived" },
}

interface WorkflowHoverContentProps {
  name: string
  description?: string
  stepTypes: WorkflowStepType[]
  workflowId: string
  currentStatus: AgentWorkflowDefinition["status"]
  onStatusChange: (id: string, newStatus: string) => void
  onSaveAsTemplate?: () => void
}

export function WorkflowHoverContent({
  name,
  description,
  stepTypes,
  workflowId,
  currentStatus,
  onStatusChange,
  onSaveAsTemplate,
}: WorkflowHoverContentProps) {
  const [localStatus, setLocalStatus] = useState(currentStatus)
  const [toggling, setToggling] = useState(false)
  const status = STATUS_CONFIG[localStatus]

  const handleToggle = async (nextChecked: boolean) => {
    const newStatus = nextChecked ? "active" : "draft"
    setToggling(true)
    try {
      // Dynamic import avoids circular dependency with AgentAPI
      const { AgentAPI } = await import("@/lib/api/agentApi")
      await AgentAPI.updateWorkflow(workflowId, { status: newStatus })
      setLocalStatus(newStatus as AgentWorkflowDefinition["status"])
      onStatusChange(workflowId, newStatus)
    } catch {
      // silent — toast handled in AgentAPI
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      <FlowDiagram stepTypes={stepTypes} />
      <div className="flex flex-1 flex-col gap-2 px-5 py-4">
        <p className="text-sm font-semibold leading-snug text-slate-800">{name}</p>
        {description ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-slate-500">{description}</p>
        ) : (
          <p className="text-xs italic text-slate-400">No description</p>
        )}
        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-2">
          {/* Status + toggle — tightly grouped */}
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
            <span className={`text-xs font-medium ${status.text}`}>{status.label}</span>
            {localStatus !== "archived" && (
              <ToggleSwitch
                checked={localStatus === "active"}
                disabled={toggling}
                onChange={handleToggle}
              />
            )}
          </div>

          {/* Divider + Save as Template */}
          {onSaveAsTemplate && (
            <>
              <div className="mx-1 h-4 w-px shrink-0 bg-slate-200" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSaveAsTemplate() }}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                <Bookmark className="h-3 w-3" />
                Template
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Template hover content ────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  review: "Review", optimization: "Optimization",
  analysis: "Analysis", reporting: "Reporting", other: "Other",
}
const CATEGORY_STYLE: Record<TemplateCategory, string> = {
  review: "bg-blue-50 text-blue-700",
  optimization: "bg-green-50 text-green-700",
  analysis: "bg-violet-50 text-violet-700",
  reporting: "bg-orange-50 text-orange-700",
  other: "bg-gray-100 text-gray-600",
}
interface TemplateHoverContentProps {
  name: string
  description?: string
  stepTypes: WorkflowStepType[]
  category: TemplateCategory
  organization?: string
  organizationName?: string
  project?: string
  projectName?: string
  onApply?: () => void
}

export function TemplateHoverContent({
  name,
  description,
  stepTypes,
  category,
  organization,
  organizationName,
  project,
  projectName,
  onApply,
}: TemplateHoverContentProps) {
  const scopeBadges: React.ReactNode[] = []
  if (organization) {
    scopeBadges.push(
      <span key="org" className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
        <Building2 className="h-2.5 w-2.5" />
        {organizationName ?? "Org"}
      </span>
    )
  }
  if (project) {
    scopeBadges.push(
      <span key="proj" className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
        <FolderKanban className="h-2.5 w-2.5" />
        {projectName ?? "Project"}
      </span>
    )
  }
  if (scopeBadges.length === 0) {
    scopeBadges.push(
      <span key="private" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
        <Lock className="h-2.5 w-2.5" />
        Private
      </span>
    )
  }

  return (
    <>
      <FlowDiagram stepTypes={stepTypes} />
      <div className="flex flex-1 flex-col gap-2 px-5 py-4">
        <p className="text-sm font-semibold leading-snug text-slate-800">{name}</p>
        {description ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-slate-500">{description}</p>
        ) : (
          <p className="text-xs italic text-slate-400">No description</p>
        )}
        <div className="mt-auto space-y-2 border-t border-slate-100 pt-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLE[category] ?? "bg-gray-100 text-gray-600"}`}>
              {CATEGORY_LABEL[category] ?? category}
            </span>
            {scopeBadges}
          </div>
          {onApply && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onApply() }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Apply to project
            </button>
          )}
        </div>
      </div>
    </>
  )
}
