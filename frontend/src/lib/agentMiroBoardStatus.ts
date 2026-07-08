export type MiroBoardCardStatus =
  | "idle"
  | "waiting_tasks_generation"
  | "generating"
  | "retrying"
  | "ready"
  | "failed"

export type ChatMessageLike = {
  role?: "user" | "assistant"
  content?: string
  eventType?: string
  workflowRunId?: string
  navigateHref?: string
}

export type DeriveMiroBoardCardStateOptions = {
  miroGenerateInFlight?: boolean
  approvalRequired?: boolean
  tasksCreated?: boolean
  wantsTasks?: boolean
}

export type MiroBoardCardState = {
  status: MiroBoardCardStatus
  boardHref?: string
  errorMessage?: string
}

/** Only treat "miro_board_created" as done — a prior failure can be retried for the same workflow_run_id. */
export function getPendingMiroWorkflowRunIds(messages: ChatMessageLike[]): string[] {
  const completed = new Set(
    messages
      .filter((message) => message.workflowRunId && message.eventType === "miro_board_created")
      .map((message) => message.workflowRunId as string)
  )

  return messages
    .filter((message) => message.eventType === "miro_generation_started" && message.workflowRunId)
    .map((message) => message.workflowRunId as string)
    .filter((workflowRunId) => !completed.has(workflowRunId))
}

function getLatestTerminalMiroEvent(
  messages: ChatMessageLike[]
): { type: "ready" | "failed"; message: ChatMessageLike; index: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.eventType === "miro_board_created") {
      return { type: "ready", message, index: i }
    }
    if (message.eventType === "miro_generation_failed") {
      return { type: "failed", message, index: i }
    }
  }
  return null
}

export function deriveMiroBoardCardState(
  messages: ChatMessageLike[],
  options: DeriveMiroBoardCardStateOptions = {}
): MiroBoardCardState {
  const {
    miroGenerateInFlight = false,
    approvalRequired = false,
    tasksCreated = false,
    wantsTasks = false,
  } = options

  const terminal = getLatestTerminalMiroEvent(messages)
  if (terminal?.type === "ready") {
    const boardHref = terminal.message.navigateHref
    return { status: "ready", boardHref }
  }

  const pendingRuns = getPendingMiroWorkflowRunIds(messages)
  const startedAfterFailure = terminal?.type === "failed"
    ? messages
        .slice(terminal.index + 1)
        .some((message) => message.eventType === "miro_generation_started" && message.workflowRunId)
    : false
  const isGenerating =
    miroGenerateInFlight ||
    (terminal?.type === "failed" ? startedAfterFailure : pendingRuns.length > 0)

  if (isGenerating) {
    if (terminal?.type === "failed") {
      return { status: "retrying" }
    }
    return { status: "generating" }
  }

  if (terminal?.type === "failed") {
    return {
      status: "failed",
      errorMessage: terminal.message.content,
    }
  }

  if (approvalRequired && wantsTasks && !tasksCreated) {
    return { status: "waiting_tasks_generation" }
  }

  return { status: "idle" }
}
