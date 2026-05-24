import {
  areAllPartsComplete,
  getFirstIncompleteJobId,
  getFirstIncompletePartId,
  type RenderJob,
} from "@/lib/agentMessageBoardRenderQueue"

describe("agent message board render queue", () => {
  it("activates only the first incomplete job in the linked list", () => {
    const jobs: RenderJob[] = [
      { id: "bubble", kind: "block" },
      { id: "tasks", kind: "block" },
      { id: "footer", kind: "text" },
    ]
    const completed = new Set<string>()
    expect(getFirstIncompleteJobId(jobs, completed)).toBe("bubble")

    completed.add("bubble")
    expect(getFirstIncompleteJobId(jobs, completed)).toBe("tasks")

    completed.add("tasks")
    completed.add("footer")
    expect(getFirstIncompleteJobId(jobs, completed)).toBeNull()
  })

  it("completes block only when all nested text parts finish", () => {
    const parts = ["title", "body"]
    const completed = new Set<string>()
    expect(areAllPartsComplete(parts, completed)).toBe(false)

    completed.add("title")
    expect(getFirstIncompletePartId(parts, completed)).toBe("body")
    expect(areAllPartsComplete(parts, completed)).toBe(false)

    completed.add("body")
    expect(areAllPartsComplete(parts, completed)).toBe(true)
  })
})
