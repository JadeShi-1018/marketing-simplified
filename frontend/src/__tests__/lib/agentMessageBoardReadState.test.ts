import {
  getAgentMessageBoardPartResumeLength,
  isAgentMessageBoardRenderEffectsCompletedOnQuit,
  isAgentMessageBoardWaitingForFileAnalysisResponse,
  isAgentMessageBoardTextPartFullyRead,
  isAgentMessageBoardTextPartRead,
  loadAgentMessageBoardRenderSnapshot,
  markAgentMessageBoardSessionQuit,
  markAgentMessageBoardTextPartRead,
  markAgentMessageBoardTextPartsRead,
  saveAgentMessageBoardRenderSnapshot,
  setAgentMessageBoardRenderEffectsCompletedOnQuit,
  setAgentMessageBoardWaitingForFileAnalysisResponse,
  shouldShowAgentMessageBoardThinkingBubbleOnRevisit,
  snapshotHasProgress,
} from "@/lib/agentMessageBoardReadState"

const STORAGE_KEY = "agent-message-board-read-parts"

describe("agentMessageBoardReadState", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("marks a single part as read for a session", () => {
    markAgentMessageBoardTextPartRead("sess-1", "msg-1-content")
    expect(isAgentMessageBoardTextPartFullyRead("sess-1", "msg-1-content")).toBe(true)
    expect(isAgentMessageBoardTextPartFullyRead("sess-1", "msg-2-content")).toBe(false)
    expect(isAgentMessageBoardTextPartFullyRead("sess-2", "msg-1-content")).toBe(false)
  })

  it("marks multiple parts in one write", () => {
    markAgentMessageBoardTextPartsRead("sess-1", ["a", "b"])
    expect(isAgentMessageBoardTextPartFullyRead("sess-1", "a")).toBe(true)
    expect(isAgentMessageBoardTextPartFullyRead("sess-1", "b")).toBe(true)
  })

  it("persists to localStorage", () => {
    markAgentMessageBoardTextPartRead("sess-1", "part-x")
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toContain("sess-1")
    expect(raw).toContain("part-x")
  })

  it("saves render snapshot on quit without blanket message read", () => {
    markAgentMessageBoardSessionQuit(
      "sess-1",
      {
        completedJobIds: ["msg-1-bubble"],
        blockPartsCompleted: {},
        partProgress: {
          "msg-1-content": { visibleLength: 12, complete: true },
          "msg-1-task-0-summary": { visibleLength: 8 },
        },
      },
      ["reupload-button"]
    )

    expect(isAgentMessageBoardTextPartFullyRead("sess-1", "msg-1-content")).toBe(false)
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-1-content")).toBe(false)
    expect(isAgentMessageBoardTextPartFullyRead("sess-1", "reupload-button")).toBe(true)
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-1-task-0-summary")).toBe(8)
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-1-content")).toBe(0)

    const snapshot = loadAgentMessageBoardRenderSnapshot("sess-1")
    expect(snapshot?.completedJobIds).toContain("msg-1-bubble")
    expect(snapshot?.partProgress["msg-1-task-0-summary"]?.visibleLength).toBe(8)
  })

  it("still treats legacy messageIds as read when no snapshot exists", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessions: {
          "sess-legacy": { parts: [], messageIds: ["msg-1", "msg-2"] },
        },
      })
    )
    expect(isAgentMessageBoardTextPartRead("sess-legacy", "msg-1-content")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-legacy", "msg-1-task-0-summary")).toBe(true)
    expect(isAgentMessageBoardTextPartRead("sess-legacy", "msg-3-content")).toBe(false)
  })

  it("does not apply legacy messageIds when a snapshot is present", () => {
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: { "msg-1-content": { visibleLength: 5 } },
    })
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    store.sessions["sess-1"].messageIds = ["msg-1"]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))

    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-1-nav-label")).toBe(false)
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-1-content")).toBe(5)
  })

  it("marks fully read parts via markTextPartRead", () => {
    markAgentMessageBoardTextPartRead("sess-1", "msg-99-content")
    expect(isAgentMessageBoardTextPartRead("sess-1", "msg-99-content")).toBe(true)
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-99-content")).toBe(0)
  })

  it("does not overwrite a progress snapshot with an empty one", () => {
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: { "msg-1-content": { visibleLength: 25 } },
    })
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: {},
    })
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-1-content")).toBe(25)
    expect(snapshotHasProgress(loadAgentMessageBoardRenderSnapshot("sess-1")!)).toBe(true)
  })

  it("merges part progress and keeps the higher visible length", () => {
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: { "msg-1-content": { visibleLength: 25 } },
    })
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: { "msg-1-content": { visibleLength: 3 } },
    })
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-1-content")).toBe(25)
  })

  it("overwrites snapshot with newer partial progress on save", () => {
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: [],
      blockPartsCompleted: {},
      partProgress: { "msg-1-content": { visibleLength: 3 } },
    })
    saveAgentMessageBoardRenderSnapshot("sess-1", {
      completedJobIds: ["msg-1-bubble"],
      blockPartsCompleted: {},
      partProgress: { "msg-1-content": { visibleLength: 42 } },
    })
    expect(getAgentMessageBoardPartResumeLength("sess-1", "msg-1-content")).toBe(42)
    expect(loadAgentMessageBoardRenderSnapshot("sess-1")?.completedJobIds).toContain(
      "msg-1-bubble"
    )
  })

  it("shows revisit thinking bubble only when waiting and render complete", () => {
    setAgentMessageBoardWaitingForFileAnalysisResponse("sess-1", true)
    setAgentMessageBoardRenderEffectsCompletedOnQuit("sess-1", true)
    expect(shouldShowAgentMessageBoardThinkingBubbleOnRevisit("sess-1")).toBe(true)

    setAgentMessageBoardRenderEffectsCompletedOnQuit("sess-1", false)
    expect(shouldShowAgentMessageBoardThinkingBubbleOnRevisit("sess-1")).toBe(false)
  })

  it("does not show revisit thinking bubble when not waiting (even if render is complete)", () => {
    setAgentMessageBoardWaitingForFileAnalysisResponse("sess-1", false)
    setAgentMessageBoardRenderEffectsCompletedOnQuit("sess-1", true)
    expect(shouldShowAgentMessageBoardThinkingBubbleOnRevisit("sess-1")).toBe(false)
  })

  it("stores board waiting/render booleans per session", () => {
    setAgentMessageBoardWaitingForFileAnalysisResponse("sess-1", true)
    setAgentMessageBoardRenderEffectsCompletedOnQuit("sess-1", true)

    expect(isAgentMessageBoardWaitingForFileAnalysisResponse("sess-1")).toBe(true)
    expect(isAgentMessageBoardRenderEffectsCompletedOnQuit("sess-1")).toBe(true)
    expect(isAgentMessageBoardWaitingForFileAnalysisResponse("sess-2")).toBe(false)
    expect(isAgentMessageBoardRenderEffectsCompletedOnQuit("sess-2")).toBe(false)
  })
})
