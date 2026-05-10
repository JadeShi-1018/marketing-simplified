"use client"

import { useCallback, useEffect, useState } from "react"
import { FilterBar } from "./FilterBar"
import { KanbanColumn, type ColumnStatus } from "./KanbanColumn"
import type { Task, TaskType, TaskPriority } from "./TaskCard"
import { TaskAPI } from "@/lib/api/taskApi"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { TaskDetailModal } from "./TaskDetailModal"
import { NewTaskModal } from "./NewTaskModal"
// import toast from "react-hot-toast"
import { useTaskFilterParams } from "@/hooks/useTaskFilterParams"
import { TaskFilterPanel } from "@/components/tasks/TaskFilterPanel"
import { AgentTaskBoardSkeleton } from "@/components/agent/skeletons/AgentSkeletons"

const columns: ColumnStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"]
const DEFAULT_COL_WIDTH = 320
const MIN_COL_WIDTH = 240
const MAX_COL_WIDTH = 640
const COL_WIDTHS_STORAGE_KEY = "agent-taskboard:column-widths:v1"

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [filters, setFilters, clearFilters] = useTaskFilterParams()

  const [columnWidths, setColumnWidths] = useState<Record<ColumnStatus, number>>(() => {
    const defaults = Object.fromEntries(columns.map((c) => [c, DEFAULT_COL_WIDTH])) as Record<ColumnStatus, number>
    if (typeof window === "undefined") return defaults
    try {
      const raw = window.localStorage.getItem(COL_WIDTHS_STORAGE_KEY)
      if (!raw) return defaults
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const out = { ...defaults }
      for (const c of columns) {
        const v = parsed?.[c]
        if (typeof v === "number" && Number.isFinite(v)) {
          out[c] = clamp(v, MIN_COL_WIDTH, MAX_COL_WIDTH)
        }
      }
      return out
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths))
    } catch {
      // ignore
    }
  }, [columnWidths])

  const handleStartResize = useCallback((status: ColumnStatus, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = columnWidths[status] ?? DEFAULT_COL_WIDTH

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const next = clamp(startWidth + dx, MIN_COL_WIDTH, MAX_COL_WIDTH)
      setColumnWidths((prev) => (prev[status] === next ? prev : { ...prev, [status]: next }))
    }

    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [columnWidths])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const response = await TaskAPI.getTasks(filters)
      const results = response.data.results || response.data || []
      const mapped: Task[] = results.map((t: Record<string, unknown>) => {
        const ownerObj = t.owner as Record<string, string> | null
        const ownerName = ownerObj
          ? `${ownerObj.first_name || ""} ${ownerObj.last_name || ""}`.trim() || ownerObj.email || "Unknown"
          : "Unassigned"
        return {
          id: String(t.id),
          summary: (t.summary as string) || "Untitled",
          type: (t.type as TaskType) || "execution",
          priority: (t.priority as TaskPriority) || "MEDIUM",
          status: (t.status as string) || "DRAFT",
          dueDate: formatDate(t.due_date as string | null),
          owner: {
            name: ownerName,
            initials: getInitials(ownerName),
          },
        }
      })
      setTasks(mapped)
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    const handler = () => { reload() }
    window.addEventListener("agent:tasks-changed", handler)
    return () => window.removeEventListener("agent:tasks-changed", handler)
  }, [reload])

  // const batchDeleteFn = useCallback(async (id: string | number) => {
  //   await TaskAPI.deleteTask(Number(id))
  // }, [])
  //
  // const batchDeleteComplete = useCallback((deletedIds: (string | number)[]) => {
  //   const idSet = new Set(deletedIds.map(String))
  //   setTasks((prev) => prev.filter((t) => !idSet.has(t.id)))
  //   toast.success(`Deleted ${deletedIds.length} task${deletedIds.length > 1 ? "s" : ""}`)
  // }, [])
  //
  // const batch = useBatchManage({
  //   items: tasks.map((t) => ({ id: t.id })),
  //   deleteFn: batchDeleteFn,
  //   onDeleteComplete: batchDeleteComplete,
  // })

  // Extract unique owners for filter dropdown
  const owners = Array.from(
    new Map(tasks.map((t) => [t.owner.initials, t.owner])).values()
  )

  const filteredTasks = tasks.filter((task) => {
    if (typeFilter !== "all" && task.type !== typeFilter) return false
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false
    if (ownerFilter !== "all" && task.owner.initials !== ownerFilter) return false
    return true
  })

  if (loading) {
    return <AgentTaskBoardSkeleton />
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-3">
        <TaskFilterPanel
          filters={filters}
          onChange={setFilters}
          onClearAll={clearFilters}
        />
      </div>
      <FilterBar
        typeFilter={typeFilter}
        priorityFilter={priorityFilter}
        ownerFilter={ownerFilter}
        onTypeChange={setTypeFilter}
        onPriorityChange={setPriorityFilter}
        onOwnerChange={setOwnerFilter}
        owners={owners}
        // Manage batch delete removed
        onNewTask={() => setShowNewTask(true)}
      />

      {/* Horizontal scroll container so columns never push the page width */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full w-max min-w-full gap-4 pr-1">
          {columns.map((status, idx) => (
            <div
              key={status}
              className="relative h-full shrink-0"
              style={{ width: columnWidths[status] ?? DEFAULT_COL_WIDTH }}
            >
              <KanbanColumn
                status={status}
                tasks={filteredTasks.filter((t) => t.status === status)}
                onCardClick={(task) => setSelectedTask(task)}
                onDeleteDraftTask={(task) => setPendingDeleteTask(task)}
              />

              {/* Resize bar between column titles */}
              {idx < columns.length - 1 && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={(e) => handleStartResize(status, e)}
                  className="group absolute right-[-10px] top-0 z-10 h-12 w-5 cursor-col-resize"
                  title="Drag to resize column"
                >
                  {/* Keep hit-area wide, but only show a short bar on hover */}
                  <div className="mx-auto mt-3 h-6 w-[3px] rounded-full bg-muted-foreground/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      <NewTaskModal open={showNewTask} onClose={() => setShowNewTask(false)} onCreated={reload} />

      <ConfirmDialog
        isOpen={pendingDeleteTask != null}
        title="Delete Draft Task"
        message={
          pendingDeleteTask
            ? `Delete "${pendingDeleteTask.summary}"? This action cannot be undone.`
            : ""
        }
        type="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={async () => {
          const t = pendingDeleteTask
          if (!t || deleting) return
          setDeleting(true)
          try {
            await TaskAPI.deleteTask(Number(t.id))
            setTasks((prev) => prev.filter((x) => x.id !== t.id))
            if (selectedTask?.id === t.id) setSelectedTask(null)
            window.dispatchEvent(new CustomEvent("agent:tasks-changed"))
          } catch {
            // ignore
          } finally {
            setDeleting(false)
            setPendingDeleteTask(null)
          }
        }}
        onCancel={() => pendingDeleteTask && !deleting ? setPendingDeleteTask(null) : null}
      />
    </div>
  )
}
