/**
 * Image & media asset flows — plan §6.1
 * @see frontend/e2e/email_draft/note/e2e-email-draft-plan.md §6.1
 */
import { expect, test } from "@playwright/test";
import {
  buildMailchimpImageOnlySections,
  buildMailchimpImageWithUrlSections,
  buildSingleHeaderBarKlaviyoBlock,
  buildSingleImageKlaviyoBlock,
  buildSingleVideoKlaviyoBlock,
  E2E_MINIMAL_PNG_BASE64,
  E2E_SECOND_IMAGE_URL,
  REFERENCE_IMAGE_ALT,
  REFERENCE_IMAGE_URL,
} from "./fixtures/editor-flow-fixtures";
import {
  canvasLocator,
  cleanupDraftRefs,
  createCleanupRef,
  createKlaviyoDraftWithBlocksViaApi,
  createMailchimpDraftWithSectionsViaApi,
  expectImageSrcMatchesKlaviyoPreview,
  expectKlaviyoImageSelectionModalHidden,
  importKlaviyoImageViaApi,
  klaviyoHeaderBarCanvasBlock,
  openKlaviyoEditor,
  openKlaviyoImageModalForHeaderBarLogo,
  openKlaviyoImageModalForImageBlock,
  openKlaviyoImageModalForVideoBlock,
  selectKlaviyoLibraryImage,
  openMailchimpContentStudioFromImageInspector,
  openMailchimpEditor,
  closeMailchimpContentStudio,
  pickMailchimpContentStudioFile,
  seedMailchimpContentStudioImportUrl,
} from "./email-draft-helpers";

const MINIMAL_PNG = Buffer.from(E2E_MINIMAL_PNG_BASE64, "base64");

