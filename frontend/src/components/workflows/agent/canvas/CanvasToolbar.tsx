"use client"

import { useEffect, useRef, useState } from "react"
import { Bookmark, Check, ChevronDown, Loader2, Redo2, Save, Undo2 } from "lucide-react"
import { brandBtnToolbar } from "../workflowBrandClasses"

type WorkflowStatus = "active" | "draft" | "archived"

const STATUS_OPTIONS: {
  value: WorkflowStatus
  label: string
  dot: string
  text: string
}[] = [
  { value: "active", label: "Activate", dot: "bg-emerald-500", text: "text-emerald-700" },
  { value: "draft", label: "Draft", dot: "bg-amber-400", text: "text-amber-700" },
  { value: "archived", label: "Archive", dot: "bg-gray-400", text: "text-gray-500" },
]

const STATUS_BADGE: Record<WorkflowStatus, { bg: string; text: string; dot: string; label: string }> = {
  active: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Active" },
  draft: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400", label: "Draft" },
  archived: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", label: "Archived" },
}

interface CanvasToolbarProps {
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  isSaving: boolean
  currentStatus: WorkflowStatus
  isUpdatingStatus?: boolean
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onStatusChange: (status: WorkflowStatus) => void
  onSaveAsTemplate?: () => void
}

export default function CanvasToolbar({
  canUndo,
  canRedo,
  isDirty,
  isSaving,
  currentStatus,
  isUpdatingStatus,
  onUndo,
  onRedo,
  onSave,
  onStatusChange,
  onSaveAsTemplate,
}: CanvasToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const badge = STATUS_BADGE[currentStatus]

  // Close on outside click
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
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-xl">
        {/* Undo */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Undo"
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>

        {/* Redo */}
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Redo"
          title="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-2 h-5 w-px bg-slate-200" />

        {/* Unsaved dot */}
        {isDirty && !isSaving && (
          <span className="mr-1 h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
        )}

        {/* Save */}
        <button
          type="button"
          disabled={isSaving || !isDirty}
          onClick={onSave}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isSaving ? "Saving…" : "Save"}
        </button>

        {/* Save as Template */}
        {onSaveAsTemplate && (
          <button
            type="button"
            onClick={onSaveAsTemplate}
            className={brandBtnToolbar}
            title="Save current workflow as a reusable template"
          >
            <Bookmark className="h-4 w-4" />
            Template
          </button>
        )}

        <div className="mx-2 h-5 w-px bg-slate-200" />

        {/* Status dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            disabled={isUpdatingStatus}
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${badge.bg} ${badge.text}`}
          >
            {isUpdatingStatus ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
            )}
            {badge.label}
            <ChevronDown className="h-3 w-3" />
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-2 min-w-[140px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    if (opt.value !== currentStatus) onStatusChange(opt.value)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                  <span className="flex-1 text-left">{opt.label}</span>
                  {opt.value === currentStatus && (
                    <Check className="h-3.5 w-3.5 text-indigo-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
