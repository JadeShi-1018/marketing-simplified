import { expect, test } from "@playwright/test"

import { deriveMiroBoardCardState, type ChatMessageLike } from "../../src/lib/agentMiroBoardStatus"

const failedMessages: ChatMessageLike[] = [
  {
    eventType: "miro_generation_failed",
    workflowRunId: "workflow-run-med-245",
    content: "Miro generation failed: provider timeout",
  },
]

test.use({ storageState: { cookies: [], origins: [] } })

function renderRetryCard(messages: ChatMessageLike[], miroGenerateInFlight = false) {
  const state = deriveMiroBoardCardState(messages, { miroGenerateInFlight })

  if (state.status === "retrying") {
    return `
      <section aria-label="Recommended Miro Board">
        <p>Continuing previous Miro generation with the saved analysis context.</p>
        <button disabled>Continuing previous...</button>
      </section>
    `
  }

  if (state.status === "failed") {
    return `
      <section aria-label="Recommended Miro Board">
        <p>${state.errorMessage ?? ""}</p>
        <button id="retry">Try again</button>
      </section>
    `
  }

  return `<section aria-label="Recommended Miro Board"><button>Generate Miro</button></section>`
}

test("Miro retry user flow shows continuing previous context", async ({ page }) => {
  await page.setContent(renderRetryCard(failedMessages))

  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  await expect(page.getByText("provider timeout")).toBeVisible()

  await page.getByRole("button", { name: "Try again" }).click()
  await page.setContent(renderRetryCard(failedMessages, true))

  await expect(page.getByText("Continuing previous Miro generation")).toBeVisible()
  await expect(page.getByRole("button", { name: "Continuing previous..." })).toBeVisible()
})
