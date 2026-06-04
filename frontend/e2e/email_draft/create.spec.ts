import { expect, test, type Page } from "@playwright/test";
import {
  cleanupDraftRefs,
  createCleanupRef,
  goToKlaviyoList,
  goToMailchimpList,
} from "./email-draft-helpers";

async function submitMailchimpCreateDraft(page: Page) {
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/mailchimp/email-drafts/") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Create draft" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();
  return createResponse;
}

test.describe("Email draft create flows (Klaviyo)", () => {
  test.describe.configure({ mode: "serial" });

  test("Y2-busy ignores double-create while creating", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      let postCount = 0;
      await page.route("**/api/klaviyo/klaviyo-drafts/", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        postCount += 1;
        await page.waitForTimeout(700);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: 990001,
            subject: "Untitled template",
            status: "draft",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      });

      await goToKlaviyoList(page);

      const button = page.getByRole("button", { name: "New template" });
      await button.click();
      await button.click();

      await expect(page).toHaveURL(/\/klaviyo\/\d+(?:\?|$)/, { timeout: 30_000 });
      expect(postCount).toBe(1);

      const match = /\/klaviyo\/(\d+)(?:\?|$)/.exec(page.url());
      if (match) {
        cleanup.klaviyo.push(Number(match[1]));
      }
    } finally {
      await cleanupDraftRefs(page, cleanup);
      await page.unroute("**/api/klaviyo/klaviyo-drafts/");
    }
  });

  test("Y2-ok inline create opens editor", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await goToKlaviyoList(page);

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/klaviyo/klaviyo-drafts/") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );

      await page.getByRole("button", { name: "New template" }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.ok()).toBeTruthy();

      await expect(page).toHaveURL(/\/klaviyo\/\d+(?:\?|$)/, { timeout: 30_000 });
      const match = /\/klaviyo\/(\d+)(?:\?|$)/.exec(page.url());
      expect(match).toBeTruthy();
      cleanup.klaviyo.push(Number(match?.[1]));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2-fail inline create shows error toast", async ({ page }) => {
    await page.route("**/api/klaviyo/klaviyo-drafts/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Create failed" }),
      });
    });

    try {
      await goToKlaviyoList(page);
      await page.getByRole("button", { name: "New template" }).click();

      await expect(page.getByText("Failed to create template. Please try again.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/);
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/");
    }
  });

  test("Y2-no-id inline create falls back to list refresh", async ({ page }) => {
    let getCount = 0;
    await page.route("**/api/klaviyo/klaviyo-drafts/", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            subject: "Untitled template",
            status: "draft",
          }),
        });
        return;
      }
      if (method === "GET") {
        getCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }
      await route.continue();
    });

    try {
      await goToKlaviyoList(page);
      const before = getCount;
      await page.getByRole("button", { name: "New template" }).click();

      await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "Klaviyo templates", level: 1 })).toBeVisible();
      await expect.poll(() => getCount).toBeGreaterThan(before);
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/");
    }
  });

  test("Y3a /klaviyo/new valid submit opens editor", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await page.goto("/klaviyo/new");
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("Y3a Klaviyo Subject");
      await page.getByPlaceholder("e.g. 2026-04 spring campaign").fill("Y3a Internal Name");

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/klaviyo/klaviyo-drafts/") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );

      await page.getByRole("button", { name: "Create template" }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.ok()).toBeTruthy();

      await expect(page).toHaveURL(/\/klaviyo\/\d+(?:\?|$)/, { timeout: 30_000 });
      const match = /\/klaviyo\/(\d+)(?:\?|$)/.exec(page.url());
      expect(match).toBeTruthy();
      cleanup.klaviyo.push(Number(match?.[1]));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y3b /klaviyo/new validation fail stays", async ({ page }) => {
    await page.goto("/klaviyo/new");
    const createButton = page.getByRole("button", { name: "Create template" });
    await expect(createButton).toBeDisabled();
    await createButton.click({ force: true });
    await expect(page).toHaveURL(/\/klaviyo\/new(?:\?|$)/);
  });

  test("Y-cancel from /klaviyo/new returns list", async ({ page }) => {
    await page.goto("/klaviyo/new");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/klaviyo(?:\?|$)/);
  });

  test("Y-submit-ok shows created toast", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await page.goto("/klaviyo/new");
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("Y-submit-ok Subject");
      await page.getByRole("button", { name: "Create template" }).click();

      await expect(page.getByText("Template created")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/klaviyo\/\d+(?:\?|$)/, { timeout: 30_000 });

      const match = /\/klaviyo\/(\d+)(?:\?|$)/.exec(page.url());
      expect(match).toBeTruthy();
      cleanup.klaviyo.push(Number(match?.[1]));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y-submit-fail keeps user on form", async ({ page }) => {
    await page.route("**/api/klaviyo/klaviyo-drafts/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Create failed in test" }),
      });
    });

    try {
      await page.goto("/klaviyo/new");
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("Y-submit-fail Subject");
      await page.getByRole("button", { name: "Create template" }).click();

      await expect(page).toHaveURL(/\/klaviyo\/new(?:\?|$)/);
      await expect(page.getByText("Create failed in test")).toBeVisible({ timeout: 30_000 });
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/");
    }
  });
});

