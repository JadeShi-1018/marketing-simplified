"use client"

import { Loader2, Redo2, Save, Undo2 } from "lucide-react"

interface CanvasToolbarProps {
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  isSaving: boolean
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
}

export default function CanvasToolbar({
  canUndo,
  canRedo,
  isDirty,
  isSaving,
  onUndo,
  onRedo,
  onSave,
}: CanvasToolbarProps) {
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
      </div>
    </div>
  )
}
