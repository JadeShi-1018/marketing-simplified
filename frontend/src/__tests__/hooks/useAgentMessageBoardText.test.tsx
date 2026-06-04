import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { AgentMessageBoardBlock } from "@/components/agent/chat/AgentMessageBoardBlock"
import { AgentMessageBoardTextProvider } from "@/components/agent/chat/AgentMessageBoardTextContext"
import { useAgentMessageBoardText } from "@/hooks/useAgentMessageBoardText"
import {
  markAgentMessageBoardSessionQuit,
  markAgentMessageBoardTextPartRead,
} from "@/lib/agentMessageBoardReadState"

function TextProbe({
  target,
  partId,
  blockId,
  testId = "text",
}: {
  target: string
  partId: string
  blockId: string
  testId?: string
}) {
  const { displayed, isWaiting } = useAgentMessageBoardText({ target, partId, blockId })
  return (
    <span data-testid={testId} data-waiting={String(isWaiting)}>
      {displayed}
    </span>
  )
}

function BoardFixture({ sessionId }: { sessionId: string }) {
  return (
    <AgentMessageBoardTextProvider sessionId={sessionId}>
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
  })

  it("shows full target text for parts fully read before revisit", async () => {
    markAgentMessageBoardTextPartRead("sess-1", "msg-1-task-0-summary")
    render(<BoardFixture sessionId="sess-1" />)

    await waitFor(() => {
      const node = screen.getByTestId("text")
      expect(node).toHaveTextContent("Investigate ROAS drop on Campaign A")
      expect(node).toHaveAttribute("data-waiting", "false")
    })
  })

  it("shows saved prefix and resumes typing for partial snapshot progress", async () => {
    markAgentMessageBoardSessionQuit("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: {
        "msg-1-task-0-summary": { visibleLength: 10 },
      },
    })

    render(<BoardFixture sessionId="sess-1" />)

    await waitFor(() => {
      const node = screen.getByTestId("text")
      expect(node).toHaveTextContent("Investigate")
      expect(node.textContent).not.toBe("Investigate ROAS drop on Campaign A")
    })
  })

  it("renders fully read text immediately after switching away from another session", async () => {
    markAgentMessageBoardTextPartRead("sess-a", "msg-1-task-0-summary")

    const { rerender } = render(<BoardFixture sessionId="sess-b" />)
    await waitFor(() => {
      expect(screen.getByTestId("text")).toBeInTheDocument()
    })

    rerender(<BoardFixture sessionId="sess-a" />)

    await waitFor(() => {
      const node = screen.getByTestId("text")
      expect(node).toHaveTextContent("Investigate ROAS drop on Campaign A")
      expect(node).toHaveAttribute("data-waiting", "false")
    })
  })

  it("restores partial snapshot after switching away and back", async () => {
    markAgentMessageBoardSessionQuit("sess-a", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: {
        "msg-1-task-0-summary": { visibleLength: 10 },
      },
    })

    const { rerender } = render(<BoardFixture sessionId="sess-b" />)
    await waitFor(() => {
      expect(screen.getByTestId("text")).toBeInTheDocument()
    })

    rerender(<BoardFixture sessionId="sess-a" />)

    await waitFor(() => {
      const node = screen.getByTestId("text")
      expect(node.textContent?.startsWith("Investigat")).toBe(true)
      expect(node.textContent).not.toBe("Investigate ROAS drop on Campaign A")
    })
  })

  it("FIFO queue skips completed blocks and resumes the next partial part", async () => {
    markAgentMessageBoardSessionQuit("sess-1", {
      completedJobIds: ["msg-1-bubble"],
      blockPartsCompleted: {
        "msg-1-bubble": ["msg-1-content"],
      },
      partProgress: {
        "msg-1-content": { visibleLength: 5, complete: true },
        "msg-1-task-0-summary": { visibleLength: 10 },
      },
    })

    render(
      <AgentMessageBoardTextProvider sessionId="sess-1">
        <AgentMessageBoardBlock blockId="msg-1-bubble">
          <TextProbe
            target="Hello world"
            partId="msg-1-content"
            blockId="msg-1-bubble"
            testId="bubble"
          />
        </AgentMessageBoardBlock>
        <AgentMessageBoardBlock blockId="msg-1-tasks">
          <TextProbe
            target="Investigate ROAS drop on Campaign A"
            partId="msg-1-task-0-summary"
            blockId="msg-1-tasks"
            testId="tasks"
          />
        </AgentMessageBoardBlock>
      </AgentMessageBoardTextProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("bubble")).toHaveTextContent("Hello world")
      const tasks = screen.getByTestId("tasks")
      expect(tasks.textContent?.startsWith("Investigat")).toBe(true)
      expect(tasks).not.toHaveTextContent("Investigate ROAS drop on Campaign A")
    })
  })

  it("does not reveal a hydrated later block before an earlier block finishes", async () => {
    markAgentMessageBoardSessionQuit("sess-1", {
      completedJobIds: ["msg-1-tasks", "msg-1-miro-approval"],
      blockPartsCompleted: {
        "msg-1-tasks": ["msg-1-task-0-summary"],
        "msg-1-miro-approval": ["msg-1-miro-approval-title"],
      },
      partProgress: {},
    })

    render(
      <AgentMessageBoardTextProvider
        sessionId="sess-1"
        boardBlockIds={["msg-1-tasks", "msg-2-bubble", "msg-1-miro-approval"]}
      >
        <AgentMessageBoardBlock blockId="msg-1-miro-approval">
          <TextProbe
            target="Recommended Miro board"
            partId="msg-1-miro-approval-title"
            blockId="msg-1-miro-approval"
            testId="miro"
          />
        </AgentMessageBoardBlock>
        <AgentMessageBoardBlock blockId="msg-1-tasks">
          <TextProbe
            target="Task summary"
            partId="msg-1-task-0-summary"
            blockId="msg-1-tasks"
            testId="tasks"
          />
        </AgentMessageBoardBlock>
        <AgentMessageBoardBlock blockId="msg-2-bubble">
          <TextProbe
            target="Middle message"
            partId="msg-2-content"
            blockId="msg-2-bubble"
            testId="bubble"
          />
        </AgentMessageBoardBlock>
      </AgentMessageBoardTextProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("tasks")).toHaveTextContent("Task summary")
      expect(screen.getByTestId("bubble")).toBeInTheDocument()
    })
    expect(screen.queryByTestId("miro")).not.toBeInTheDocument()
  })

  it("does not reveal a later block before earlier blocks in canonical order", async () => {
    render(
      <AgentMessageBoardTextProvider
        sessionId="sess-1"
        boardBlockIds={["msg-1-tasks", "msg-2-bubble", "msg-1-miro-approval"]}
      >
        <AgentMessageBoardBlock blockId="msg-1-miro-approval">
          <TextProbe
            target="Recommended Miro board"
            partId="msg-1-miro-approval-title"
            blockId="msg-1-miro-approval"
            testId="miro"
          />
        </AgentMessageBoardBlock>
        <AgentMessageBoardBlock blockId="msg-1-tasks">
          <TextProbe
            target="Task summary"
            partId="msg-1-task-0-summary"
            blockId="msg-1-tasks"
            testId="tasks"
          />
        </AgentMessageBoardBlock>
        <AgentMessageBoardBlock blockId="msg-2-bubble">
          <TextProbe
            target="Middle message"
            partId="msg-2-content"
            blockId="msg-2-bubble"
            testId="bubble"
          />
        </AgentMessageBoardBlock>
      </AgentMessageBoardTextProvider>
    )

    expect(screen.queryByTestId("miro")).not.toBeInTheDocument()
    expect(screen.getByTestId("tasks")).toBeInTheDocument()
    expect(screen.queryByTestId("bubble")).not.toBeInTheDocument()
  })

  it("does not leak partial typing from one session into another with the same part id", async () => {
    markAgentMessageBoardSessionQuit("sess-a", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: {
        "msg-1-task-0-summary": { visibleLength: 10 },
      },
    })

    const { rerender } = render(<BoardFixture sessionId="sess-a" />)
    await waitFor(() => {
      expect(screen.getByTestId("text").textContent?.startsWith("Investigat")).toBe(true)
    })

    rerender(<BoardFixture sessionId="sess-b" />)

    await waitFor(() => {
      const node = screen.getByTestId("text")
      // sess-a quit snapshot stopped at 10 code points ("Investigat")
      expect(node.textContent).not.toBe("Investigat")
    })
  })
})
