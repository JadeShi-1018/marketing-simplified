/**
 * Style inspector & LumaStyle seed flows — plan §8 (8a–8h).
 * @see frontend/e2e/email_draft/note/e2e-email-draft-plan.md §8
 */
import { expect, test } from "@playwright/test";
import { REFERENCE_IMAGE_URL } from "./fixtures/editor-flow-fixtures";
import {
  buildLumaStyleKlaviyoButtonBlock,
  buildLumaStyleKlaviyoDividerBlock,
  buildLumaStyleKlaviyoHeaderBarBlock,
  buildLumaStyleKlaviyoHtmlBlock,
  buildLumaStyleKlaviyoLayoutBlock,
  buildLumaStyleKlaviyoSocialBlock,
  buildLumaStyleKlaviyoSpacerBlock,
  buildLumaStyleKlaviyoTextBlock,
  buildLumaStyleKlaviyoVideoBlock,
  buildLumaStyleMailchimpButtonSection,
  buildLumaStyleMailchimpDividerSection,
  buildLumaStyleMailchimpLayoutSection,
  buildLumaStyleMailchimpLogoSection,
  buildLumaStyleMailchimpSocialSection,
  buildLumaStyleMailchimpTextSection,
  getLumaStyleRow,
  LUMASTYLE_L2_SPOT_CHECKS,
  lumaStyleExpectedButtonSpotValues,
  lumaStyleExpectedTextSpotValues,
} from "./fixtures/lumastyle-style-fixtures";
import {
  buildReferenceKlaviyoBlocks,
  buildReferenceMailchimpSections,
  REFERENCE_LUMASTYLE_ANCHORS,
} from "./fixtures/reference-email-blocks";
import {
  canvasLocator,
  cleanupDraftRefs,
  createCleanupRef,
  createKlaviyoDraftWithBlocksViaApi,
  createMailchimpDraftWithSectionsViaApi,
  expectImageSrcMatchesKlaviyoPreview,
  klaviyoHeaderBarCanvasBlock,
  openKlaviyoEditor,
  openKlaviyoEditorViaLiveDraftApi,
  openMailchimpEditor,
  selectMailchimpImageBlock,
} from "./email-draft-helpers";
import {
  clickKlaviyoCanvasBlockByBadge,
  clickMailchimpCanvasBlockByBadge,
  expectCanvasButtonTypography,
  expectCanvasHeadingTypography,
  expectMailchimpLayoutInspectorStructure,
  expectMailchimpLayoutInspectorStyle,
  hexToRgbString,
  klaviyoTextInspectorPanel,
  openInspectorTab,
} from "./style-e2e-helpers";