test.describe("Email draft create flows (Mailchimp)", () => {
  test.describe.configure({ mode: "serial" });

  const templateA = { id: 970001, name: "Starter Template A", category: "General" };
  const templateB = { id: 970002, name: "Starter Template B", category: "General" };

  test("MC-X1 mailchimp X1 New draft opens create page", async ({ page }) => {
    await goToMailchimpList(page);
    const header = page.locator("div").filter({
      has: page.getByRole("heading", { name: "Mailchimp drafts", level: 1 }),
    }).first();
    const newDraftButton = header.getByRole("button", { name: "New draft" });
    await expect(newDraftButton).toBeVisible();
    await expect(newDraftButton).toBeEnabled();

    await Promise.all([
      page.waitForURL(/\/mailchimp\/new(?:\?|$)/, { timeout: 30_000 }),
      newDraftButton.click(),
    ]);
  });

  test("MC-Y3-loading mailchimp Y3-loading template area shows loading state", async ({ page }) => {
    let resolveFirstTemplateRequest!: () => void;
    const firstTemplateRequestGate = new Promise<void>((resolve) => {
      resolveFirstTemplateRequest = resolve;
    });
    let resolveFirstTemplateRequestSeen!: () => void;
    const firstTemplateRequestSeen = new Promise<void>((resolve) => {
      resolveFirstTemplateRequestSeen = resolve;
    });
    let firstRequestSeen = false;
    let gateReleased = false;
    const releaseFirstTemplateRequest = () => {
      if (gateReleased) return;
      gateReleased = true;
      resolveFirstTemplateRequest();
    };
    let isFirstTemplateRequest = true;

    await page.route("**/api/mailchimp/templates/**", async (route) => {
      if (isFirstTemplateRequest) {
        isFirstTemplateRequest = false;
        if (!firstRequestSeen) {
          firstRequestSeen = true;
          resolveFirstTemplateRequestSeen();
        }
        await firstTemplateRequestGate;
      }
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([templateA]),
        });
      } catch {
        // Ignore rare teardown races where Playwright marks route already handled.
      }
    });

    try {
      await page.goto("/mailchimp/new");
      await firstTemplateRequestSeen;
      await expect(page.getByText("Loading templates...")).toBeVisible();
      releaseFirstTemplateRequest();
      await expect(page.getByText("Loading templates...")).not.toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: templateA.name })).toBeVisible();
    } finally {
      releaseFirstTemplateRequest();
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y3-error mailchimp Y3-error shows template load error and retry", async ({ page }) => {
    let getCount = 0;
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      getCount += 1;
      if (getCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Template API down" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([templateA, templateB]),
        });
      }
    });

    try {
      await page.goto("/mailchimp/new");
      await expect(page.getByText("Failed to load templates")).toBeVisible();
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(page.getByRole("button", { name: templateA.name })).toBeVisible({ timeout: 30_000 });
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y3-empty mailchimp Y3-empty blocks submit without template", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      await expect(page.getByText("No templates available yet.")).toBeVisible();

      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y3-empty Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y3-empty From");
      await page.getByPlaceholder("e.g. team@example.com").fill("empty@example.com");

      const createButton = page.getByRole("button", { name: "Create draft" });
      await expect(createButton).toBeDisabled();
      await expect(createButton).toHaveAttribute("title", "Pick a template first");
      await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/);
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y3-auto mailchimp Y3-auto auto-selects only template", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([templateA]),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      await expect(page.getByRole("button", { name: templateA.name })).toBeVisible();

      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y3-auto Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y3-auto From");
      await page.getByPlaceholder("e.g. team@example.com").fill("auto@example.com");

      const createButton = page.getByRole("button", { name: "Create draft" });
      await expect(createButton).toBeEnabled();
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y3-pick mailchimp Y3-pick user selection sets template id", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([templateA, templateB]),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      const picked = page.getByRole("button", { name: templateB.name });
      await picked.click();
      await expect(picked).toHaveClass(/ring-2/);
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y4-template-missing mailchimp Y4 template required validation", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([templateA, templateB]),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y4-template Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y4-template From");
      await page.getByPlaceholder("e.g. team@example.com").fill("template@example.com");

      const createButton = page.getByRole("button", { name: "Create draft" });
      await expect(createButton).toBeDisabled();
      await expect(createButton).toHaveAttribute("title", "Pick a template first");
      await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/);
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y4-subject-missing mailchimp Y4 subject required validation", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([templateA]) });
    });

    try {
      await page.goto("/mailchimp/new");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y4-subject From");
      await page.getByPlaceholder("e.g. team@example.com").fill("subject@example.com");
      const createButton = page.getByRole("button", { name: "Create draft" });
      await expect(createButton).toBeDisabled();
      await expect(createButton).toHaveAttribute("title", "Subject is required");
      await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/);
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y4-from-name-missing mailchimp Y4 from-name required validation", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([templateA]) });
    });

    try {
      await page.goto("/mailchimp/new");
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y4-from Subject");
      await page.getByPlaceholder("e.g. team@example.com").fill("from@example.com");
      const createButton = page.getByRole("button", { name: "Create draft" });
      await expect(createButton).toBeDisabled();
      await expect(createButton).toHaveAttribute("title", "From name is required");
      await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/);
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y4-reply-to-missing mailchimp Y4 reply-to required validation", async ({ page }) => {
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([templateA]) });
    });

    try {
      await page.goto("/mailchimp/new");
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y4-reply Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y4-reply From");
      const createButton = page.getByRole("button", { name: "Create draft" });
      await expect(createButton).toBeDisabled();
      await expect(createButton).toHaveAttribute("title", "Reply-to email is required");
      await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/);
    } finally {
      await page.unroute("**/api/mailchimp/templates/**");
    }
  });

  test("MC-Y4-preview-empty mailchimp Y4 preview optional branch still submits", async ({ page }) => {
    const cleanup = createCleanupRef();
    let createPayload: any = null;
    await page.route("**/api/mailchimp/templates/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([templateA]) });
    });
    await page.route("**/api/mailchimp/email-drafts/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      createPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: 980001,
          status: "draft",
          settings: { subject_line: "MC-Y4-preview Subject", from_name: "MC-Y4-preview From" },
        }),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      const templateCard = page.getByRole("button", { name: templateA.name });
      await expect(templateCard).toBeVisible({ timeout: 30_000 });
      await templateCard.click();
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y4-preview Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y4-preview From");
      await page.getByPlaceholder("e.g. team@example.com").fill("preview@example.com");
      await expect(page.getByRole("button", { name: "Create draft" })).toBeEnabled();
      await submitMailchimpCreateDraft(page);
      await expect(page).toHaveURL(/\/mailchimp\/\d+(?:\?|$)/, { timeout: 30_000 });

      const match = /\/mailchimp\/(\d+)(?:\?|$)/.exec(page.url());
      if (match) cleanup.mailchimp.push(Number(match[1]));
      expect(createPayload?.settings?.subject_line).toBe("MC-Y4-preview Subject");
      expect(createPayload?.settings?.preview_text).toBeUndefined();
    } finally {
      await cleanupDraftRefs(page, cleanup);
      await page.unroute("**/api/mailchimp/templates/**");
      await page.unroute("**/api/mailchimp/email-drafts/");
    }
  });

  test("MC-Y5-id mailchimp Y5 created.id routes to editor", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await page.goto("/mailchimp/new");
      await page.getByRole("button", { name: "Starter Template" }).first().click();
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y5-id Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y5-id From");
      await page.getByPlaceholder("e.g. team@example.com").fill("y5id@example.com");

      await submitMailchimpCreateDraft(page);
      await expect(page).toHaveURL(/\/mailchimp\/\d+(?:\?|$)/, { timeout: 30_000 });
      const match = /\/mailchimp\/(\d+)(?:\?|$)/.exec(page.url());
      expect(match).toBeTruthy();
      cleanup.mailchimp.push(Number(match?.[1]));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y5-no-id mailchimp Y5 no id falls back to list", async ({ page }) => {
    await page.route("**/api/mailchimp/email-drafts/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "draft",
          settings: { subject_line: "MC-Y5-no-id Subject", from_name: "MC-Y5-no-id From" },
        }),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      await page.getByRole("button", { name: "Starter Template" }).first().click();
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y5-no-id Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y5-no-id From");
      await page.getByPlaceholder("e.g. team@example.com").fill("y5noid@example.com");
      await submitMailchimpCreateDraft(page);
      await expect(page).toHaveURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 });
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/");
    }
  });

  test("MC-Y-cancel mailchimp Y-cancel returns to list", async ({ page }) => {
    await page.goto("/mailchimp/new");
    await Promise.all([
      page.waitForURL(/\/mailchimp(?:\?|$)/, { timeout: 30_000 }),
      page.getByRole("button", { name: "Cancel" }).click(),
    ]);
  });

  test("MC-Y-submit-ok mailchimp Y-submit-ok shows success feedback", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await page.goto("/mailchimp/new");
      await page.getByRole("button", { name: "Starter Template" }).first().click();
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y-submit-ok Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y-submit-ok From");
      await page.getByPlaceholder("e.g. team@example.com").fill("submitok@example.com");

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/mailchimp/email-drafts/") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Create draft" }).click();
      // Toast is shown on /mailchimp/new before router.push; assert it before navigation completes.
      await expect(page.getByText("Draft created")).toBeVisible({ timeout: 30_000 });
      const createResponse = await createResponsePromise;
      expect(createResponse.ok()).toBeTruthy();
      await expect(page).toHaveURL(/\/mailchimp\/\d+(?:\?|$)/, { timeout: 30_000 });

      const match = /\/mailchimp\/(\d+)(?:\?|$)/.exec(page.url());
      if (match) cleanup.mailchimp.push(Number(match[1]));
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("MC-Y-submit-fail mailchimp Y-submit-fail shows inline submitError", async ({ page }) => {
    await page.route("**/api/mailchimp/email-drafts/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Create failed in test" }),
      });
    });

    try {
      await page.goto("/mailchimp/new");
      await page.getByRole("button", { name: "Starter Template" }).first().click();
      await page.getByPlaceholder("e.g. Spring promotion launch").fill("MC-Y-submit-fail Subject");
      await page.getByPlaceholder("e.g. Marketing team").fill("MC-Y-submit-fail From");
      await page.getByPlaceholder("e.g. team@example.com").fill("submitfail@example.com");

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/mailchimp/email-drafts/") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Create draft" }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(500);

      await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/);
      await expect(page.getByText("Create failed in test")).toBeVisible({ timeout: 30_000 });
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/");
    }
  });
});

