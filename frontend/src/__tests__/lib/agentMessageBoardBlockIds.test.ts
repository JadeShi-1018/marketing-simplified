import {
  getAssistantMessageBlockIds,
  getMessageBoardBlockIds,
} from "@/components/agent/chat/agentMessageBoardBlockIds"

describe("agentMessageBoardBlockIds", () => {
  const analysisMessage = {
    id: "msg-analysis",
    role: "assistant" as const,
    content: "Summary",
    type: "analysis",
    recommendedTasks: [{ title: "Task A" }],
  }

  const followUpMessage = {
    id: "msg-followup",
    role: "assistant" as const,
    content: "Here is more detail.",
    type: "text" as const,
  }

  it("orders assistant message blocks before bottom action cards", () => {
    const ids = getMessageBoardBlockIds([analysisMessage, followUpMessage], {
      bottomCardsMessageId: "msg-analysis",
      showBottomActionCards: true,
      showMiroApproval: true,
      showReupload: true,
    })

    const tasksIdx = ids.indexOf("msg-analysis-tasks")
    const bubbleIdx = ids.indexOf("msg-followup-bubble")
    const miroGenerateIdx = ids.indexOf("msg-analysis-miro-generate")
    const miroApprovalIdx = ids.indexOf("msg-analysis-miro-approval")

    expect(tasksIdx).toBeGreaterThanOrEqual(0)
    expect(bubbleIdx).toBeGreaterThan(tasksIdx)
    expect(miroGenerateIdx).toBeGreaterThan(bubbleIdx)
    expect(miroApprovalIdx).toBeGreaterThan(miroGenerateIdx)
  })

  it("matches per-message block ids from getAssistantMessageBlockIds", () => {
    const boardIds = getMessageBoardBlockIds([analysisMessage], {
      bottomCardsMessageId: "msg-analysis",
    })
    const messageIds = getAssistantMessageBlockIds(analysisMessage, {})
    expect(boardIds.slice(0, messageIds.length)).toEqual(messageIds)
  })
})