test.describe("Email draft style flows @style", () => {
  // ---------------------------------------------------------------------------
  // §8a Text — Heading / Paragraph (Mailchimp) vs Text (Klaviyo)
  // ---------------------------------------------------------------------------

  test.describe("§8a Text", () => {
    test("Y-style-kv-text-l2 klaviyo main heading luma typography on canvas", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow(LUMASTYLE_L2_SPOT_CHECKS.klaviyoText.row);
      const expected = lumaStyleExpectedTextSpotValues(row);
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoTextBlock("Main Heading"),
        );
        await openKlaviyoEditor(page, id);
        await expectCanvasHeadingTypography(page, row.content, {
          fontSize: `${expected.fontSize}px`,
          colorHex: expected.color,
          fontWeight: expected.fontWeight,
        });
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-text-inspector klaviyo text style controls visible", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow("Main Heading");
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoTextBlock("Main Heading"),
        );
        await openKlaviyoEditor(page, id);
        await canvasLocator(page).getByRole("heading", { name: row.content }).click();
        await openInspectorTab(page, "Styles");

        const panel = klaviyoTextInspectorPanel(page);
        await expect(panel.getByText("Font Family", { exact: true })).toBeVisible();
        await expect(panel.getByText("Font Size", { exact: true })).toBeVisible();
        await expect(panel.getByText("Text Color", { exact: true })).toBeVisible();
        await expect(panel.getByText("Block background color", { exact: true })).toBeVisible();
        await expect(panel.getByText("Border", { exact: true })).toBeVisible();
        await expect(panel.getByText("Full width on mobile", { exact: true })).toBeVisible();
        await expect(panel.getByText("Alignment", { exact: true })).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-mc-text mailchimp luma heading typography renders on canvas", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow("Main Heading");
      const expected = lumaStyleExpectedTextSpotValues(row);
      try {
        const { id } = await createMailchimpDraftWithSectionsViaApi(
          page,
          cleanup,
          buildLumaStyleMailchimpTextSection("Main Heading"),
        );
        await openMailchimpEditor(page, id);
        await expectCanvasHeadingTypography(page, row.content, {
          fontSize: `${expected.fontSize}px`,
          colorHex: expected.color,
          fontWeight: expected.fontWeight,
        });
        await canvasLocator(page).getByText(row.content, { exact: false }).first().click();
        await openInspectorTab(page, "Styles");
        await expect(page.getByText("Link Desktop and Mobile Styles")).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });
  

  // ---------------------------------------------------------------------------
  // §8b Button
  // ---------------------------------------------------------------------------

  test.describe("§8b Button", () => {
    test("Y-style-kv-button-l2 klaviyo button luma colors on canvas", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow(LUMASTYLE_L2_SPOT_CHECKS.klaviyoButton.row);
      const expected = lumaStyleExpectedButtonSpotValues(row);
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoButtonBlock(),
        );
        await openKlaviyoEditor(page, id);
        await expectCanvasButtonTypography(page, row.content, {
          fontSize: `${expected.fontSize}px`,
          colorHex: expected.buttonTextColor,
          backgroundColorHex: expected.buttonBackgroundColor,
        });
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-button-inspector klaviyo button style controls visible", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow("Button");
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoButtonBlock(),
        );
        await openKlaviyoEditor(page, id);
        await canvasLocator(page).getByRole("button", { name: row.content }).click();
        await openInspectorTab(page, "Styles");

        await expect(page.getByText("Link address", { exact: true })).toBeVisible();
        await expect(page.getByText("Button Color", { exact: true })).toBeVisible();
        await expect(page.getByText("Text Color", { exact: true })).toBeVisible();
        await expect(page.getByText("Border Style", { exact: true })).toBeVisible();
        await expect(page.getByText("Font Family", { exact: true })).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-mc-button mailchimp luma button renders on canvas", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow("Button");
      const expected = lumaStyleExpectedButtonSpotValues(row);
      try {
        const { id } = await createMailchimpDraftWithSectionsViaApi(
          page,
          cleanup,
          buildLumaStyleMailchimpButtonSection(),
        );
        await openMailchimpEditor(page, id);
        const canvasButton = canvasLocator(page).getByRole("button", {
          name: row.content,
        });
        await expect(canvasButton.first()).toBeVisible({ timeout: 30_000 });
        await canvasButton.first().click();
        await openInspectorTab(page, "Styles");
        await expect(page.getByText("Colors", { exact: true })).toBeVisible();
        await expect(page.getByText("Link Desktop and Mobile Styles")).toBeVisible();
        await expect(canvasButton.first()).toHaveCSS("color", hexToRgbString(expected.buttonTextColor));
        await expect(canvasButton.first()).toHaveCSS(
          "background-color",
          hexToRgbString(expected.buttonBackgroundColor),
        );
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });


  });

  // ---------------------------------------------------------------------------
  // §8c Image and Logo
  // ---------------------------------------------------------------------------

  test.describe("§8c Image", () => {
    test("Y-style-kv-image klaviyo image display modes and static imageUrl", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const blocks = buildReferenceKlaviyoBlocks().filter((b) => b.block_type === "Image");
        const { id } = await createKlaviyoDraftWithBlocksViaApi(page, cleanup, blocks);
        await openKlaviyoEditor(page, id);
        await canvasLocator(page).getByTestId("email-draft-image-block").click();
        await openInspectorTab(page, "Styles");
        await expect(page.getByText("Display Mode", { exact: true })).toBeVisible();
        const displayModeSelect = page
          .locator("select")
          .filter({ has: page.getByRole("option", { name: "Original", exact: true }) })
          .first();
        await expect(displayModeSelect).toBeVisible();
        await expect(displayModeSelect).toHaveValue("Original");

        await expectImageSrcMatchesKlaviyoPreview(
          canvasLocator(page).getByTestId("email-draft-image-block").locator("img"),
          REFERENCE_IMAGE_URL,
        );
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-mc-image mailchimp image size modes and luma alt text", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createMailchimpDraftWithSectionsViaApi(
          page,
          cleanup,
          buildReferenceMailchimpSections(),
        );
        await openMailchimpEditor(page, id);
        await selectMailchimpImageBlock(page);
        await openInspectorTab(page, "Content");

        await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Fill" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Scale" })).toBeVisible();
        await expect(
          page.getByPlaceholder("Describe what you see in the image"),
        ).toHaveValue(REFERENCE_LUMASTYLE_ANCHORS.imageAlt);
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    
  });

  // ---------------------------------------------------------------------------
  // §8d Divider
  // ---------------------------------------------------------------------------

  test.describe("§8d Divider", () => {
    test("Y-style-mc-divider mailchimp divider style inspector optional spot-check", async ({
      page,
    }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createMailchimpDraftWithSectionsViaApi(
          page,
          cleanup,
          buildLumaStyleMailchimpDividerSection(),
        );
        await openMailchimpEditor(page, id);
        await expect(canvasLocator(page).locator(".relative.border").first()).toBeVisible({
          timeout: 30_000,
        });
        await clickMailchimpCanvasBlockByBadge(page, "Divider");
        await openInspectorTab(page, "Styles");
        await expect(page.getByText("Divider Line", { exact: false })).toBeVisible();
        await expect(page.getByText("Link Desktop and Mobile Styles")).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-divider klaviyo divider render-only no style inspector", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoDividerBlock(),
        );
        await openKlaviyoEditor(page, id);
        await clickKlaviyoCanvasBlockByBadge(page, "Divider");

        await expect(page.getByRole("button", { name: "Content", exact: true })).toBeVisible();
        await expect(klaviyoTextInspectorPanel(page)).not.toBeVisible();
        await expect(canvasLocator(page).getByText("Divider").first()).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §8e Social
  // ---------------------------------------------------------------------------

  test.describe("§8e Social", () => {
    test("Y-style-mc-social mailchimp luma social intro copy renders on canvas", async ({ page }) => {
      const cleanup = createCleanupRef();
      const row = getLumaStyleRow("Social Section");
      const expected = lumaStyleExpectedTextSpotValues(row);
      try {
        const { id } = await createMailchimpDraftWithSectionsViaApi(
          page,
          cleanup,
          buildLumaStyleMailchimpSocialSection(),
        );
        await openMailchimpEditor(page, id);
        await expectCanvasHeadingTypography(page, row.content, {
          fontSize: `${expected.fontSize}px`,
          colorHex: expected.color,
          fontWeight: expected.fontWeight,
        });
        await canvasLocator(page).getByText(row.content, { exact: false }).first().click();
        await openInspectorTab(page, "Styles");
        await expect(page.getByText("Link Desktop and Mobile Styles")).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-social klaviyo per-link platform inspector", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoSocialBlock(),
        );
        await openKlaviyoEditorViaLiveDraftApi(page, id);
        await clickKlaviyoCanvasBlockByBadge(page, "Social");

        // Klaviyo social inspector label is "Link address" (not "URL").
        await expect(page.getByText("Platform", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Link address", { exact: true }).first()).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §8f Layout / Split — structure and style inspector
  // ---------------------------------------------------------------------------

  test.describe("§8f Layout / Split", () => {
    test("Y-style-mc-layout mailchimp layout block structure and style inspector", async ({
      page,
    }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createMailchimpDraftWithSectionsViaApi(
          page,
          cleanup,
          buildLumaStyleMailchimpLayoutSection(),
        );
        await openMailchimpEditor(page, id);
        await clickMailchimpCanvasBlockByBadge(page, "Layout");
        await openInspectorTab(page, "Styles");
        await expectMailchimpLayoutInspectorStructure(page);
        await expectMailchimpLayoutInspectorStyle(page);

        const layoutContainer = canvasLocator(page).locator(".layout-container");
        await expect(layoutContainer).toBeVisible({ timeout: 30_000 });
        await expect(canvasLocator(page).getByText("Add block", { exact: true })).toHaveCount(2);
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-split klaviyo split block drop zones render", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoLayoutBlock(),
        );
        await openKlaviyoEditor(page, id);
        await clickKlaviyoCanvasBlockByBadge(page, "Layout");

        const canvas = canvasLocator(page);
        await expect(canvas.getByText("Add block", { exact: true })).toHaveCount(2);
        await expect(canvas.getByText("or drop content here", { exact: true })).toHaveCount(
          2,
        );
        await expect(canvas.locator(".layout-container")).toBeVisible();

        // No Klaviyo Layout/Split style inspector — palette lives under Content tab (not Styles).
        await expect(page.getByRole("button", { name: "Content", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Content", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "CONTENT BLOCKS", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "BLANK LAYOUTS", exact: true }),
        ).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // §8g Klaviyo-only blocks
  // ---------------------------------------------------------------------------

  test.describe("§8g Klaviyo-only blocks", () => {
    test("Y-style-kv-header-bar header bar layout inspector controls", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoHeaderBarBlock(),
        );
        await openKlaviyoEditor(page, id);
        await klaviyoHeaderBarCanvasBlock(page).click();
        await openInspectorTab(page, "Styles");

        await expect(page.getByText("Desktop layout", { exact: false })).toBeVisible();
        await expect(page.getByRole("button", { name: /Select logo|Replace logo/ })).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-video video url and thumbnail inspector", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoVideoBlock(),
        );
        await openKlaviyoEditor(page, id);
        await canvasLocator(page).getByTestId("email-draft-video-block").click();
        await openInspectorTab(page, "Styles");

        await expect(page.getByText("Video URL", { exact: true })).toBeVisible();
        await expect(page.getByText("Upload a video thumbnail", { exact: false })).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-html html textarea inspector", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoHtmlBlock(),
        );
        await openKlaviyoEditor(page, id);
        await clickKlaviyoCanvasBlockByBadge(page, "Code");

        await expect(page.getByText("HTML Code", { exact: true })).toBeVisible();
        await expect(page.getByPlaceholder("Enter your HTML code here...")).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });

    test("Y-style-kv-spacer spacer height control visible", async ({ page }) => {
      const cleanup = createCleanupRef();
      try {
        const { id } = await createKlaviyoDraftWithBlocksViaApi(
          page,
          cleanup,
          buildLumaStyleKlaviyoSpacerBlock(),
        );
        await openKlaviyoEditor(page, id);
        await clickKlaviyoCanvasBlockByBadge(page, "Spacer");

        await expect(page.getByText("Height", { exact: true })).toBeVisible();
      } finally {
        await cleanupDraftRefs(page, cleanup);
      }
    });
  });

  
});
