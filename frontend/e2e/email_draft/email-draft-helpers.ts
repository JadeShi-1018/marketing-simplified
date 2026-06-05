import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  KLAVIYO_LIST_FIXTURE,
  MAILCHIMP_LIST_FIXTURE,
  shortRunId,
  withRunSuffix,
} from "./fixtures/list-user-data";

/** Zustand persist key used by the frontend auth store (same as localStorage in the browser). */
const AUTH_STORAGE_KEY = "auth-storage";

/**
 * Written by `e2e/auth.setup.ts` after login.
 * Playwright projects load this via `storageState: 'e2e/.auth/user.json'`.
 */
const AUTH_FILE = path.resolve(__dirname, "../.auth/user.json");

export type CleanupRef = {
  klaviyo: number[];
  mailchimp: number[];
};

type DraftLike = {
  id?: number;
  name?: string;
  subject?: string;
  settings?: {
    subject_line?: string;
    from_name?: string;
  };
  updated_at?: string;
  created_at?: string;
};

export function createCleanupRef(): CleanupRef {
  return {
    klaviyo: [],
    mailchimp: [],
  };
}

/**
 * Step 1 primary path: read token from `e2e/.auth/user.json` (no browser page required).
 */
function readAuthStorageFromStorageStateFile(): {
  token: string | null;
  organizationAccessToken: string | null;
} {
  try {
    const fileContents = fs.readFileSync(AUTH_FILE, "utf8");
    const storageState = JSON.parse(fileContents) as {
      origins?: Array<{
        localStorage?: Array<{ name: string; value: string }>;
      }>;
    };

    const authEntry = storageState.origins
      ?.flatMap((origin) => origin.localStorage ?? [])
      .find((entry) => entry.name === AUTH_STORAGE_KEY);

    if (!authEntry?.value) {
      return { token: null, organizationAccessToken: null };
    }

    const parsed: {
      state?: { token?: string; organizationAccessToken?: string };
    } = JSON.parse(authEntry.value);

    return {
      token: parsed.state?.token ?? null,
      organizationAccessToken: parsed.state?.organizationAccessToken ?? null,
    };
  } catch {
    return { token: null, organizationAccessToken: null };
  }
}

