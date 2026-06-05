import { expect, test, type Page } from "@playwright/test";
import {
  buildReferenceKlaviyoBlocks,
  buildReferenceMailchimpSections,
  buildReorderKlaviyoBlocks,
  buildReorderMailchimpSections,
  buildSingleHeadingKlaviyoBlock,
  buildSingleHeadingMailchimpSection,
  EDIT_SEED_HEADING,
  EDIT_TARGET_COPY,
  KLAVIYO_DEFAULT_CANVAS_ANCHORS,
  REFERENCE_BLOCK_ANCHORS,
  REORDER_BLOCK_TEXT,
} from "./fixtures/editor-flow-fixtures";
import {
  canvasLocator,
  cleanupDraftRefs,
  clickCanvasText,
  createCleanupRef,
  createKlaviyoDraftViaApi,
  createKlaviyoDraftWithBlocksViaApi,
  createMailchimpDraftViaApi,
  createMailchimpDraftWithSectionsViaApi,
  editCanvasTextBlock,
  expectKlaviyoTableVisible,
  expectMailchimpTableVisible,
  getDraftRow,
  goToKlaviyoList,
  goToMailchimpList,
  modKey,
  openKlaviyoEditor,
  openMailchimpEditor,
  openMailchimpCommentsPanel,
  exitMailchimpEditorViaHeaderBack,
  mailchimpCommentsPanel,
  patchMailchimpDraftSections,
  removeCanvasBlockByText,
} from "./email-draft-helpers";
import { shortRunId, withRunSuffix } from "./fixtures/list-user-data";

async function assertPreviewPanel(page: Page): Promise<void> {
  const previewPanel = page.getByTestId("email-draft-preview-panel");
  await expect(previewPanel).toBeVisible({ timeout: 30_000 });
  await expect(previewPanel.getByRole("button", { name: "Desktop" })).toBeVisible();
  await expect(previewPanel.getByRole("button", { name: "Mobile" })).toBeVisible();
  await expect(previewPanel.getByRole("button", { name: "Inbox" })).toBeVisible();
  await expect(previewPanel.getByRole("button", { name: "Send a Test Email" })).toBeVisible();
}

async function openPreviewFromEditor(page: Page): Promise<void> {
  await page.getByTestId("email-draft-open-preview").click();
  await assertPreviewPanel(page);
}

