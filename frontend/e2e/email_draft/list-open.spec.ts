import { expect, test, type Page } from "@playwright/test";
import {
  cleanupDraftRefs,
  createCleanupRef,
  createKlaviyoDraftViaApi,
  createMailchimpDraftViaApi,
  expectKlaviyoTableVisible,
  expectMailchimpTableVisible,
  getDraftRow,
  goToKlaviyoList,
  goToMailchimpList,
  openRowActionsMenu,
} from "./email-draft-helpers";

async function routeKlaviyoListWithDraft(
  page: Page,
  draft: { id?: number; slug: string; renderedTitle: string; subject?: string; status?: string },
): Promise<void> {
  await page.route("**/api/klaviyo/klaviyo-drafts/", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: draft.id,
          slug: draft.slug,
          name: draft.renderedTitle,
          subject: draft.subject ?? draft.renderedTitle,
          status: draft.status ?? "draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  });
}

async function routeMailchimpListWithDraft(
  page: Page,
  draft: { id?: number; slug: string; renderedTitle: string; fromName?: string; status?: string },
): Promise<void> {
  await page.route("**/api/mailchimp/email-drafts/", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: draft.id,
          slug: draft.slug,
          status: draft.status ?? "draft",
          settings: {
            subject_line: draft.renderedTitle,
            from_name: draft.fromName ?? "Marketing team",
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  });
}

test.describe("Email draft list load flows (Y1)", () => {
  test.describe.configure({ mode: "serial" });

  test("Y1a-table (Klaviyo): GET OK with rows", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createKlaviyoDraftViaApi(page, cleanup);
      const { renderedTitle } = draft;
      await routeKlaviyoListWithDraft(page, draft);

      await goToKlaviyoList(page);

      await expect(page).toHaveURL(/\/klaviyo$/);
      await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
      await expect(
        page.getByRole("row").filter({ has: page.getByRole("button", { name: renderedTitle }) })
      ).toBeVisible();
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y1a-empty (Klaviyo): GET OK zero rows no search", async ({ page }) => {
    await page.route("**/api/klaviyo/klaviyo-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/klaviyo");
    await expect(page.getByRole("heading", { name: "Klaviyo templates", level: 1 })).toBeVisible();
    await expect(page.getByText("No Klaviyo templates yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create your first template" })).toBeVisible();

    await page.unroute("**/api/klaviyo/klaviyo-drafts/**");
  });

  test("Y1a-search-empty (Klaviyo): GET OK with rows but search no match", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await createKlaviyoDraftViaApi(page, cleanup);
      await goToKlaviyoList(page);

      await page.getByPlaceholder("Search Klaviyo templates").fill("zzzz-no-templates-match-zzzz");
      await expect(page.getByText("No templates match your search")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y1b (Klaviyo): 401 redirects to /login", async ({ page }) => {
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

    await page.goto("/klaviyo");
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    await page.unroute("**/api/klaviyo/klaviyo-drafts/**");
  });

  test("Y1c (Klaviyo): API error shows Retry then recovers", async ({ page }) => {
    let getCount = 0;
    await page.route("**/api/klaviyo/klaviyo-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        getCount += 1;
        if (getCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Server error" }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: 900001,
                name: "Retry row",
                subject: "Recovered",
                status: "draft",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ]),
          });
        }
        return;
      }
      await route.continue();
    });

    await page.goto("/klaviyo");
    await expect(page.getByText("Failed to load templates")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry row" })).toBeVisible();

    await page.unroute("**/api/klaviyo/klaviyo-drafts/**");
  });

  test("Y1a-table (Mailchimp): GET OK with rows", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createMailchimpDraftViaApi(page, cleanup);
      const { renderedTitle } = draft;
      await routeMailchimpListWithDraft(page, draft);

      await goToMailchimpList(page);

      await expect(page).toHaveURL(/\/mailchimp$/);
      await expect(page.getByRole("columnheader", { name: "Subject" })).toBeVisible();
      await expect(
        page.getByRole("row").filter({ has: page.getByRole("button", { name: renderedTitle }) })
      ).toBeVisible();
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y1a-empty (Mailchimp): GET OK zero rows no search", async ({ page }) => {
    await page.route("**/api/mailchimp/email-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/mailchimp");
    await expect(page.getByRole("heading", { name: "Mailchimp drafts", level: 1 })).toBeVisible();
    await expect(page.getByText("No Mailchimp drafts yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create your first draft" })).toBeVisible();

    await page.unroute("**/api/mailchimp/email-drafts/**");
  });

  test("Y1a-search-empty (Mailchimp): GET OK with rows but search no match", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      await createMailchimpDraftViaApi(page, cleanup);
      await goToMailchimpList(page);

      await page.getByPlaceholder("Search Mailchimp drafts").fill("zzzz-no-templates-match-zzzz");
      await expect(page.getByText("No drafts match your search")).toBeVisible();
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y1b (Mailchimp): 401 redirects to /login", async ({ page }) => {
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

    await page.goto("/mailchimp");
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    await page.unroute("**/api/mailchimp/email-drafts/**");
  });

  test("Y1c (Mailchimp): API error shows Retry then recovers", async ({ page }) => {
    let getCount = 0;
    await page.route("**/api/mailchimp/email-drafts/**", async (route) => {
      if (route.request().method() === "GET") {
        getCount += 1;
        if (getCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Server error" }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: 910001,
                subject: "Retry draft",
                status: "draft",
                from_name: "Marketing team",
                settings: {
                  subject_line: "Retry draft",
                  from_name: "Marketing team",
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ]),
          });
        }
        return;
      }
      await route.continue();
    });

    await page.goto("/mailchimp");
    await expect(page.getByText("Failed to load drafts")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("columnheader", { name: "Subject" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry draft" })).toBeVisible();

    await page.unroute("**/api/mailchimp/email-drafts/**");
  });
});

