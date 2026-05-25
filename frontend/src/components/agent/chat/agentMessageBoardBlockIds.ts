import type { WorkflowStepState } from "@/types/agent"

type MessageForBlockIds = {
  id: string
  content: string
  type?: string
  stepProgress?: unknown[]
  navigateTo?: string
  navigateLabel?: string
  anomalies?: unknown[]
  recommendedTasks?: unknown[]
}

export type AssistantMessageBlockIdsOptions = {
  latestAnalysisMessageId?: string | null
  showFollowUpToggle?: boolean
  stepState?: WorkflowStepState
}

/** Block ids for an assistant message in the same render order as MessageList. */
export function getAssistantMessageBlockIds(
  message: MessageForBlockIds,
  options: AssistantMessageBlockIdsOptions = {}
): string[] {
  const { latestAnalysisMessageId, showFollowUpToggle, stepState } = options
  const ids: string[] = []

  if (message.content && message.type !== "calendar_invite") {
    ids.push(`${message.id}-bubble`)
  }

  if (message.stepProgress && message.stepProgress.length > 0) {
    ids.push(`${message.id}-steps`)
  }

  if (message.navigateTo && message.navigateLabel) {
    ids.push(`${message.id}-nav`)
  }

  if (message.type === "calendar_invite") {
    ids.push(`${message.id}-calendar`)
  }

  if (message.anomalies && message.anomalies.length > 0) {
    ids.push(`${message.id}-anomalies`)
  }

  if (
    message.recommendedTasks &&
    message.recommendedTasks.length > 0 &&
    message.type === "analysis"
  ) {
    ids.push(`${message.id}-tasks`)
  }

  if (
    showFollowUpToggle &&
    message.id === latestAnalysisMessageId &&
    (!stepState || stepState.tasksCreated)
  ) {
    ids.push(`${message.id}-followup`)
  }

  return ids
}
