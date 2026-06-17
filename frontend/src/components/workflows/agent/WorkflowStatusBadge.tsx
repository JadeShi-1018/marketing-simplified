import type { AgentWorkflowDefinition } from "@/types/agent"

const STATUS_STYLES: Record<AgentWorkflowDefinition["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  draft: "bg-amber-50 text-amber-800 ring-amber-600/20",
  archived: "bg-gray-100 text-gray-600 ring-gray-500/20",
}

export function WorkflowStatusBadge({ status }: { status: AgentWorkflowDefinition["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}
