import {
  containsInlineBulletList,
  normalizeAgentMessageMarkdown,
  parseAgentMessageContentBlocks,
  splitBlocksForDisplayLength,
} from "@/lib/agentMessageContentBlocks"
import { textLength } from "@/lib/streamingTextUtils"

describe("agentMessageContentBlocks", () => {
  test("parses paragraphs, lists, and tables into ordered blocks", () => {
    const source = [
      "Intro line with **bold**.",
      "",
      "- Item 1",
      "  - Nested a",
      "  - Nested b",
      "",
      "| Component | Technology | Purpose |",
      "| --- | --- | --- |",
      "| Frontend | React, TypeScript | Build UI components |",
      "| Backend | Django REST Framework | Provide API endpoints |",
      "",
      "Closing paragraph.",
    ].join("\n")

    const blocks = parseAgentMessageContentBlocks(source)
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "table", "paragraph"])
    expect(blocks[1].markdown).toContain("- Item 1")
    expect(blocks[2].markdown).toContain("| Component |")
    expect(blocks[3].markdown.trim()).toBe("Closing paragraph.")
  })

  test("splitBlocksForDisplayLength returns complete blocks and a plain-text tail", () => {
    const source = ["Intro", "", "- One", "- Two", "", "After"].join("\n")
    const blocks = parseAgentMessageContentBlocks(source)

    const listEnd = blocks.find((b) => b.type === "list")!.end
    const { completeBlocks, tail } = splitBlocksForDisplayLength(blocks, source, listEnd + 2)

    expect(completeBlocks.map((b) => b.type)).toEqual(["paragraph", "list"])
    expect(tail.length).toBeGreaterThan(0)
  })

  test("table only becomes a table when header + separator are present", () => {
    const source = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n")
    const blocks = parseAgentMessageContentBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("table")
  })

  test("handles code-point offsets (emoji)", () => {
    const source = ["Hello 👋", "", "- A"].join("\n")
    const blocks = parseAgentMessageContentBlocks(source)
    expect(blocks[0].type).toBe("paragraph")
    expect(textLength(blocks[0].markdown)).toBe(textLength("Hello 👋\n"))
    expect(blocks[1].type).toBe("list")
  })

  test("detects line-start bullet dot lists", () => {
    const source = ["• First item", "• Second item"].join("\n")
    const blocks = parseAgentMessageContentBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("list")
    expect(normalizeAgentMessageMarkdown(blocks[0].markdown)).toContain("- First item")
  })

  test("detects inline bullet dot lists in a single paragraph", () => {
    const source =
      "Analysis goals: • Evaluate cost-effectiveness. • Identify top niches. Found 3 anomalies."
    expect(containsInlineBulletList(source)).toBe(true)
    const blocks = parseAgentMessageContentBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe("list")
    const normalized = normalizeAgentMessageMarkdown(source)
    expect(normalized).toContain("Analysis goals:")
    expect(normalized).toContain("- Evaluate cost-effectiveness.")
    expect(normalized).toContain("- Identify top niches.")
    expect(normalized).toContain("Found 3 anomalies.")
  })
})
