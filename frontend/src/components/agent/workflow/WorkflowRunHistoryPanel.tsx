"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, PlayCircle } from "lucide-react"
import { AgentAPI } from "@/lib/api/agentApi"
import { cn } from "@/lib/utils"
import type { AgentWorkflowRun } from "@/types/agent"

interface WorkflowRunHistoryPanelProps {
  workflowId: string
}

function formatRunTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusColor(status: string): string {
  if (status === "completed") return "text-emerald-600 bg-emerald-500/10"
  if (status === "failed") return "text-red-600 bg-red-500/10"
  if (status.includes("awaiting")) return "text-amber-700 bg-amber-500/10"
  return "text-muted-foreground bg-muted"
}

export function WorkflowRunHistoryPanel({ workflowId }: WorkflowRunHistoryPanelProps) {
  const [runs, setRuns] = useState<AgentWorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<Record<string, AgentWorkflowRun>>({})
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    try {
      const data = await AgentAPI.listWorkflowRuns(workflowId, { limit: 10 })
      setRuns(data)
    } catch {
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const toggleRun = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      return
    }
    setExpandedRunId(runId)
    if (runDetails[runId]) return

    setLoadingDetailId(runId)
    try {
      const detail = await AgentAPI.getWorkflowRun(runId)
      setRunDetails((prev) => ({ ...prev, [runId]: detail }))
    } catch {
      // keep collapsed state but no detail
    } finally {
      setLoadingDetailId(null)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <PlayCircle className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Recent executions</h2>
        <span className="text-xs text-muted-foreground">Read-only preview</span>
      </div>

      <div className="max-h-64 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No executions yet. Runs appear here after the Agent executes this workflow.
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const expanded = expandedRunId === run.id
              const detail = runDetails[run.id]
              return (
                <div key={run.id} className="rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => toggleRun(run.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {formatRunTime(run.created_at)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            statusColor(run.status)
                          )}
                        >
                          {run.status}
                        </span>
                      </div>
                      {run.current_step_order != null && (
                        <p className="text-[10px] text-muted-foreground">
                          Step {run.current_step_order}
                          {run.error_message ? ` · ${run.error_message}` : ""}
                        </p>
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-border px-3 py-2">
                      {loadingDetailId === run.id ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : detail?.step_executions?.length ? (
                        <div className="space-y-1">
                          {detail.step_executions.map((exec) => (
                            <div
                              key={exec.id}
                              className="flex items-start gap-2 rounded bg-muted/20 px-2 py-1.5"
                            >
                              <span className="text-[10px] font-mono text-muted-foreground">
                                #{exec.step_order}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">
                                  {exec.step_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {exec.status}
                                  {exec.error_message ? ` · ${exec.error_message}` : ""}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          No step execution details available.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
