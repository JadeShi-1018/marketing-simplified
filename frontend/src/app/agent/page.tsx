"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
import { useAgentLayout } from "@/components/agent/AgentLayoutContext"
import { OverviewDashboard } from "@/components/agent/overview/OverviewDashboard"
import { SpreadsheetView } from "@/components/agent/spreadsheet/SpreadsheetView"
import { TaskBoard } from "@/components/agent/taskboard/TaskBoard"
import { WorkflowList } from "@/components/agent/workflow/WorkflowList"
import { SettingsPage } from "@/components/agent/layout/SettingsPage"
import { normalizeAgentView } from "@/lib/agentView"

export default function AgentPage() {
  const { activeView, setActiveView } = useAgentLayout()
  const searchParams = useSearchParams()

  useEffect(() => {
    const viewParam = searchParams.get("view")
    if (viewParam) {
      const normalized = normalizeAgentView(viewParam)
      if (normalized !== activeView) {
        setActiveView(normalized)
      }
    }
  }, [searchParams, activeView, setActiveView])

  return (
    <ProtectedRoute renderChildrenWhileLoading>
      <div data-tour="tour-main-content" className="h-full">
        {activeView === "overview" && <OverviewDashboard />}
        {activeView === "spreadsheets" && <SpreadsheetView />}
        {activeView === "tasks" && <TaskBoard />}
        {activeView === "workflows" && <WorkflowList />}
        {activeView === "settings" && <SettingsPage />}
      </div>
    </ProtectedRoute>
  )
}