test.describe("Email draft list actions (Y2)", () => {
  test.describe.configure({ mode: "serial" });

  test("Y2a (KV): search filters title, subject, status", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createKlaviyoDraftViaApi(page, cleanup, {
        name: "Y2A KV Name Signal",
        subject: "Y2A KV Subject Signal",
        status: "draft",
      });
      const { renderedTitle } = draft;
      await routeKlaviyoListWithDraft(page, {
        ...draft,
        subject: "Y2A KV Subject Signal",
        status: "draft",
      });

      await goToKlaviyoList(page);
      await expectKlaviyoTableVisible(page);

      const search = page.getByPlaceholder("Search Klaviyo templates");
      const row = getDraftRow(page, renderedTitle).first();

      await search.fill("Y2A KV Name Signal");
      await expect(row).toBeVisible();

      await search.fill("Y2A KV Subject Signal");
      await expect(row).toBeVisible();

      await search.fill("draft");
      await expect(row).toBeVisible();

      await search.fill("zzzz-no-kv-match-zzzz");
      await expect(page.getByText("No templates match your search")).toBeVisible();
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2a (MC): search filters title, fromName, status", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createMailchimpDraftViaApi(page, cleanup, {
        subjectLine: "Y2A MC Subject Signal",
        fromName: "Y2A MC FromName Signal",
      });
      const { renderedTitle } = draft;
      await routeMailchimpListWithDraft(page, {
        ...draft,
        fromName: "Y2A MC FromName Signal",
      });

      await goToMailchimpList(page);
      await expectMailchimpTableVisible(page);

      const search = page.getByPlaceholder("Search Mailchimp drafts");
      const row = getDraftRow(page, renderedTitle).first();

      await search.fill("Y2A MC Subject Signal");
      await expect(row).toBeVisible();

      await search.fill("Y2A MC FromName Signal");
      await expect(row).toBeVisible();

      await search.fill("draft");
      await expect(row).toBeVisible();

      await search.fill("zzzz-no-mc-match-zzzz");
      await expect(page.getByText("No drafts match your search")).toBeVisible();
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2b-title (KV): clicking row title opens editor route", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createKlaviyoDraftViaApi(page, cleanup);
      const { slug, renderedTitle } = draft;
      await routeKlaviyoListWithDraft(page, draft);

      await goToKlaviyoList(page);
      await getDraftRow(page, renderedTitle)
        .getByRole("button", { name: renderedTitle })
        .first()
        .click();

      await expect(page).toHaveURL(new RegExp(String.raw`/klaviyo/${slug}(?:\?|$)`), {
        timeout: 30_000,
      });
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2b-title (MC): clicking row title opens editor route", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createMailchimpDraftViaApi(page, cleanup);
      const { slug, renderedTitle } = draft;
      await routeMailchimpListWithDraft(page, draft);

      await goToMailchimpList(page);
      await getDraftRow(page, renderedTitle)
        .getByRole("button", { name: renderedTitle })
        .first()
        .click();

      await expect(page).toHaveURL(new RegExp(String.raw`/mailchimp/${slug}(?:\?|$)`), {
        timeout: 30_000,
      });
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2b-menu (KV): row actions Edit opens same editor route", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createKlaviyoDraftViaApi(page, cleanup);
      const { slug, renderedTitle } = draft;
      await routeKlaviyoListWithDraft(page, draft);

      await goToKlaviyoList(page);
      await openRowActionsMenu(page, renderedTitle);
      await page.getByRole("menuitem", { name: "Edit" }).click();

      await expect(page).toHaveURL(new RegExp(String.raw`/klaviyo/${slug}(?:\?|$)`), {
        timeout: 30_000,
      });
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2b-menu (MC): row actions Edit opens same editor route", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createMailchimpDraftViaApi(page, cleanup);
      const { slug, renderedTitle } = draft;
      await routeMailchimpListWithDraft(page, draft);

      await goToMailchimpList(page);
      await openRowActionsMenu(page, renderedTitle);
      await page.getByRole("menuitem", { name: "Edit" }).click();

      await expect(page).toHaveURL(new RegExp(String.raw`/mailchimp/${slug}(?:\?|$)`), {
        timeout: 30_000,
      });
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2c (KV): row actions Delete confirm shows toast and calls DELETE API", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createKlaviyoDraftViaApi(page, cleanup);
      const { slug, renderedTitle } = draft;
      await routeKlaviyoListWithDraft(page, draft);

      await goToKlaviyoList(page);
      await openRowActionsMenu(page, renderedTitle);
      await page.getByRole("menuitem", { name: "Delete" }).click();

      await expect(page.getByRole("heading", { name: "Move this template to trash?" })).toBeVisible();

      const deleteResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/klaviyo/klaviyo-drafts/${slug}/`) &&
          response.request().method() === "DELETE",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Delete" }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.ok()).toBeTruthy();

      await expect(page.getByText(`Moved "${renderedTitle}" to trash`)).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await page.unroute("**/api/klaviyo/klaviyo-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2c (MC): row actions Delete confirm shows toast and calls DELETE API", async ({ page }) => {
    const cleanup = createCleanupRef();
    try {
      const draft = await createMailchimpDraftViaApi(page, cleanup);
      const { slug, renderedTitle } = draft;
      await routeMailchimpListWithDraft(page, draft);

      await goToMailchimpList(page);
      await openRowActionsMenu(page, renderedTitle);
      await page.getByRole("menuitem", { name: "Delete" }).click();

      await expect(page.getByRole("heading", { name: "Delete this draft?" })).toBeVisible();

      const deleteResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/mailchimp/email-drafts/${slug}/`) &&
          response.request().method() === "DELETE",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Delete" }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.ok()).toBeTruthy();

      await expect(page.getByText(`Deleted "${renderedTitle}"`)).toBeVisible({ timeout: 30_000 });
    } finally {
      await page.unroute("**/api/mailchimp/email-drafts/").catch(() => {});
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2d (KV): header New template creates inline and navigates to editor", async ({ page }) => {
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

      const created = (await createResponse.json()) as { id?: number };
      if (typeof created.id === "number") {
        cleanup.klaviyo.push(created.id);
      }

      // Backend can return create payload without id; UI resolves it and navigates using slug.
      await expect(page).toHaveURL(/\/klaviyo\/[\w-]+(?:\?|$)/, { timeout: 30_000 });
    } finally {
      await cleanupDraftRefs(page, cleanup);
    }
  });

  test("Y2d (MC): header New draft navigates to /mailchimp/new", async ({ page }) => {
    await goToMailchimpList(page);
    await page.getByRole("button", { name: "New draft" }).click();
    await expect(page).toHaveURL(/\/mailchimp\/new(?:\?|$)/, { timeout: 30_000 });
  });
});
