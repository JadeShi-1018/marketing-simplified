import type { WorkflowStepState } from "@/types/agent"

export type MessageForBlockIds = {
  id: string
  role?: "user" | "assistant"
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

export type MessageBoardBlockIdsOptions = AssistantMessageBlockIdsOptions & {
  bottomCardsMessageId: string
  showBottomActionCards?: boolean
  showMiroApproval?: boolean
  showReupload?: boolean
}

/** All board block ids in top-to-bottom render order (matches MessageList). */
export function getMessageBoardBlockIds(
  messages: MessageForBlockIds[],
  options: MessageBoardBlockIdsOptions
): string[] {
  const ids: string[] = []

  for (const message of messages) {
    if (message.type === "approval_request") continue
    if (message.role !== "assistant") continue
    ids.push(...getAssistantMessageBlockIds(message, options))
  }

  if (options.showBottomActionCards) {
    ids.push(`${options.bottomCardsMessageId}-miro-generate`)
    ids.push(`${options.bottomCardsMessageId}-distribute`)
  }

  if (options.showMiroApproval) {
    ids.push(`${options.bottomCardsMessageId}-miro-approval`)
  }

  if (options.showReupload) {
    ids.push("reupload")
  }

  return ids
}
