/**
 * MED-240: Playwright coverage for org-admin override UI.
 *
 * Asserts the Admin override badge surfaces when a budget request is flagged
 * `is_admin_override` (e.g. after a chain-outside org-admin decision).
 * Uses response interception so the badge contract can be verified without a
 * second seeded org-admin account.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  createDraftTaskViaApi,
  deleteTaskById,
  navigateToTasksAndSelectProject,
  waitForTasksPageReady,
  getActiveProjectSlug,
  buildTasksListDrawerUrl,
} from '../tasks/tasks-helpers';

async function waitForDrawerReady(page: Page) {
  await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => !document.querySelector('.animate-pulse'),
    { timeout: 15_000 },
  );
}

/** Patch task / budget payloads so linked budget data exposes the override flag. */
function withAdminOverrideFlag(body: Record<string, unknown>): Record<string, unknown> {
  const linked =
    body.linked_object && typeof body.linked_object === 'object'
      ? { ...(body.linked_object as Record<string, unknown>) }
      : {
          id: body.object_id ?? 1,
          status: body.status ?? 'APPROVED',
          amount: '100.00',
          currency: 'AUD',
          notes: 'E2E override fixture',
        };

  return {
    ...body,
    type: 'budget',
    linked_object: {
      ...linked,
      is_admin_override: true,
    },
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test.describe('Budget admin override badge (MED-240)', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: number;
  let projectSlug: string;
  let taskId: number | null = null;
  let taskSlug: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await ctx.newPage();
    projectId = await navigateToTasksAndSelectProject(page);
    projectSlug = await getActiveProjectSlug(page);
    await ctx.close();
  });

  test.afterEach(async ({ browser }) => {
    if (taskId == null) return;
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto(`/projects/${encodeURIComponent(projectSlug)}/tasks`);
    await waitForTasksPageReady(page);
    await deleteTaskById(page, taskId).catch(() => {});
    await ctx.close();
    taskId = null;
    taskSlug = null;
  });

  test('shows Admin override badge when budget linked_object is_admin_override', async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectSlug)}/tasks`);
    await waitForTasksPageReady(page);

    const fixture = await createDraftTaskViaApi(
      page,
      projectId,
      `E2E MED-240 admin override ${Date.now()}`,
      { type: 'budget' },
    );
    taskId = fixture.id;
    taskSlug = fixture.slug;

    await page.route(`**/api/tasks/${taskId}/**`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const data = (await response.json()) as Record<string, unknown>;
      await fulfillJson(route, withAdminOverrideFlag(data));
    });

    // Also cover legacy BudgetRequestDetail fetch path
    await page.route('**/api/budgets/requests/**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const data = (await response.json()) as Record<string, unknown>;
      await fulfillJson(route, { ...data, is_admin_override: true, status: data.status ?? 'APPROVED' });
    });

    await page.goto(buildTasksListDrawerUrl(projectSlug, taskSlug!));
    await waitForDrawerReady(page);

    await expect(page.getByTestId('admin-override-badge').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('admin-override-badge').first()).toHaveText(/admin override/i);
  });

  test('does not show Admin override badge for a normal budget draft', async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectSlug)}/tasks`);
    await waitForTasksPageReady(page);

    const fixture = await createDraftTaskViaApi(
      page,
      projectId,
      `E2E MED-240 no override ${Date.now()}`,
      { type: 'budget' },
    );
    taskId = fixture.id;
    taskSlug = fixture.slug;

    await page.goto(buildTasksListDrawerUrl(projectSlug, taskSlug!));
    await waitForDrawerReady(page);

    await expect(page.locator('section', { hasText: /budget details/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('admin-override-badge')).toHaveCount(0);
  });
});
