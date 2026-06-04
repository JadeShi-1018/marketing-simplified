import type { WorkflowStepState } from "@/types/agent"

export type MessageForBlockIds = {
  id: string
  role?: "user" | "assistant"
  content: string
  type?: string
  eventType?: string
  stepProgress?: unknown[]
  navigateTo?: string
  navigateLabel?: string
  anomalies?: unknown[]
  recommendedTasks?: unknown[]
}

/** Last queued Miro message — action cards render immediately after it when present. */
export function getMiroCardsAnchorMessageId(
  messages: MessageForBlockIds[]
): string | null {
  let anchorId: string | null = null
  for (const message of messages) {
    if (message.role === "assistant" && message.eventType === "miro_generation_started") {
      anchorId = message.id
    }
  }
  return anchorId
}

function getMiroActionCardBlockIds(options: {
  bottomCardsMessageId: string
  showBottomActionCards?: boolean
  showMiroApproval?: boolean
}): string[] {
  const ids: string[] = []
  if (options.showBottomActionCards) {
    ids.push(`${options.bottomCardsMessageId}-miro-generate`)
  }
  if (options.showMiroApproval) {
    ids.push(`${options.bottomCardsMessageId}-miro-approval`)
  }
  return ids
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
    (message.type === "analysis" || message.type === "tasks_created")
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
  const miroAnchorId = getMiroCardsAnchorMessageId(messages)
  const miroCardBlockIds = getMiroActionCardBlockIds(options)

  for (const message of messages) {
    if (message.type === "approval_request") continue
    if (message.role !== "assistant") continue
    ids.push(...getAssistantMessageBlockIds(message, options))
    if (message.id === miroAnchorId) {
      ids.push(...miroCardBlockIds)
    }
  }

  if (!miroAnchorId && miroCardBlockIds.length > 0) {
    ids.push(...miroCardBlockIds)
  }

  if (options.showReupload) {
    ids.push("reupload")
  }

  return ids
}
