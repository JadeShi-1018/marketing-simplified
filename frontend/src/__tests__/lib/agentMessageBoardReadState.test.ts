import {
  isAgentMessageBoardTextPartRead,
  markAgentMessageBoardSessionQuit,
  markAgentMessageBoardTextPartRead,
  markAgentMessageBoardTextPartsRead,
} from "@/lib/agentMessageBoardReadState"

const STORAGE_KEY = "agent-message-board-read-parts"

describe("agentMessageBoardReadState", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("marks a single part as read for a session", () => {
    markAgentMessageBoardTextPartRead("sess-1", "msg-1-content")
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-1-content")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-2-content")).toBe(false)
    expect(isAgentMessageBoardTextPartRead("sess-2", "msg-1-content")).toBe(false)
  })

  it("marks multiple parts in one write", () => {
    markAgentMessageBoardTextPartsRead("sess-1", ["a", "b"])
    expect(isAgentMessageBoardTextPartRead("sess-1", "a")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-1", "b")).toBe(true)
  })

  it("persists to localStorage", () => {
    markAgentMessageBoardTextPartRead("sess-1", "part-x")
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toContain("sess-1")
    expect(raw).toContain("part-x")
  })

  it("marks all parts for messages when the user quits the board", () => {
    markAgentMessageBoardSessionQuit("sess-1", ["msg-1", "msg-2"])
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-1-content")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-1-task-0-summary")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-2-content")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-3-content")).toBe(false)
  })

  it("still animates new messages after quit", () => {
    markAgentMessageBoardSessionQuit("sess-1", ["msg-1"])
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-99-content")).toBe(false)
  })
})
