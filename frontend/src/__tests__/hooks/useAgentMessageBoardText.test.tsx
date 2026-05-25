import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { AgentMessageBoardBlock } from "@/components/agent/chat/AgentMessageBoardBlock"
import { AgentMessageBoardTextProvider } from "@/components/agent/chat/AgentMessageBoardTextContext"
import { useAgentMessageBoardText } from "@/hooks/useAgentMessageBoardText"
import { markAgentMessageBoardSessionQuit } from "@/lib/agentMessageBoardReadState"

function TextProbe({
  target,
  partId,
  blockId,
}: {
  target: string
  partId: string
  blockId: string
}) {
  const { displayed, isWaiting } = useAgentMessageBoardText({ target, partId, blockId })
  return (
    <span data-testid="text" data-waiting={String(isWaiting)}>
      {displayed}
    </span>
  )
}

function ReadTaskSummaryFixture() {
  return (
    <AgentMessageBoardTextProvider sessionId="sess-1" boardMessageIds={["msg-1"]}>
      <AgentMessageBoardBlock blockId="msg-1-tasks">
        <TextProbe
          target="Investigate ROAS drop on Campaign A"
          partId="msg-1-task-0-summary"
          blockId="msg-1-tasks"
        />
      </AgentMessageBoardBlock>
    </AgentMessageBoardTextProvider>
  )
}

describe("useAgentMessageBoardText revisit", () => {
  beforeEach(() => {
    localStorage.clear()
    markAgentMessageBoardSessionQuit("sess-1", ["msg-1"])
  })

  it("shows full target text for parts read before the user left the board", async () => {
    render(<ReadTaskSummaryFixture />)

    await waitFor(() => {
      const node = screen.getByTestId("text")
      expect(node).toHaveTextContent("Investigate ROAS drop on Campaign A")
      expect(node).toHaveAttribute("data-waiting", "false")
    })
  })
})
