/**
 * Email draft editor edge cases (plan §5).
 * @see frontend/e2e/email_draft/note/e2e-email-draft-plan.md §5
 *
 * One representative automated test per edge-case category — not exhaustive.
 * Fault-injection cases are tagged `@fault` (optional CI / manual runs).
 */
import { expect, test } from "@playwright/test";
import {
  buildSingleHeadingKlaviyoBlock,
  EDIT_SEED_HEADING,
} from "./fixtures/editor-flow-fixtures";
import {
  canvasLocator,
  cleanupDraftRefs,
  createCleanupRef,
  createKlaviyoDraftWithBlocksViaApi,
  editCanvasTextBlock,
  getKlaviyoDraftViaApi,
  openKlaviyoEditor,
  waitForKlaviyoEditorReady,
} from "./email-draft-helpers";

/** Emojis, CJK, Arabic, and symbols — plan §5.6 */
const SPECIAL_CHARS_HEADING = "🎉 中文 العربية © ™ — edge";

/** ~50KB body copy — plan §5.5 (lighter than 100KB+ stress target) */
const LARGE_PARAGRAPH = `${"A".repeat(50_000)} edge`;

test.describe("Email draft edge cases", () => {
  test.describe.configure({ mode: "serial" });

  // ---------------------------------------------------------------------------
  // §5.1 Invalid or missing draftId / load errors
  // ---------------------------------------------------------------------------

  test.describe("§5.1 Invalid or missing draftId / load errors", () => {
    test("KV-edge-invalid klaviyo /klaviyo/abc shows invalid template link", async ({ page }) => {
      await page.goto("/klaviyo/abc");
      await expect(page.getByText("Invalid template link")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Back to templates" })).toBeVisible();
      await expect(page.getByTestId("klaviyo-draft-save")).not.toBeVisible();
    });

    test("MC-edge-invalid mailchimp /mailchimp/abc shows invalid draft link", async ({ page }) => {
      await page.goto("/mailchimp/abc");
      await expect(page.getByText("Invalid draft link")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Back to drafts" })).toBeVisible();
    });

    test("KV-edge-load-fail klaviyo GET 500 shows failed-to-load @fault", async ({ page }) => {
      await page.route("**/api/klaviyo/klaviyo-drafts/**", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Edge case load failure" }),
          });
          return;
        }
        await route.continue();
      });
      try {
        await page.goto("/klaviyo/1");
        await expect(page.getByText("Failed to load template")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Edge case load failure")).toBeVisible();
        await page.getByRole("button", { name: "Back to templates" }).click();
        await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/);
      } finally {
        await page.unroute("**/api/klaviyo/klaviyo-drafts/**");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §5.2 Refresh / reload
  // ---------------------------------------------------------------------------

  test.describe("§5.2 Refresh / reload", () => {
    test("KV-edge-reload klaviyo saved heading survives browser reload", async ({ page }) => {
      const cleanup = createCleanupRef();
      const reloadTarget = "Edge reload persisted heading";
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
        await editCanvasTextBlock(page, EDIT_SEED_HEADING, reloadTarget);

        const patchPromise = page.waitForResponse(
          (r) =>
            r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
            r.request().method() === "PATCH" &&
            r.ok(),
        );
        await page.getByTestId("klaviyo-draft-save").click();
        await patchPromise;
        await expect(page.getByText("Saved")).toBeVisible();

        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForKlaviyoEditorReady(page, { anchorText: reloadTarget });
        await expect(canvasLocator(page).getByRole("heading", { name: reloadTarget })).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §5.3 Network offline during typing
  // ---------------------------------------------------------------------------

  test.describe("§5.3 Network offline during typing", () => {
    test("KV-edge-offline klaviyo edits stay in memory while offline", async ({ page, context }) => {
      const cleanup = createCleanupRef();
      const offlineCopy = "Edge offline in-memory edit";
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });

        await context.setOffline(true);
        await editCanvasTextBlock(page, EDIT_SEED_HEADING, offlineCopy);
        await expect(canvasLocator(page).getByRole("heading", { name: offlineCopy })).toBeVisible();

        await context.setOffline(false);
      } finally {
        await context.setOffline(false);
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("KV-edge-offline-save klaviyo save while offline shows error @fault", async ({
      page,
      context,
    }) => {
      const cleanup = createCleanupRef();
      const offlineSaveCopy = "Edge offline save attempt";
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
        await editCanvasTextBlock(page, EDIT_SEED_HEADING, offlineSaveCopy);

        await context.setOffline(true);
        await page.getByTestId("klaviyo-draft-save").click();
        await expect(page.getByText(/failed to save|network|offline/i).first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(canvasLocator(page).getByRole("heading", { name: offlineSaveCopy })).toBeVisible();
        await context.setOffline(false);
      } finally {
        await context.setOffline(false);
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §5.4 Concurrent saves
  // ---------------------------------------------------------------------------

  test.describe("§5.4 Concurrent saves", () => {
    test("KV-edge-concurrent klaviyo double-click save sends one PATCH @fault", async ({ page }) => {
      const cleanup = createCleanupRef();
      const concurrentCopy = "Edge concurrent save copy";
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
        await editCanvasTextBlock(page, EDIT_SEED_HEADING, concurrentCopy);

        let patchCount = 0;
        let releasePatch!: () => void;
        const patchGate = new Promise<void>((resolve) => {
          releasePatch = resolve;
        });

        await page.route(`**/api/klaviyo/klaviyo-drafts/${id}/**`, async (route) => {
          if (route.request().method() === "PATCH") {
            patchCount += 1;
            await patchGate;
            await route.continue();
            return;
          }
          await route.continue();
        });

        const saveButton = page.getByTestId("klaviyo-draft-save");
        await saveButton.dblclick({ delay: 50 });
        await expect(saveButton).toBeDisabled();
        releasePatch();
        await expect(saveButton).toBeEnabled({ timeout: 30_000 });
        expect(patchCount).toBeLessThanOrEqual(1);
        await page.unroute(`**/api/klaviyo/klaviyo-drafts/${id}/**`);
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §5.5 Very large content
  // ---------------------------------------------------------------------------

  test.describe("§5.5 Very large content", () => {
    test("KV-edge-large klaviyo large paragraph paste does not crash editor", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });

        const canvas = canvasLocator(page);
        await canvas.getByRole("heading", { name: EDIT_SEED_HEADING }).click();
        const editor = canvas.getByRole("textbox").first();
        await editor.click();
        await editor.evaluate((el, text) => {
          el.textContent = text;
          el.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: text,
            }),
          );
        }, LARGE_PARAGRAPH);
        await page.keyboard.press("Escape");

        await expect(canvas.getByText("edge", { exact: false })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("email-draft-canvas")).toBeVisible();
        await expect(page.getByText("Failed to load template")).not.toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §5.6 Special characters
  // ---------------------------------------------------------------------------

  test.describe("§5.6 Special characters", () => {
    test("KV-edge-chars klaviyo emoji CJK Arabic heading persists after save reload", async ({
      page,
    }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
        await editCanvasTextBlock(page, EDIT_SEED_HEADING, SPECIAL_CHARS_HEADING);

        const patchPromise = page.waitForResponse(
          (r) =>
            r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
            r.request().method() === "PATCH" &&
            r.ok(),
        );
        await page.getByTestId("klaviyo-draft-save").click();
        await patchPromise;

        const persisted = await getKlaviyoDraftViaApi(page, id);
        const blocks = Array.isArray(persisted.blocks) ? persisted.blocks : [];
        const serialized = JSON.stringify(blocks);
        expect(serialized).toContain("🎉");
        expect(serialized).toContain("中文");
        expect(serialized).toContain("العربية");

        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForKlaviyoEditorReady(page);
        await expect(
          canvasLocator(page).getByRole("heading", { name: SPECIAL_CHARS_HEADING }),
        ).toBeVisible({ timeout: 30_000 });
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §5.7 Save failure (API 500)
  // ---------------------------------------------------------------------------

  test.describe("§5.7 Save failure (API 500)", () => {
    test("KV-edge-save-500 klaviyo PATCH 500 keeps edited content in editor @fault", async ({
      page,
    }) => {
      const cleanup = createCleanupRef();
      const saveFailCopy = "Edge save 500 retained copy";
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
        );
        await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
        await editCanvasTextBlock(page, EDIT_SEED_HEADING, saveFailCopy);

        await page.route(`**/api/klaviyo/klaviyo-drafts/${id}/**`, async (route) => {
          if (route.request().method() === "PATCH") {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ detail: "Edge case save failure" }),
            });
            return;
          }
          await route.continue();
        });

        await page.getByTestId("klaviyo-draft-save").click();
        await expect(page.getByText("Edge case save failure")).toBeVisible({ timeout: 30_000 });
        await expect(canvasLocator(page).getByRole("heading", { name: saveFailCopy })).toBeVisible();
        await expect(page).toHaveURL(new RegExp(String.raw`/klaviyo/${id}(?:\?|$)`));
        await page.unroute(`**/api/klaviyo/klaviyo-drafts/${id}/**`);
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });
});