test.describe("Email draft image & media flows @media", () => {
  test.describe.configure({ mode: "serial" });

  // ---------------------------------------------------------------------------
  // Klaviyo — KlaviyoImageSelectionModal (§6.1)
  // ---------------------------------------------------------------------------

  test("Y-img-lib klaviyo image library search sort and select", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const imported = await importKlaviyoImageViaApi(page, REFERENCE_IMAGE_URL, "E2E library anchor");
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleImageKlaviyoBlock({ imageAlt: REFERENCE_IMAGE_ALT }),
      );
      await openKlaviyoEditor(page, id);

      const imagesPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/klaviyo/images/") &&
          r.request().method() === "GET" &&
          r.ok(),
      );
      await openKlaviyoImageModalForImageBlock(page);
      await imagesPromise;

      await expect(page.getByRole("button", { name: "Image library" })).toBeVisible();
      await page.getByPlaceholder("Search by name or ID").fill("E2E library");
      await expect(page.getByText("E2E library anchor")).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: /Sort by: Creation time/ }).click();
      await page.getByRole("option", { name: "Creation time (Least to most)" }).click();

      await selectKlaviyoLibraryImage(page, imported.name);
      await page.getByRole("button", { name: "Confirm" }).click();
      await expectKlaviyoImageSelectionModalHidden(page);

      await expectImageSrcMatchesKlaviyoPreview(
        canvasLocator(page).getByTestId("email-draft-image-block").locator("img"),
        imported.preview_url,
      );
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-img-upload klaviyo image upload tab posts file", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleImageKlaviyoBlock({ imageAlt: REFERENCE_IMAGE_ALT }),
      );
      await openKlaviyoEditor(page, id);
      await openKlaviyoImageModalForImageBlock(page);

      await page.getByRole("button", { name: "Upload image" }).click();
      const uploadPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/klaviyo/images/upload/") &&
          r.request().method() === "POST" &&
          r.ok(),
        { timeout: 60_000 },
      );
      await page.locator('input[type="file"][accept*="image"]').setInputFiles({
        name: "e2e-upload.png",
        mimeType: "image/png",
        buffer: MINIMAL_PNG,
      });
      await uploadPromise;

      await expect(page.getByRole("button", { name: "Image library" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("e2e-upload.png")).toBeVisible({ timeout: 30_000 });
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-img-import klaviyo image import URL tab posts url", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleImageKlaviyoBlock({ imageAlt: REFERENCE_IMAGE_ALT }),
      );
      await openKlaviyoEditor(page, id);
      await openKlaviyoImageModalForImageBlock(page);

      await page.getByRole("button", { name: "Import URL" }).click();
      const importPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/klaviyo/images/import-url/") &&
          r.request().method() === "POST" &&
          r.ok(),
        { timeout: 60_000 },
      );
      await page.getByPlaceholder("http://website.com/image.jpg").fill(E2E_SECOND_IMAGE_URL);
      await page.getByRole("button", { name: "Import image" }).click();
      const importResponse = await importPromise;
      const { name: importedName } = (await importResponse.json()) as { name: string };

      await expect(page.getByRole("button", { name: "Image library" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: importedName })).toBeVisible({ timeout: 30_000 });
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-img-video klaviyo video thumbnail opens image modal", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const seeded = await importKlaviyoImageViaApi(page, REFERENCE_IMAGE_URL, "E2E video thumb");
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleVideoKlaviyoBlock(),
      );
      await openKlaviyoEditor(page, id);

      const imagesPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/klaviyo/images/") &&
          r.request().method() === "GET" &&
          r.ok(),
      );
      await openKlaviyoImageModalForVideoBlock(page);
      await imagesPromise;

      await selectKlaviyoLibraryImage(page, seeded.name);
      await page.getByRole("button", { name: "Confirm" }).click();
      await expect(
        canvasLocator(page)
          .getByTestId("email-draft-video-block")
          .getByRole("img", { name: "Video thumbnail" }),
      ).toBeVisible({ timeout: 30_000 });
      await expectImageSrcMatchesKlaviyoPreview(
        canvasLocator(page).getByTestId("email-draft-video-block").getByRole("img", {
          name: "Video thumbnail",
        }),
        seeded.preview_url,
      );
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-img-header klaviyo header bar logo opens image modal", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const seeded = await importKlaviyoImageViaApi(page, REFERENCE_IMAGE_URL, "E2E header logo");
      const { id } = await createKlaviyoDraftWithBlocksViaApi(
        page,
        cleanup,
        buildSingleHeaderBarKlaviyoBlock(),
      );
      await openKlaviyoEditor(page, id);

      const imagesPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/klaviyo/images/") &&
          r.request().method() === "GET" &&
          r.ok(),
      );
      await openKlaviyoImageModalForHeaderBarLogo(page);
      await imagesPromise;

      await selectKlaviyoLibraryImage(page, seeded.name);
      await page.getByRole("button", { name: "Confirm" }).click();
      await expect(
        klaviyoHeaderBarCanvasBlock(page).getByRole("img", { name: "Logo" }),
      ).toBeVisible({ timeout: 30_000 });
      await expectImageSrcMatchesKlaviyoPreview(
        klaviyoHeaderBarCanvasBlock(page).getByRole("img", { name: "Logo" }),
        seeded.preview_url,
      );
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  // ---------------------------------------------------------------------------
  // Mailchimp — Content Studio (§6.1)
  // ---------------------------------------------------------------------------

  test("Y-cs-open mailchimp Content Studio opens from image block", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildMailchimpImageOnlySections(),
      );
      await openMailchimpEditor(page, id);
      await openMailchimpContentStudioFromImageInspector(page);
      await expect(page.getByText("Manage and upload images for your email")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-cs-pick mailchimp Content Studio pick updates canvas imageUrl", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildMailchimpImageOnlySections(),
      );
      await openMailchimpEditor(page, id);
      const fileName = await seedMailchimpContentStudioImportUrl(page, REFERENCE_IMAGE_URL);
      await pickMailchimpContentStudioFile(page, fileName);
      await expect(page.getByRole("heading", { name: "Content Studio" })).not.toBeVisible({
        timeout: 30_000,
      });

      await expect(
        canvasLocator(page).getByTestId("email-draft-image-block").locator("img"),
      ).toHaveAttribute("src", /unsplash\.com/);
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-cs-close mailchimp Content Studio close keeps canvas image", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const { id } = await createMailchimpDraftWithSectionsViaApi(
        page,
        cleanup,
        buildMailchimpImageWithUrlSections(),
      );
      await openMailchimpEditor(page, id);
      const beforeSrc = await canvasLocator(page)
        .getByTestId("email-draft-image-block")
        .locator("img")
        .getAttribute("src");

      await openMailchimpContentStudioFromImageInspector(page);
      await closeMailchimpContentStudio(page);

      const afterSrc = await canvasLocator(page)
        .getByTestId("email-draft-image-block")
        .locator("img")
        .getAttribute("src");
      expect(afterSrc).toBe(beforeSrc);
      expect(afterSrc).toContain("unsplash.com");
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });
});
