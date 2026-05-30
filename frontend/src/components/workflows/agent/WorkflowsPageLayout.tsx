"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Plus } from "lucide-react"
import { CreateWorkflowModal } from "@/components/agent/workflow/CreateWorkflowModal"
import { AgentAPI } from "@/lib/api/agentApi"
import { useAgentWorkflows } from "./hooks/useAgentWorkflows"
import WorkflowsTab from "./tabs/WorkflowsTab"
import TemplatesTab from "./tabs/TemplatesTab"
import toast from "react-hot-toast"

type Tab = "workflows" | "templates"

const TABS: { id: Tab; label: string }[] = [
  { id: "workflows", label: "Workflows" },
  { id: "templates", label: "Templates" },
]

export default function WorkflowsPageLayout() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get("tab")
  const activeTab: Tab =
    rawTab === "templates" ? "templates" : "workflows"

  const { activeProject, hasHydrated, createWorkflow } = useAgentWorkflows()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const needsProject = hasHydrated && !activeProject?.id

  const switchTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === "workflows") {
      params.delete("tab")
    } else {
      params.set("tab", tab)
    }
    router.push(`/workflows${params.size > 0 ? `?${params.toString()}` : ""}`)
  }

  const handleCreate = async (data: { name: string; description?: string }) => {
    try {
      const created = await createWorkflow({ ...data, status: "draft" })
      toast.success("Workflow created")
      setShowCreateModal(false)
      setRefreshKey((k) => k + 1)
      router.push(`/workflows/${created.id}`)
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message || "Failed to create workflow"
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-full bg-[#F7F8FA]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Workflows
          </h1>
          <button
            type="button"
            disabled={needsProject}
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Create workflow
          </button>
        </div>

        {/* ── Tab navigation ── */}
        <div className="mt-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-1">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`relative px-4 pb-3 pt-1 text-sm font-medium transition-colors focus:outline-none ${
                    isActive
                      ? "text-indigo-600"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-indigo-600" />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* ── Tab content ── */}
        <div className="mt-8">
          {activeTab === "workflows" ? (
            <WorkflowsTab
              onCreateClick={() => setShowCreateModal(true)}
              refreshKey={refreshKey}
            />
          ) : (
            <TemplatesTab refreshKey={refreshKey} />
          )}
        </div>
      </div>

      <CreateWorkflowModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
