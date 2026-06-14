import {
  deriveMiroBoardCardState,
  getPendingMiroWorkflowRunIds,
} from "@/lib/agentMiroBoardStatus"

describe("agentMiroBoardStatus", () => {
  describe("getPendingMiroWorkflowRunIds", () => {
    it("returns workflow run ids with started but no board created", () => {
      const messages = [
        {
          eventType: "miro_generation_started",
          workflowRunId: "run-1",
        },
        {
          eventType: "miro_generation_started",
          workflowRunId: "run-2",
        },
      ]

      expect(getPendingMiroWorkflowRunIds(messages)).toEqual(["run-1", "run-2"])
    })

    it("excludes workflow runs that completed with miro_board_created", () => {
      const messages = [
        {
          eventType: "miro_generation_started",
          workflowRunId: "run-1",
        },
        {
          eventType: "miro_board_created",
          workflowRunId: "run-1",
        },
        {
          eventType: "miro_generation_started",
          workflowRunId: "run-2",
        },
      ]

      expect(getPendingMiroWorkflowRunIds(messages)).toEqual(["run-2"])
    })

    it("does not treat miro_generation_failed as completed", () => {
      const messages = [
        {
          eventType: "miro_generation_started",
          workflowRunId: "run-1",
        },
        {
          eventType: "miro_generation_failed",
          workflowRunId: "run-1",
        },
      ]

      expect(getPendingMiroWorkflowRunIds(messages)).toEqual(["run-1"])
    })
  })

  describe("deriveMiroBoardCardState", () => {
    it("returns waiting_tasks_generation when approval is on and tasks are not created", () => {
      const result = deriveMiroBoardCardState([], {
        approvalRequired: true,
        wantsTasks: true,
        tasksCreated: false,
      })

      expect(result).toEqual({ status: "waiting_tasks_generation" })
    })

    it("returns idle when approval is off and no miro events exist", () => {
      expect(deriveMiroBoardCardState([])).toEqual({ status: "idle" })
    })

    it("returns generating when miroGenerateInFlight is true", () => {
      const result = deriveMiroBoardCardState([], { miroGenerateInFlight: true })

      expect(result).toEqual({ status: "generating" })
    })

    it("returns generating from a pending miro_generation_started message", () => {
      const messages = [
        {
          eventType: "miro_generation_started",
          workflowRunId: "run-1",
        },
      ]

      expect(deriveMiroBoardCardState(messages)).toEqual({ status: "generating" })
    })

    it("returns ready from the latest miro_board_created message", () => {
      const messages = [
        {
          eventType: "miro_generation_failed",
          workflowRunId: "run-old",
          content: "Old failure",
        },
        {
          eventType: "miro_board_created",
          workflowRunId: "run-new",
          navigateHref: "/miro/board-123",
        },
      ]

      expect(deriveMiroBoardCardState(messages)).toEqual({
        status: "ready",
        boardHref: "/miro/board-123",
      })
    })

    it("returns failed from the latest miro_generation_failed message", () => {
      const messages = [
        {
          eventType: "miro_generation_failed",
          workflowRunId: "run-1",
          content: "Miro API unavailable",
        },
      ]

      expect(deriveMiroBoardCardState(messages)).toEqual({
        status: "failed",
        errorMessage: "Miro API unavailable",
      })
    })

    it("prefers generating over waiting_tasks_generation when a run is in flight", () => {
      const result = deriveMiroBoardCardState(
        [
          {
            eventType: "miro_generation_started",
            workflowRunId: "run-1",
          },
        ],
        {
          approvalRequired: true,
          wantsTasks: true,
          tasksCreated: false,
        }
      )

      expect(result).toEqual({ status: "generating" })
    })

    it("returns idle after tasks are created with approval on", () => {
      const result = deriveMiroBoardCardState([], {
        approvalRequired: true,
        wantsTasks: true,
        tasksCreated: true,
      })

      expect(result).toEqual({ status: "idle" })
    })
  })
})