test.describe("Email draft editor flows", () => {
  test.describe.configure({ mode: "serial" });

  // ---------------------------------------------------------------------------
  // Y-open
  // ---------------------------------------------------------------------------

  test("KV-Y-open-valid klaviyo Y-open valid id loads editor", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftViaApi(page, cleanup);
      await openKlaviyoEditor(page, id);
      await expect(page.getByTestId("klaviyo-draft-save")).toBeVisible();
      await expect(page.getByText("Failed to load template")).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-Y-open-invalid klaviyo Y-open /klaviyo/abc shows invalid link", async ({ page }) => {
    await page.goto("/klaviyo/abc");
    await expect(page.getByText("Invalid template link")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Back to templates" })).toBeVisible();
    await expect(page.getByTestId("klaviyo-draft-save")).not.toBeVisible();
  });

  test("MC-Y-open-valid mailchimp Y-open valid id loads editor", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await expect(page.getByRole("button", { name: "Save and exit" })).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-open-invalid mailchimp Y-open /mailchimp/abc shows invalid id", async ({ page }) => {
    await page.goto("/mailchimp/abc");
    await expect(page.getByText("Invalid draft link")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Back to drafts" })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Y-load (YL-a / YL-b)
  // ---------------------------------------------------------------------------

  test("KV-YL-a klaviyo YL-a blocks render on canvas", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildReferenceKlaviyoBlocks(),
      );
      await openKlaviyoEditor(page, id, {
        anchorText: REFERENCE_BLOCK_ANCHORS.heroHeading,
      });
      const canvas = canvasLocator(page);
      await expect(canvas.getByText(REFERENCE_BLOCK_ANCHORS.heroHeading)).toBeVisible();
      await expect(canvas.getByText(REFERENCE_BLOCK_ANCHORS.freeShippingHeading)).toBeVisible();
      await expect(canvas.getByText(REFERENCE_BLOCK_ANCHORS.testimonialHeading)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-YL-b klaviyo YL-b empty draft shows default canvas", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftViaApi(page, cleanup);
      await openKlaviyoEditor(page, id, {
        anchorText: KLAVIYO_DEFAULT_CANVAS_ANCHORS.headerParagraph,
      });
      const canvas = canvasLocator(page);
      await expect(canvas.getByText(KLAVIYO_DEFAULT_CANVAS_ANCHORS.headerParagraph)).toBeVisible();
      // Default hero uses content "Heading" — same as block label badge; target the heading role.
      await expect(
        canvas.getByRole("heading", { name: KLAVIYO_DEFAULT_CANVAS_ANCHORS.heroHeading }),
      ).toBeVisible();
      await expect(canvas.getByText(KLAVIYO_DEFAULT_CANVAS_ANCHORS.bodySnippet)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-YL-c klaviyo YL-c 401 on load redirects to login @fault", async ({ page }) => {
    await page.route("**/api/klaviyo/klaviyo-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Unauthorized" }),
        });
        return;
      }
      await route.continue();
    });
    try {
      await page.goto("/klaviyo/1");
      await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/**");
    }
  });

  test("MC-YL-a mailchimp YL-a sections render on canvas", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildReferenceMailchimpSections(),
      );
      await openMailchimpEditor(page, id);
      const canvas = canvasLocator(page);
      await expect(canvas.getByText(REFERENCE_BLOCK_ANCHORS.heroHeading)).toBeVisible();
      await expect(canvas.getByText(REFERENCE_BLOCK_ANCHORS.freeShippingHeading)).toBeVisible();
      await expect(canvas.getByText(REFERENCE_BLOCK_ANCHORS.needHelpHeading)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-YL-b mailchimp YL-b no sections shows default canvas", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await patchMailchimpDraftSections(page, id, {});
      await openMailchimpEditor(page, id);
      await expect(canvasLocator(page)).toBeVisible();
      await expect(
        canvasLocator(page).getByText(REFERENCE_BLOCK_ANCHORS.heroHeading),
      ).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-YL-c mailchimp YL-c 401 on list redirects to login @fault", async ({ page }) => {
    await page.route("**/api/mailchimp/email-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Unauthorized" }),
        });
        return;
      }
      await route.continue();
    });
    try {
      await page.goto("/mailchimp");
      await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/**");
    }
  });

  test("KV-YL-err klaviyo YL-err GET fail shows failed-to-load @fault", async ({ page }) => {
    await page.route("**/api/klaviyo/klaviyo-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Template API down in test" }),
        });
        return;
      }
      await route.continue();
    });
    try {
      await page.goto("/klaviyo/1");
      await expect(page.getByText("Failed to load template")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Template API down in test")).toBeVisible();
      await page.getByRole("button", { name: "Back to templates" }).click();
      await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/);
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/**");
    }
  });

  // ---------------------------------------------------------------------------
  // Y-edit Klaviyo
  // ---------------------------------------------------------------------------

  test("KV-Y-edit-a klaviyo Y-edit-a select block opens inspector", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await clickCanvasText(page, EDIT_SEED_HEADING);
      await expect(page.getByRole("button", { name: "Styles" })).toHaveClass(/border-b-2/);
      await expect(page.getByText("Font Family")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-Y-edit-b klaviyo Y-edit-b inline edit text block", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.inline);
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.inline)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-Y-edit-c klaviyo Y-edit-c seeded reorder renders order", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildReorderKlaviyoBlocks(),
      );
      await openKlaviyoEditor(page, id);
      const canvas = canvasLocator(page);
      const paragraphs = canvas.locator("p");
      await expect(paragraphs.nth(0)).toHaveText(REORDER_BLOCK_TEXT.first);
      await expect(paragraphs.nth(1)).toHaveText(REORDER_BLOCK_TEXT.second);
      await expect(paragraphs.nth(2)).toHaveText(REORDER_BLOCK_TEXT.third);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-Y-edit-d klaviyo Y-edit-d undo/redo via toolbar", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.undoRedo);
      await page.locator('button[title="Undo (Cmd+Z)"]').click();
      await expect(
        canvasLocator(page).getByRole("heading", { name: EDIT_SEED_HEADING }),
      ).toBeVisible();
      await page.locator('button[title="Redo (Cmd+Shift+Z)"]').click();
      await expect(
        canvasLocator(page).getByRole("heading", { name: EDIT_TARGET_COPY.undoRedo }),
      ).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-Y-edit-e klaviyo Y-edit-e keyboard Cmd/Ctrl+S, Z, Shift+Z", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.keyboard);

      const mod = modKey();
      await page.keyboard.press(`${mod}+KeyZ`);
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).toBeVisible();
      await page.keyboard.press(`${mod}+Shift+KeyZ`);
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.keyboard)).toBeVisible();

      const savePromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
          r.request().method() === "PATCH",
      );
      await page.keyboard.press(`${mod}+KeyS`);
      await savePromise;
      await expect(page.getByText("Saved")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-Y-edit-f klaviyo Y-edit-f remove block", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
      await removeCanvasBlockByText(page, EDIT_SEED_HEADING);
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // Y-edit Mailchimp
  // ---------------------------------------------------------------------------

  test("MC-Y-edit-a mailchimp Y-edit-a select block opens inspector", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id, { anchorText: EDIT_SEED_HEADING });
      await clickCanvasText(page, EDIT_SEED_HEADING);
      await expect(page.getByRole("button", { name: "Content" })).toHaveClass(/border-b-2/);
      await expect(page.getByText("Heading text")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-edit-b mailchimp Y-edit-b TextToolbar edit heading/paragraph", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.inline);
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.inline)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-edit-c mailchimp Y-edit-c seeded reorder renders order", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildReorderMailchimpSections(),
      );
      await openMailchimpEditor(page, id, { canvasText: REORDER_BLOCK_TEXT.first });
      const paragraphs = canvasLocator(page).locator("p");
      await expect(paragraphs.nth(0)).toHaveText(REORDER_BLOCK_TEXT.first);
      await expect(paragraphs.nth(1)).toHaveText(REORDER_BLOCK_TEXT.second);
      await expect(paragraphs.nth(2)).toHaveText(REORDER_BLOCK_TEXT.third);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-edit-d mailchimp Y-edit-d undo/redo toolbar + keyboard", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.undoRedo);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).toBeVisible();
      await page.getByRole("button", { name: "Redo" }).click();
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.undoRedo)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-edit-e mailchimp Y-edit-e keyboard Cmd/Ctrl+Z, Shift+Z or Y", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id, { anchorText: EDIT_SEED_HEADING });
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.keyboard);

      const mod = modKey();
      await page.keyboard.press(`${mod}+KeyZ`);
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).toBeVisible();
      await page.keyboard.press(`${mod}+Shift+KeyZ`);
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.keyboard)).toBeVisible();

      let patchCount = 0;
      await page.route(`**/api/mailchimp/email-drafts/${id}/template-content/**`, async (route) => {
        if (route.request().method() === "PATCH") patchCount += 1;
        await route.continue();
      });
      await page.keyboard.press(`${mod}+KeyS`);
      await page.waitForTimeout(500);
      expect(patchCount).toBe(0);
      await page.unroute(`**/api/mailchimp/email-drafts/${id}/template-content/**`);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-edit-f mailchimp Y-edit-f remove block", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await removeCanvasBlockByText(page, EDIT_SEED_HEADING);
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test.skip("MC-Y-edit-g mailchimp Y-edit-g Content Studio image pick/upload", async () => {
    // Manual / out of smoke — Content Studio requires asset picker journey.
  });

  // ---------------------------------------------------------------------------
  // Klaviyo editor interactions
  // ---------------------------------------------------------------------------

  test("KV-kbd klaviyo keyboard shortcuts save/undo/redo", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.keyboard);
      const mod = modKey();
      await page.keyboard.press(`${mod}+KeyZ`);
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).toBeVisible();
      await page.keyboard.press(`${mod}+Shift+KeyZ`);
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.keyboard)).toBeVisible();
      const savePromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
          r.request().method() === "PATCH",
      );
      await page.getByTestId("klaviyo-draft-save").click();
      await savePromise;
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-rename-commit klaviyo rename commit via blur/name save", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftViaApi(page, cleanup);
      await openKlaviyoEditor(page, id);
      const newName = withRunSuffix(REFERENCE_BLOCK_ANCHORS.freeShippingHeading, shortRunId());
      const patchPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
          r.request().method() === "PATCH",
      );
      await page.getByTestId("klaviyo-draft-rename-trigger").click();
      const input = page.getByTestId("klaviyo-draft-rename-input");
      await input.fill(newName);
      await input.blur();
      await patchPromise;
      await expect(page.getByTestId("klaviyo-draft-rename-trigger")).toHaveText(newName);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-rename-cancel klaviyo rename cancel reverts name", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id, renderedTitle } = await createKlaviyoDraftViaApi(page, cleanup);
      await openKlaviyoEditor(page, id);
      await page.getByTestId("klaviyo-draft-rename-trigger").click();
      const input = page.getByTestId("klaviyo-draft-rename-input");
      await input.fill("Should not persist name");
      await input.press("Escape");
      await expect(page.getByTestId("klaviyo-draft-rename-trigger")).toContainText(renderedTitle);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-tabs klaviyo Add/Styles tabs switch", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await page.getByRole("button", { name: "Content" }).click();
      await expect(page.getByText("Text", { exact: true })).toBeVisible();
      await clickCanvasText(page, EDIT_SEED_HEADING);
      await expect(page.getByRole("button", { name: "Styles" })).toHaveClass(/border-b-2/);
      await expect(page.getByText("Font Family")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test.skip("KV-blank-layout klaviyo blank layout picker columns", async () => {
    // Manual / out of smoke — Split/Layout 1–4 column picker.
  });

  test("KV-remove klaviyo remove block from canvas", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await removeCanvasBlockByText(page, EDIT_SEED_HEADING);
      await expect(canvasLocator(page).getByText(EDIT_SEED_HEADING)).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-save-feedback klaviyo save shows Saved pill then clears", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.saveFeedback);
      const savePromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
          r.request().method() === "PATCH",
      );
      await page.getByTestId("klaviyo-draft-save").click();
      await savePromise;
      await expect(page.getByText("Saved")).toBeVisible();
      await expect(page.getByText("Saved")).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-returnTo klaviyo returnTo never targets /klaviyo/{id}", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftViaApi(page, cleanup);
      const blockedReturnTo = `/klaviyo/${id}`;
      await openKlaviyoEditor(page, id, { returnTo: blockedReturnTo });
      await page.getByRole("button", { name: "Exit" }).click();
      await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/, { timeout: 30_000 });
      await expect(page).not.toHaveURL(new RegExp(String.raw`/klaviyo/${id}(?:\?|$)`));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // Mailchimp comments + save menu
  // ---------------------------------------------------------------------------

  test("MC-cmt-open mailchimp comments panel open", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      const commentsPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.url().includes("status=open") &&
          r.request().method() === "GET",
      );
      await openMailchimpCommentsPanel(page);
      await commentsPromise;
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-cmt-tab mailchimp comments Open vs Resolved tab", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await openMailchimpCommentsPanel(page);
      await expect(page.getByRole("button", { name: "Open" })).toBeVisible();
      await expect(page.getByText("No open comments yet")).toBeVisible();
      const resolvedPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.url().includes("status=resolved") &&
          r.request().method() === "GET",
      );
      await page.getByRole("button", { name: "Resolved" }).click();
      await resolvedPromise;
      await expect(page.getByText("No resolved comments")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-cmt-add mailchimp add comment", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await openMailchimpCommentsPanel(page);
      const postPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.request().method() === "POST",
      );
      await page.getByPlaceholder("Leave feedback...").fill(EDIT_TARGET_COPY.commentAdd);
      await page.getByRole("button", { name: "Add comment" }).click();
      await postPromise;
      await expect(page.getByText(EDIT_TARGET_COPY.commentAdd)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-cmt-resolve mailchimp resolve/reopen comment", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await openMailchimpCommentsPanel(page);
      const commentsPanel = mailchimpCommentsPanel(page);
      // Unique body — commentResolve base copy may already appear on reference templates.
      const commentBody = withRunSuffix(EDIT_TARGET_COPY.commentResolve, shortRunId());

      const postPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.request().method() === "POST" &&
          r.ok(),
      );
      await page.getByPlaceholder("Leave feedback...").fill(commentBody);
      await page.getByRole("button", { name: "Add comment" }).click();
      await postPromise;
      await expect(page.getByText("Loading comments...")).toBeHidden();
      const resolveButton = commentsPanel.getByRole("button", { name: "Resolve", exact: true });
      await expect(resolveButton).toBeVisible();
      await expect(commentsPanel.getByText(commentBody)).toBeVisible();

      const resolvePatchPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.request().method() === "PATCH" &&
          r.ok(),
      );
      await Promise.all([resolvePatchPromise, resolveButton.click()]);
      await expect(page.getByText("Loading comments...")).toBeHidden();

      const resolvedGetPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.url().includes("status=resolved") &&
          r.request().method() === "GET" &&
          r.ok(),
      );
      await Promise.all([
        resolvedGetPromise,
        commentsPanel.getByRole("button", { name: "Resolved", exact: true }).click(),
      ]);
      await expect(commentsPanel.getByText(commentBody)).toBeVisible();

      const reopenButton = commentsPanel.getByRole("button", { name: "Reopen", exact: true });
      await expect(reopenButton).toBeVisible();
      const reopenPatchPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.request().method() === "PATCH" &&
          r.ok(),
      );
      await Promise.all([reopenPatchPromise, reopenButton.click()]);
      await expect(page.getByText("Loading comments...")).toBeHidden();

      const openGetPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/comments/`) &&
          r.url().includes("status=open") &&
          r.request().method() === "GET" &&
          r.ok(),
      );
      await Promise.all([openGetPromise, commentsPanel.getByRole("button", { name: "Open", exact: true }).click()]);
      await expect(commentsPanel.getByText(commentBody)).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-tpl-save mailchimp save as template", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await page.getByRole("button", { name: "More save options" }).click();
      await page.getByRole("button", { name: "Save as a template" }).click();
      const templateName = withRunSuffix(REFERENCE_BLOCK_ANCHORS.testimonialHeading, shortRunId());
      const postPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/mailchimp/templates/") &&
          r.request().method() === "POST" &&
          r.ok(),
      );
      await page.getByPlaceholder("Untitled template").fill(templateName);
      await Promise.all([
        postPromise,
        page.getByRole("button", { name: "Save template", exact: true }).click(),
      ]);
      await expect(page.getByText("Template saved")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-tpl-change mailchimp change template re-parses canvas", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await page.getByRole("button", { name: "More save options" }).click();
      await page.getByRole("button", { name: "Change template" }).click();
      await expect(page.getByText("Replace template")).toBeVisible();
      const templatesPromise = page.waitForResponse(
        (r) => r.url().includes("/api/mailchimp/templates/") && r.request().method() === "GET",
      );
      await templatesPromise;
      const useTemplate = page.getByRole("button", { name: "Use template" }).first();
      if (await useTemplate.isVisible()) {
        await useTemplate.click();
        await expect(page.getByText("Template updated")).toBeVisible({ timeout: 30_000 });
        await expect(canvasLocator(page)).toBeVisible();
      }
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  test("KV-preview klaviyo preview opens with tabs and send CTA", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftViaApi(page, cleanup);
      await openKlaviyoEditor(page, id);
      await openPreviewFromEditor(page);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-preview mailchimp preview opens with tabs and send CTA", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await openPreviewFromEditor(page);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  test("KV-save-ok klaviyo save persists and stays on editor", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.savePersist);
      const patchPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/klaviyo/klaviyo-drafts/${id}/`) &&
          r.request().method() === "PATCH",
      );
      await page.getByTestId("klaviyo-draft-save").click();
      await patchPromise;
      await expect(page.getByText("Saved")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/klaviyo/${id}(?:\\?|$)`));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-save-fail klaviyo save error shows message @fault", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.saveFail);
      await page.route(`**/api/klaviyo/klaviyo-drafts/${id}/**`, async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Save failed in test" }),
          });
          return;
        }
        await route.continue();
      });
      await page.getByTestId("klaviyo-draft-save").click();
      await expect(page.getByText("Save failed in test")).toBeVisible({ timeout: 30_000 });
      await expect(canvasLocator(page).getByText(EDIT_TARGET_COPY.saveFail)).toBeVisible();
      await page.unroute(`**/api/klaviyo/klaviyo-drafts/${id}/**`);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-save-busy klaviyo save button disabled while saving", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.saveBusy);
      let releasePatch!: () => void;
      const patchGate = new Promise<void>((resolve) => {
        releasePatch = resolve;
      });
      await page.route(`**/api/klaviyo/klaviyo-drafts/${id}/**`, async (route) => {
        if (route.request().method() === "PATCH") {
          await patchGate;
          await route.continue();
          return;
        }
        await route.continue();
      });
      const saveButton = page.getByTestId("klaviyo-draft-save");
      await saveButton.click();
      await expect(saveButton).toBeDisabled();
      releasePatch();
      await expect(saveButton).toBeEnabled({ timeout: 30_000 });
      await page.unroute(`**/api/klaviyo/klaviyo-drafts/${id}/**`);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-save-ok mailchimp save and exit navigates back", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.savePersist);
      const patchPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/template-content/`) &&
          r.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save and exit" }).click();
      await patchPromise;
      await expect(page).toHaveURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 });
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-save-fail mailchimp save error keeps editor @fault", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.saveFail);
      await page.route(`**/api/mailchimp/email-drafts/${id}/template-content/**`, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Save failed in test" }),
        });
      });
      await page.getByRole("button", { name: "Save and exit" }).click();
      await expect(page.getByText("Save failed in test")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(new RegExp(`/mailchimp/${id}(?:\\?|$)`));
      await page.unroute(`**/api/mailchimp/email-drafts/${id}/template-content/**`);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-save-thumb mailchimp thumbnail failure does not block save", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      const patchPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/mailchimp/email-drafts/${id}/template-content/`) &&
          r.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save and exit" }).click();
      const response = await patchPromise;
      expect(response.ok()).toBeTruthy();
      await expect(page).toHaveURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 });
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // Exit
  // ---------------------------------------------------------------------------

  test("KV-exit-clean klaviyo exit clean navigates freely", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftViaApi(page, cleanup);
      await openKlaviyoEditor(page, id);
      await page.getByRole("button", { name: "Exit" }).click();
      await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/, { timeout: 30_000 });
      await expect(page.getByTestId("unsaved-changes-dialog")).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("KV-exit-dirty klaviyo exit dirty shows unsaved dialog", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeadingKlaviyoBlock(EDIT_SEED_HEADING),
      );
      await openKlaviyoEditor(page, id, { anchorText: EDIT_SEED_HEADING });
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.exitDirty);
      await page.getByRole("button", { name: "Exit" }).click();
      await expect(page.getByTestId("unsaved-changes-dialog")).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/klaviyo(?:\?|$)/, { timeout: 30_000 }),
        page.getByTestId("unsaved-changes-leave").click(),
      ]);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-exit-clean mailchimp exit clean navigates freely", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftViaApi(page, cleanup);
      await openMailchimpEditor(page, id);
      await exitMailchimpEditorViaHeaderBack(page);
      await expect(page).toHaveURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 });
      await expect(page.getByTestId("unsaved-changes-dialog")).not.toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-exit-dirty mailchimp exit dirty shows unsaved dialog", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
      );
      await openMailchimpEditor(page, id);
      await editCanvasTextBlock(page, EDIT_SEED_HEADING, EDIT_TARGET_COPY.exitDirty);
      await exitMailchimpEditorViaHeaderBack(page);
      await expect(page.getByTestId("unsaved-changes-dialog")).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 }),
        page.getByTestId("unsaved-changes-leave").click(),
      ]);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // List after save
  // ---------------------------------------------------------------------------

  test("KV-list-after klaviyo saved draft shows updated row", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const runId = shortRunId();
      const subject = withRunSuffix(REFERENCE_BLOCK_ANCHORS.needHelpHeading, runId);
      const { id } = await createKlaviyoDraftViaApi(page, cleanup, { subject, name: subject });
      await openKlaviyoEditor(page, id);
      await page.getByTestId("klaviyo-draft-rename-trigger").click();
      await page.getByTestId("klaviyo-draft-rename-input").fill(subject);
      await page.getByTestId("klaviyo-draft-rename-input").blur();
      await page.getByTestId("klaviyo-draft-save").click();
      await expect(page.getByText("Saved")).toBeVisible();
      await page.getByRole("button", { name: "Exit" }).click();
      await goToKlaviyoList(page);
      await expectKlaviyoTableVisible(page);
      await expect(getDraftRow(page, subject).first()).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-list-after mailchimp saved draft shows updated row", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const runId = shortRunId();
      const subjectLine = withRunSuffix(REFERENCE_BLOCK_ANCHORS.freeShippingHeading, runId);
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildSingleHeadingMailchimpSection(EDIT_SEED_HEADING),
        { subjectLine },
      );
      await openMailchimpEditor(page, id);
      await page.getByRole("button", { name: "Save and exit" }).click();
      await expect(page).toHaveURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 });
      await goToMailchimpList(page);
      await expectMailchimpTableVisible(page);
      await expect(getDraftRow(page, subjectLine).first()).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });
});