function authorizedRequestHeaders(): Record<string, string> {
  const { token, organizationAccessToken } = readAuthStorageFromStorageStateFile();
  if (!token) {
    throw new Error(
      `No auth token in ${AUTH_FILE}. Run Playwright setup first: e2e/auth.setup.ts`,
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (organizationAccessToken) {
    headers["X-Organization-Token"] = organizationAccessToken;
  }
  return headers;
}

function getApiOrigin(page: Page): string {
  const currentUrl = page.url();
  if (currentUrl && !currentUrl.startsWith("about:blank")) {
    return new URL(currentUrl).origin;
  }
  return new URL(process.env.BASE_URL || "http://localhost").origin;
}

function sortByMostRecent(a: DraftLike, b: DraftLike): number {
  const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
  const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
  return bTime - aTime;
}

export async function createKlaviyoDraftViaApi(
  page: Page,
  cleanup: CleanupRef,
  opts?: {
    name?: string;
    subject?: string;
    status?: "draft" | "published" | "archived";
  },
): Promise<{ id: number; renderedTitle: string }> {
  const runId = shortRunId();
  const name = withRunSuffix(opts?.name ?? KLAVIYO_LIST_FIXTURE.name, runId);
  const subject = withRunSuffix(opts?.subject ?? KLAVIYO_LIST_FIXTURE.subject, runId);
  const status = opts?.status ?? KLAVIYO_LIST_FIXTURE.status;

  const response = await page.request.post(
    `${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/`,
    {
      headers: authorizedRequestHeaders(),
      data: {
        name,
        subject,
        status,
      },
    }
  );

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DraftLike;
  let id = body?.id;
  if (typeof id !== "number") {
    const listResponse = await page.request.get(`${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/`, {
      headers: authorizedRequestHeaders(),
    });
    expect(listResponse.ok()).toBeTruthy();
    const listBody = await listResponse.json();
    const drafts = (listBody?.results || listBody || []) as DraftLike[];
    const sortedDrafts = [...drafts].sort(sortByMostRecent);
    const matchedDraft =
      sortedDrafts.find((draft) => draft.subject === subject && draft.name === name) ||
      sortedDrafts[0];
    id = matchedDraft?.id;
  }
  if (typeof id !== "number") {
    throw new TypeError("Klaviyo create draft response missing id.");
  }

  cleanup.klaviyo.push(id);
  return { id, renderedTitle: name };
}

async function getMailchimpTemplateId(
  page: Page,
): Promise<number> {
  const templatesRes = await page.request.get(
    `${getApiOrigin(page)}/api/mailchimp/templates/`,
    {
      headers: authorizedRequestHeaders(),
    }
  );
  expect(templatesRes.ok()).toBeTruthy();
  const templatesBody = await templatesRes.json();
  const templates = (templatesBody?.results || templatesBody || []) as Array<{ id: number }>;
  const existingId = templates.find((template) => typeof template.id === "number")?.id;
  if (!existingId) {
    throw new Error("No Mailchimp template found. Seed one template first for e2e.");
  }
  return existingId;
}

export async function createMailchimpDraftViaApi(
  page: Page,
  cleanup: CleanupRef,
  opts?: {
    subjectLine?: string;
    previewText?: string;
    fromName?: string;
    replyTo?: string;
    templateId?: number;
  },
): Promise<{ id: number; renderedTitle: string }> {
  const runId = shortRunId();
  const templateId = opts?.templateId ?? (await getMailchimpTemplateId(page));
  const subjectLine = withRunSuffix(opts?.subjectLine ?? MAILCHIMP_LIST_FIXTURE.subjectLine, runId);
  const replyTo = opts?.replyTo ?? process.env.DEV_USER_EMAIL ?? "devuser@example.com";
  const previewText = opts?.previewText ?? MAILCHIMP_LIST_FIXTURE.previewText;
  const fromName = opts?.fromName ?? MAILCHIMP_LIST_FIXTURE.fromName;

  const response = await page.request.post(
    `${getApiOrigin(page)}/api/mailchimp/email-drafts/`,
    {
      headers: authorizedRequestHeaders(),
      data: {
        type: "regular",
        status: "draft",
        settings: {
          subject_line: subjectLine,
          preview_text: previewText,
          from_name: fromName,
          reply_to: replyTo,
          template_id: templateId,
        },
      },
    }
  );

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DraftLike;
  let id = body?.id;
  if (typeof id !== "number") {
    const listResponse = await page.request.get(`${getApiOrigin(page)}/api/mailchimp/email-drafts/`, {
      headers: authorizedRequestHeaders(),
    });
    expect(listResponse.ok()).toBeTruthy();
    const listBody = await listResponse.json();
    const drafts = (listBody?.results || listBody || []) as DraftLike[];
    const sortedDrafts = [...drafts].sort(sortByMostRecent);
    const matchedDraft =
      sortedDrafts.find(
        (draft) =>
          draft.settings?.subject_line === subjectLine &&
          draft.settings?.from_name === fromName
      ) || sortedDrafts[0];
    id = matchedDraft?.id;
  }
  if (typeof id !== "number") {
    throw new TypeError("Mailchimp create draft response missing id.");
  }

  cleanup.mailchimp.push(id);
  return { id, renderedTitle: subjectLine };
}

export async function deleteKlaviyoDraftViaApi(page: Page, id: number): Promise<void> {
  const response = await page.request.delete(`${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/${id}/`, {
    headers: authorizedRequestHeaders(),
  });
  if (response.status() === 404) return;
  expect(response.ok()).toBeTruthy();
}

export async function deleteMailchimpDraftViaApi(page: Page, id: number): Promise<void> {
  const response = await page.request.delete(`${getApiOrigin(page)}/api/mailchimp/email-drafts/${id}/`, {
    headers: authorizedRequestHeaders(),
  });
  if (response.status() === 404) return;
  expect(response.ok()).toBeTruthy();
}

export async function cleanupDraftRefs(page: Page, cleanup: CleanupRef): Promise<void> {
  for (const id of cleanup.klaviyo.splice(0)) {
    await deleteKlaviyoDraftViaApi(page, id).catch(() => {});
  }
  for (const id of cleanup.mailchimp.splice(0)) {
    await deleteMailchimpDraftViaApi(page, id).catch(() => {});
  }
}

export async function goToKlaviyoList(page: Page): Promise<void> {
  await page.goto("/klaviyo", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForResponse(
    (response) =>
      response.url().includes("/api/klaviyo/klaviyo-drafts/") &&
      response.request().method() === "GET",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("heading", { name: "Klaviyo templates", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Loading templates...")).not.toBeVisible({ timeout: 30_000 });

  const table = page.getByRole("table");
  const empty = page.getByText("No Klaviyo templates yet");
  const error = page.getByText("Failed to load templates");
  await expect(table.or(empty).or(error).first()).toBeVisible({ timeout: 30_000 });
}

export async function goToMailchimpList(page: Page): Promise<void> {
  await page.goto("/mailchimp", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForResponse(
    (response) =>
      response.url().includes("/api/mailchimp/email-drafts/") &&
      response.request().method() === "GET",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("heading", { name: "Mailchimp drafts", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Loading drafts...")).not.toBeVisible({ timeout: 30_000 });

  const table = page.getByRole("table");
  const empty = page.getByText("No Mailchimp drafts yet");
  const error = page.getByText("Failed to load drafts");
  await expect(table.or(empty).or(error).first()).toBeVisible({ timeout: 30_000 });
}

export async function expectKlaviyoTableVisible(page: Page): Promise<void> {
  await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({
    timeout: 30_000,
  });
}

export async function expectMailchimpTableVisible(page: Page): Promise<void> {
  await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("columnheader", { name: "Subject" })).toBeVisible({
    timeout: 30_000,
  });
}

export function getDraftRow(page: Page, titleSubstring: string) {
  return page.getByRole("row").filter({ hasText: titleSubstring });
}

export async function openRowActionsMenu(page: Page, titleSubstring: string): Promise<void> {
  const row = getDraftRow(page, titleSubstring).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Row actions" }).click();
}

export function modKey(): "Meta" | "Control" {
  return process.platform === "darwin" ? "Meta" : "Control";
}

export async function patchKlaviyoDraftBlocks(
  page: Page,
  draftId: number,
  blocks: Array<{ block_type: string; order: number; content: Record<string, unknown> }>,
): Promise<void> {
  const response = await page.request.patch(
    `${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/${draftId}/`,
    {
      headers: authorizedRequestHeaders(),
      data: { blocks },
    },
  );
  expect(response.ok()).toBeTruthy();
}

export async function patchMailchimpDraftSections(
  page: Page,
  draftId: number,
  sections: Record<string, string>,
): Promise<void> {
  const response = await page.request.patch(
    `${getApiOrigin(page)}/api/mailchimp/email-drafts/${draftId}/template-content/`,
    {
      headers: authorizedRequestHeaders(),
      data: {
        template_data: {
          default_content: { sections },
        },
      },
    },
  );
  expect(response.ok()).toBeTruthy();
}

function matchesKlaviyoDraftGet(response: { url: () => string; request: () => { method: () => string } }, draftId: number): boolean {
  const url = response.url();
  return (
    response.request().method() === "GET" &&
    url.includes("/api/klaviyo/klaviyo-drafts/") &&
    url.includes(String(draftId))
  );
}

function matchesKlaviyoDraftPatch(
  response: { url: () => string; request: () => { method: () => string }; ok: () => boolean },
  draftId: number,
): boolean {
  const url = response.url();
  return (
    response.request().method() === "PATCH" &&
    url.includes("/api/klaviyo/klaviyo-drafts/") &&
    url.includes(String(draftId)) &&
    response.ok()
  );
}

function klaviyoDraftNeedsInitialSave(draftBody: { blocks?: unknown[] }): boolean {
  return !Array.isArray(draftBody.blocks) || draftBody.blocks.length === 0;
}

function matchesMailchimpDraftGet(response: { url: () => string; request: () => { method: () => string } }, draftId: number): boolean {
  const url = response.url();
  return (
    response.request().method() === "GET" &&
    url.includes("/api/mailchimp/email-drafts/") &&
    url.includes(String(draftId))
  );
}

export async function getKlaviyoDraftViaApi(
  page: Page,
  draftId: number,
): Promise<{ blocks?: unknown[] }> {
  const response = await page.request.get(
    `${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/${draftId}/`,
    { headers: authorizedRequestHeaders() },
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function waitForKlaviyoDraftLoad(page: Page, draftId: number): Promise<void> {
  await page.waitForResponse((response) => matchesKlaviyoDraftGet(response, draftId), {
    timeout: 60_000,
  });
}

export async function waitForMailchimpDraftLoad(page: Page, draftId: number): Promise<void> {
  await page.waitForResponse((response) => matchesMailchimpDraftGet(response, draftId), {
    timeout: 60_000,
  });
}

/** Wait until Klaviyo editor finished loading (positive UI gate — canvas mounts only after load). */
export async function waitForKlaviyoEditorReady(
  page: Page,
  opts?: { anchorText?: string },
): Promise<void> {
  await expect(page.getByText("Loading template...")).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId("email-draft-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Failed to load template")).toBeHidden({ timeout: 5_000 });
  if (opts?.anchorText) {
    await expect(
      page.getByTestId("email-draft-canvas").getByText(opts.anchorText, { exact: false }),
    ).toBeVisible({ timeout: 30_000 });
  }
}

function klaviyoDraftDetailRouteGlob(draftId: number): string {
  // Trailing `*` (not `/**`) so `/klaviyo-drafts/793/` matches — `/**` requires an extra path segment.
  return `**/api/klaviyo/klaviyo-drafts/${draftId}*`;
}

export async function openKlaviyoEditor(
  page: Page,
  draftId: number,
  opts?: { anchorText?: string; returnTo?: string },
): Promise<void> {
  const draftBody = await getKlaviyoDraftViaApi(page, draftId);
  const needsInitialSave = klaviyoDraftNeedsInitialSave(draftBody);
  const routePattern = klaviyoDraftDetailRouteGlob(draftId);
  const editorPath = opts?.returnTo
    ? `/klaviyo/${draftId}?returnTo=${encodeURIComponent(opts.returnTo)}`
    : `/klaviyo/${draftId}`;

  await page.route(routePattern, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(draftBody),
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.goto(editorPath, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (needsInitialSave) {
      await page.waitForResponse((response) => matchesKlaviyoDraftPatch(response, draftId), {
        timeout: 60_000,
      });
    }
    await waitForKlaviyoEditorReady(page, opts);
  } finally {
    await page.unroute(routePattern).catch(() => {});
  }
}

/**
 * Open Klaviyo editor against the real draft GET (no route mock).
 * Use when `openKlaviyoEditor` route-fulfill leaves "Loading template..." stuck.
 */
export async function openKlaviyoEditorViaLiveDraftApi(
  page: Page,
  draftId: number,
  opts?: { anchorText?: string },
): Promise<void> {
  const draftGet = page.waitForResponse(
    (response) => matchesKlaviyoDraftGet(response, draftId),
    { timeout: 60_000 },
  );
  await page.goto(`/klaviyo/${draftId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await draftGet;
  await waitForKlaviyoEditorReady(page, opts);
}

function mailchimpDraftDetailRouteGlob(draftId: number): string {
  return `**/api/mailchimp/email-drafts/${draftId}*`;
}

export async function getMailchimpDraftViaApi(
  page: Page,
  draftId: number,
): Promise<Record<string, unknown>> {
  const response = await page.request.get(
    `${getApiOrigin(page)}/api/mailchimp/email-drafts/${draftId}/`,
    { headers: authorizedRequestHeaders() },
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export function getMailchimpSectionsFromDraft(
  draft: Record<string, unknown>,
): Record<string, string> | undefined {
  const settings = draft.settings as
    | { template?: { default_content?: { sections?: unknown } } }
    | undefined;
  const templateData = draft.template_data as
    | { default_content?: { sections?: unknown } }
    | undefined;

  const normalize = (raw: unknown): Record<string, string> | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        map[key] = value;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  };

  return (
    normalize(settings?.template?.default_content?.sections) ??
    normalize(templateData?.default_content?.sections)
  );
}

/** Route-fulfilled GET: sync patched sections onto both paths the editor reads. */
function buildMailchimpEditorDraftFulfillBody(
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const sections = getMailchimpSectionsFromDraft(draft);
  if (!sections || Object.keys(sections).length === 0) {
    return draft;
  }

  const settings =
    draft.settings && typeof draft.settings === "object"
      ? (draft.settings as Record<string, unknown>)
      : {};
  const template =
    settings.template && typeof settings.template === "object"
      ? (settings.template as Record<string, unknown>)
      : {};
  const templateDefaultContent =
    template.default_content && typeof template.default_content === "object"
      ? (template.default_content as Record<string, unknown>)
      : {};

  const existingTemplateData =
    draft.template_data && typeof draft.template_data === "object"
      ? (draft.template_data as Record<string, unknown>)
      : {};
  const existingTemplateDataDefault =
    existingTemplateData.default_content &&
    typeof existingTemplateData.default_content === "object"
      ? (existingTemplateData.default_content as Record<string, unknown>)
      : {};

  return {
    ...draft,
    settings: {
      ...settings,
      template: {
        ...template,
        default_content: {
          ...templateDefaultContent,
          sections,
        },
      },
    },
    template_data: {
      ...existingTemplateData,
      default_content: {
        ...existingTemplateDataDefault,
        sections,
      },
    },
  };
}

/** Wait until Mailchimp editor finished loading (canvas mounts only after load). */
export async function waitForMailchimpEditorReady(
  page: Page,
  opts?: { anchorText?: string; canvasText?: string },
): Promise<void> {
  await expect(page.getByTestId("email-draft-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading email draft...")).toBeHidden({ timeout: 30_000 });
  const canvas = page.getByTestId("email-draft-canvas");
  if (opts?.anchorText) {
    await expect(canvas.getByRole("heading", { name: opts.anchorText })).toBeVisible({
      timeout: 30_000,
    });
  }
  if (opts?.canvasText) {
    await expect(canvas.getByText(opts.canvasText, { exact: false })).toBeVisible({
      timeout: 30_000,
    });
  }
}

export async function openMailchimpEditor(
  page: Page,
  draftId: number,
  opts?: { anchorText?: string; canvasText?: string },
): Promise<void> {
  const draftBody = buildMailchimpEditorDraftFulfillBody(
    await getMailchimpDraftViaApi(page, draftId),
  );
  const routePattern = mailchimpDraftDetailRouteGlob(draftId);

  await page.route(routePattern, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(draftBody),
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.goto(`/mailchimp/${draftId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForMailchimpEditorReady(page, opts);
  } finally {
    await page.unroute(routePattern).catch(() => {});
  }
}

export async function createKlaviyoDraftWithBlocksViaApi(
  page: Page,
  cleanup: CleanupRef,
  blocks: Array<{ block_type: string; order: number; content: Record<string, unknown> }>,
  opts?: { name?: string; subject?: string },
): Promise<{ id: number; renderedTitle: string }> {
  const runId = shortRunId();
  const name = withRunSuffix(opts?.name ?? KLAVIYO_LIST_FIXTURE.name, runId);
  const subject = withRunSuffix(opts?.subject ?? KLAVIYO_LIST_FIXTURE.subject, runId);
  const status = KLAVIYO_LIST_FIXTURE.status;

  const response = await page.request.post(
    `${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/`,
    {
      headers: authorizedRequestHeaders(),
      data: {
        name,
        subject,
        status,
        blocks,
      },
    },
  );

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DraftLike;
  let id = body?.id;
  if (typeof id !== "number") {
    const listResponse = await page.request.get(`${getApiOrigin(page)}/api/klaviyo/klaviyo-drafts/`, {
      headers: authorizedRequestHeaders(),
    });
    expect(listResponse.ok()).toBeTruthy();
    const listBody = await listResponse.json();
    const drafts = (listBody?.results || listBody || []) as DraftLike[];
    const sortedDrafts = [...drafts].sort(sortByMostRecent);
    const matchedDraft =
      sortedDrafts.find((draft) => draft.subject === subject && draft.name === name) ||
      sortedDrafts[0];
    id = matchedDraft?.id;
  }
  if (typeof id !== "number") {
    throw new TypeError("Klaviyo create draft response missing id.");
  }

  const loaded = await getKlaviyoDraftViaApi(page, id);
  const blockCount = Array.isArray(loaded.blocks) ? loaded.blocks.length : 0;
  expect(blockCount).toBeGreaterThan(0);

  cleanup.klaviyo.push(id);
  return { id, renderedTitle: name };
}

export async function createMailchimpDraftWithSectionsViaApi(
  page: Page,
  cleanup: CleanupRef,
  sections: Record<string, string>,
  opts?: Parameters<typeof createMailchimpDraftViaApi>[2],
): Promise<{ id: number; renderedTitle: string }> {
  const created = await createMailchimpDraftViaApi(page, cleanup, opts);
  await patchMailchimpDraftSections(page, created.id, sections);
  const loaded = await getMailchimpDraftViaApi(page, created.id);
  const persisted = getMailchimpSectionsFromDraft(loaded);
  for (const [key, html] of Object.entries(sections)) {
    expect(persisted?.[key], `Mailchimp section "${key}" missing after template-content patch`).toBe(
      html,
    );
  }
  return created;
}

export function canvasLocator(page: Page) {
  return page.getByTestId("email-draft-canvas");
}

/** Klaviyo uses `title`; Mailchimp uses `aria-label`. */
export function undoToolbarButton(page: Page) {
  return page.locator('button[title="Undo (Cmd+Z)"], button[aria-label="Undo"]');
}

export async function clickCanvasText(page: Page, text: string): Promise<void> {
  const canvas = canvasLocator(page);
  const heading = canvas.getByRole("heading", { name: text });
  if ((await heading.count()) > 0) {
    await heading.first().click();
  } else {
    await canvas.getByText(text, { exact: false }).first().click();
  }
}

export async function editCanvasTextBlock(
  page: Page,
  currentText: string,
  nextText: string,
): Promise<void> {
  const canvas = canvasLocator(page);
  const heading = canvas.getByRole("heading", { name: currentText });
  if ((await heading.count()) > 0) {
    await heading.first().click();
  } else {
    await canvas.getByText(currentText, { exact: false }).first().click();
  }
  const editor = canvas.getByRole("textbox").first();
  await editor.click();
  // Single input event — Ctrl+A + insertText can emit intermediate empty snapshots
  // that make one Undo step restore the wrong heading text.
  await editor.evaluate((el, text) => {
    el.textContent = text;
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: text }),
    );
  }, nextText);
  await page.keyboard.press("Escape");

  const nextHeading = canvas.getByRole("heading", { name: nextText });
  if ((await nextHeading.count()) > 0) {
    await expect(nextHeading.first()).toBeVisible();
  } else {
    await expect(canvas.getByText(nextText, { exact: false }).first()).toBeVisible();
  }

  await expect(undoToolbarButton(page)).toBeEnabled({
    timeout: 10_000,
  });
}

export async function removeCanvasBlockByText(page: Page, text: string): Promise<void> {
  const canvas = canvasLocator(page);
  const heading = canvas.getByRole("heading", { name: text });
  if ((await heading.count()) > 0) {
    await heading.first().click();
  } else {
    await canvas.getByText(text, { exact: false }).first().click();
  }
  // Selecting a heading swaps h2 → contentEditable; do not re-locate the block shell by
  // hasText — the filter no longer matches. Delete is visible on the selected block.
  await canvas.getByRole("button", { name: "Remove block" }).click();
}

export function mailchimpCommentsPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Comments" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
}

export async function openMailchimpCommentsPanel(page: Page): Promise<void> {
  const toolbar = page.getByRole("button", { name: "Undo" }).locator("xpath=..");
  await toolbar.getByRole("button").nth(2).click();
  await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible({ timeout: 30_000 });
}

/** Mailchimp list link lives under collapsed "Email Draft" in the sidebar; use layout back instead. */
export async function exitMailchimpEditorViaHeaderBack(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Go back" }).click();
}

function authorizedAuthHeadersOnly(): Record<string, string> {
  const { token, organizationAccessToken } = readAuthStorageFromStorageStateFile();
  if (!token) {
    throw new Error(
      `No auth token in ${AUTH_FILE}. Run Playwright setup first: e2e/auth.setup.ts`,
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (organizationAccessToken) {
    headers["X-Organization-Token"] = organizationAccessToken;
  }
  return headers;
}

/** Path from Klaviyo `preview_url` for canvas `src` asserts (API relative, DOM often absolute). */
export function klaviyoPreviewUrlPathForAssert(previewUrl: string): string {
  try {
    if (/^https?:\/\//i.test(previewUrl)) {
      return new URL(previewUrl).pathname;
    }
  } catch {
    // use raw value below
  }
  return previewUrl.startsWith("/") ? previewUrl : `/${previewUrl}`;
}

export async function expectImageSrcMatchesKlaviyoPreview(
  img: Locator,
  previewUrl: string,
): Promise<void> {
  const path = klaviyoPreviewUrlPathForAssert(previewUrl);
  await expect(img).toHaveAttribute("src", expect.stringContaining(path));
}

export async function importKlaviyoImageViaApi(
  page: Page,
  url: string,
  name?: string,
): Promise<{ id: number; preview_url: string; name: string }> {
  const response = await page.request.post(
    `${getApiOrigin(page)}/api/klaviyo/images/import-url/`,
    {
      headers: authorizedRequestHeaders(),
      data: { url, name: name ?? "E2E imported image" },
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: number; preview_url: string; name: string };
  return body;
}

export async function uploadKlaviyoImageViaApi(
  page: Page,
  pngBuffer: Buffer,
  filename = "e2e-upload.png",
): Promise<{ id: number; preview_url: string }> {
  const response = await page.request.post(
    `${getApiOrigin(page)}/api/klaviyo/images/upload/`,
    {
      headers: authorizedAuthHeadersOnly(),
      multipart: {
        file: {
          name: filename,
          mimeType: "image/png",
          buffer: pngBuffer,
        },
        name: filename,
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: number; preview_url: string };
  return body;
}

/** Klaviyo image picker — `KlaviyoImageSelectionModal` title is a div, not a heading. */
export async function expectKlaviyoImageSelectionModalVisible(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Image library" })).toBeVisible({ timeout: 30_000 });
}

export async function expectKlaviyoImageSelectionModalHidden(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Image library" })).not.toBeVisible();
}

/** Pick a library tile by stored name (search narrows grid; use API `name` when MD5 dedup applies). */
export async function selectKlaviyoLibraryImage(page: Page, imageName: string): Promise<void> {
  await page.getByPlaceholder("Search by name or ID").fill(imageName);
  const tile = page.getByRole("button", { name: imageName });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.click();
}

export async function openKlaviyoImageModalForImageBlock(page: Page): Promise<void> {
  await canvasLocator(page).getByTestId("email-draft-image-block").click();
  await expect(page.getByRole("button", { name: "Styles" })).toHaveClass(/border-b-2/);
  await page.getByRole("button", { name: /Select image|Replace image/ }).click();
  await expectKlaviyoImageSelectionModalVisible(page);
}

export async function openKlaviyoImageModalForVideoBlock(page: Page): Promise<void> {
  await canvasLocator(page).getByTestId("email-draft-video-block").click();
  await expect(page.getByRole("button", { name: "Styles" })).toHaveClass(/border-b-2/);
  await page.getByRole("button", { name: /Select image|Replace image/ }).first().click();
  await expectKlaviyoImageSelectionModalVisible(page);
}

/** Canvas HeaderBar block (label is `HeaderBar` or empty-state copy `Header bar`). */
export function klaviyoHeaderBarCanvasBlock(page: Page): Locator {
  return canvasLocator(page).locator(".relative.border").filter({ hasText: /Header\s*bar/i });
}

export async function openKlaviyoImageModalForHeaderBarLogo(page: Page): Promise<void> {
  await klaviyoHeaderBarCanvasBlock(page).click();
  await expect(page.getByRole("button", { name: "Styles" })).toHaveClass(/border-b-2/);
  await page.getByRole("button", { name: /Select logo|Replace logo/ }).click();
  await expectKlaviyoImageSelectionModalVisible(page);
}

export async function selectMailchimpImageBlock(page: Page): Promise<void> {
  await canvasLocator(page).getByTestId("email-draft-image-block").click();
  await expect(page.getByRole("button", { name: "Content" })).toHaveClass(/border-b-2/);
}

export async function openMailchimpContentStudioFromImageInspector(page: Page): Promise<void> {
  await selectMailchimpImageBlock(page);
  const browseImages = page.getByRole("button", { name: "Browse Images" });
  if (await browseImages.isVisible().catch(() => false)) {
    await browseImages.click();
  } else {
    // Empty block: `Add` ▾ → Browse Images. Block with `imageUrl`: `Replace` ▾ → Browse Images.
    const replaceBtn = page.getByRole("button", { name: "Replace" });
    const addBtn = page.getByRole("button", { name: "Add", exact: true });
    if (await replaceBtn.isVisible().catch(() => false)) {
      await replaceBtn.click();
    } else {
      await addBtn.click();
    }
    await expect(browseImages).toBeVisible({ timeout: 10_000 });
    await browseImages.click();
  }
  await expect(page.getByRole("heading", { name: "Content Studio" })).toBeVisible({ timeout: 30_000 });
}

/** File label Content Studio assigns after Import URL (matches `ImportUrlModal` logic). */
export function mailchimpContentStudioFileNameFromUrl(imageUrl: string): string {
  const pathname = new URL(imageUrl).pathname;
  const filename = pathname.split("/").pop() || "image";
  const fileExtension = filename.split(".").pop() || "jpg";
  return filename.includes(".") ? filename : `${filename}.${fileExtension}`;
}

export function mailchimpContentStudioPanel(page: Page): Locator {
  return page.locator(".fixed.inset-0.z-50").filter({
    has: page.getByRole("heading", { name: "Content Studio" }),
  });
}

/** Dismiss Content Studio via header X (icon-only; sibling of title block, not of `h2`). */
export async function closeMailchimpContentStudio(page: Page): Promise<void> {
  const panel = mailchimpContentStudioPanel(page);
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel
    .getByRole("heading", { name: "Content Studio" })
    .locator("xpath=ancestor::div[1]/following-sibling::button")
    .click();
  await expect(page.getByRole("heading", { name: "Content Studio" })).not.toBeVisible({
    timeout: 30_000,
  });
}

export async function pickMailchimpContentStudioFile(page: Page, fileName: string): Promise<void> {
  const panel = mailchimpContentStudioPanel(page);
  const thumbnail = panel.getByRole("img", { name: fileName });
  await expect(thumbnail).toBeVisible({ timeout: 30_000 });
  // `onClick` is on the grid/list row (`div…cursor-pointer`), not the `<img>`.
  // Walk up from the thumbnail — `filter({ has: panel.getByRole('img') })` on the panel
  // often matches zero rows when the panel locator is chained.
  const tile = thumbnail.locator(
    "xpath=ancestor::div[contains(@class,'cursor-pointer')][1]",
  );
  await expect(tile).toBeVisible();
  await tile.click();
}

export async function seedMailchimpContentStudioImportUrl(
  page: Page,
  imageUrl: string,
): Promise<string> {
  await openMailchimpContentStudioFromImageInspector(page);
  await page.locator("div.inline-flex.rounded-lg.overflow-hidden button").nth(1).click();
  await page.getByRole("button", { name: "Import from URL" }).click();
  await expect(page.getByRole("heading", { name: "Import URL" })).toBeVisible();
  await page.getByPlaceholder("https://example.com/image.jpg").fill(imageUrl);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const fileName = mailchimpContentStudioFileNameFromUrl(imageUrl);
  await expect(mailchimpContentStudioPanel(page).getByRole("img", { name: fileName })).toBeVisible({
    timeout: 60_000,
  });
  return fileName;
}
