"use client"

import { useEffect, useState } from "react"
import { useAgentLayout } from "../AgentLayoutContext"
import { cn } from "@/lib/utils"
import { AnomalyAlerts } from "../overview/AnomalyAlerts"
import { RecentDecisions } from "../overview/RecentDecisions"
import { AgentAPI } from "@/lib/api/agentApi"
import { AgentDecisionListSkeleton } from "@/components/agent/skeletons/AgentSkeletons"
import { Button } from "@/components/ui/button"
import { CheckCircle2, X, XCircle } from "lucide-react"

type TabValue = "alerts" | "decisions"

const tabs: { value: TabValue; label: string }[] = [
  { value: "alerts", label: "Alerts" },
  { value: "decisions", label: "Decisions" },
]

type MiroDialogState =
  | null
  | {
      status: "success" | "failed"
      boardId?: string
      workflowRunId?: string
      lastUpdatedAt: number
    }

export function RightPanel() {
  const { isRightPanelOpen, setActiveView, setPendingDecisionId } = useAgentLayout()
  const [activeTab, setActiveTab] = useState<TabValue>("alerts")
  const [anomalies, setAnomalies] = useState<{ type: string; severity: string; campaign: string; description: string; cost: number; roas?: number }[]>([])
  const [anomaliesLoading, setAnomaliesLoading] = useState(true)
  const [miroDialog, setMiroDialog] = useState<MiroDialogState>(null)

  // Load latest anomalies from backend on mount
  useEffect(() => {
    AgentAPI.fetchLatestAnomalies()
      .then((data) => { if (data?.length) setAnomalies(data) })
      .catch(() => {})
      .finally(() => setAnomaliesLoading(false))
  }, [])

  // Listen for analysis-complete events from chat (session restore only)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.anomalies) {
        localStorage.removeItem("agent-dismissed-alerts")
        setAnomalies(detail.anomalies)
      }
    }
    window.addEventListener("agent:analysis-complete", handler)
    return () => window.removeEventListener("agent:analysis-complete", handler)
  }, [])

  // Listen for individual anomaly additions from the AnomalyCard "+ Add" button.
  // Converts AnomalyItem shape into the RightPanel anomaly shape.
  useEffect(() => {
    const handler = (e: Event) => {
      const raw = (e as CustomEvent).detail
      if (!raw) return
      const mapped = {
        type: raw.metric || raw.type || "",
        severity: raw.severity || "info",
        campaign: raw.campaign || "",
        description: raw.description || "",
        cost: typeof raw.current_value === "number" ? raw.current_value : 0,
        roas: undefined as number | undefined,
      }
      setAnomalies((prev) => {
        const exists = prev.some(
          (a) => a.description === mapped.description && a.campaign === mapped.campaign
        )
        if (exists) return prev
        return [...prev, mapped]
      })
    }
    window.addEventListener("agent:add-alert", handler)
    return () => window.removeEventListener("agent:add-alert", handler)
  }, [])

  // Listen for Miro generation completion events from chat.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { status?: "success" | "failed"; boardId?: string; workflowRunId?: string }
        | undefined
      if (!detail?.status) return
      setMiroDialog({
        status: detail.status,
        boardId: detail.boardId,
        workflowRunId: detail.workflowRunId,
        lastUpdatedAt: Date.now(),
      })
    }
    window.addEventListener("agent:miro-status", handler)
    return () => window.removeEventListener("agent:miro-status", handler)
  }, [])

  const handleDecisionSelect = (decisionId: number) => {
    setActiveView("decisions")
    setPendingDecisionId(decisionId)
  }

  return (
    <div
      data-tour="tour-right-panel"
      className={cn(
        "h-full border-l border-border bg-background transition-all duration-300 overflow-hidden",
        isRightPanelOpen ? "w-80" : "w-0"
      )}
    >
      <div className="w-80 h-full flex flex-col">
        {/* Custom Tab Buttons */}
        <div className="flex border-b border-border px-2 pt-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.value
                  ? "border-blue-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-card-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Alerts Tab */}
          <div className={cn("p-3", activeTab !== "alerts" && "hidden")}>
            {miroDialog && (
              <div
                className={cn(
                  "mb-3 rounded-lg border px-3 py-2 text-sm",
                  miroDialog.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-destructive/20 bg-destructive/10 text-foreground"
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    {miroDialog.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {miroDialog.status === "success"
                            ? "Miro board generated successfully."
                            : "Miro board generation failed."}
                        </p>
                        {miroDialog.status !== "success" && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Please try again.
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1 hover:bg-black/5"
                        aria-label="Dismiss"
                        onClick={() => setMiroDialog(null)}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                    {miroDialog.status === "success" && miroDialog.boardId && (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            window.location.href = `/miro/${miroDialog.boardId}`
                          }}
                        >
                          Open Miro board
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <AnomalyAlerts anomalies={anomalies} loading={anomaliesLoading} compact />
          </div>

          {/* Decisions Tab */}
          <div className={cn("p-3", activeTab !== "decisions" && "hidden")}>
            <RecentDecisions
              compact
              onSelect={handleDecisionSelect}
              loadingFallback={<AgentDecisionListSkeleton compact rows={4} />}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
