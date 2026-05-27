"use client"

import { useParams } from "next/navigation"
import { AppliedWorkflowsList } from "@/components/agent/project-workflows/AppliedWorkflowsList"

export default function AgentWorkflowsSettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-card-foreground">Agent Workflows</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure which workflow templates the AI Agent uses for this project
        </p>
      </div>

      <AppliedWorkflowsList projectId={projectId} />
    </div>
  )
}
